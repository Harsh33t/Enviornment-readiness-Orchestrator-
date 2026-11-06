import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalMockServer } from '../mock-service/mock-server.ts';
import { ResourceLedger } from './teardown.ts';
import { ResourceRecord, TeardownAction } from '../core/types.ts';
import type { EnvironmentAdapter } from '../core/adapter.ts';

describe('ResourceLedger & Idempotent Teardown', () => {
  let mockServer: LocalMockServer;
  let ledger: ResourceLedger;

  beforeEach(() => {
    mockServer = new LocalMockServer('HEALTHY');
    ledger = new ResourceLedger(mockServer);
  });

  const mockResource1: ResourceRecord = {
    id: 'res_opaque_001',
    resourceType: 'MOCK_SEED_USER',
    resourceKey: 'usr_test_alpha',
    createdViaActionId: 'act_seed_user',
    createdAt: new Date().toISOString(),
    teardownStatus: 'ACTIVE',
  };

  const mockResource2: ResourceRecord = {
    id: 'res_opaque_002',
    resourceType: 'MOCK_SEED_WORKSPACE',
    resourceKey: 'ws_test_alpha',
    createdViaActionId: 'act_seed_workspace',
    createdAt: new Date().toISOString(),
    teardownStatus: 'ACTIVE',
  };

  const tdAction: TeardownAction = {
    id: 'td_act_001',
    name: 'Delete Mock User',
    resourceId: 'res_opaque_001',
    endpoint: '/records/seed',
    method: 'DELETE',
  };

  it('registers resources accurately in the ledger without secrets', () => {
    ledger.registerResource(mockResource1, tdAction);

    const entries = ledger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].resource.id).toBe('res_opaque_001');
    expect(entries[0].resource.resourceType).toBe('MOCK_SEED_USER');
    expect(entries[0].resource.teardownStatus).toBe('ACTIVE');
    expect(entries[0].teardownAction?.method).toBe('DELETE');
  });

  it('executes idempotent teardown across registered resources', async () => {
    ledger.registerResource(mockResource1, tdAction);
    ledger.registerResource(mockResource2);

    expect(ledger.getActiveResources()).toHaveLength(2);

    // First teardown run
    const firstSummary = await ledger.executeTeardown();
    expect(firstSummary.success).toBe(true);
    expect(firstSummary.cleanedCount).toBe(2);
    expect(firstSummary.failedCount).toBe(0);
    expect(ledger.getActiveResources()).toHaveLength(0);

    // Repeated teardown run (idempotency test)
    const secondSummary = await ledger.executeTeardown();
    expect(secondSummary.success).toBe(true);
    expect(secondSummary.cleanedCount).toBe(2);
    expect(secondSummary.failedCount).toBe(0);
  });

  it('handles teardown failure, marks status FAILED, and identifies exact resource', async () => {
    mockServer.setScenario('CLEANUP_FAILURE');

    ledger.registerResource(mockResource1, tdAction);

    const summary = await ledger.executeTeardown();

    expect(summary.success).toBe(false);
    expect(summary.failedCount).toBe(1);
    expect(summary.failedResources).toHaveLength(1);
    expect(summary.failedResources[0].id).toBe('res_opaque_001');
    expect(summary.failedResources[0].error).toContain('Mock teardown failed');
    expect(ledger.getEntries()[0].resource.teardownStatus).toBe('FAILED');
  });

  it('guarantees partial setup cleanup without leaving resources active', async () => {
    // Simulate partial setup where Resource 1 was created before Step 2 failed
    ledger.registerResource(mockResource1, tdAction);

    expect(ledger.getActiveResources()).toHaveLength(1);

    // Teardown is invoked after partial setup failure
    const summary = await ledger.executeTeardown();

    expect(summary.success).toBe(true);
    expect(summary.cleanedCount).toBe(1);
    expect(ledger.getActiveResources()).toHaveLength(0);
    expect(ledger.getEntries()[0].resource.teardownStatus).toBe('CLEANED');
  });

  it('retries transient DELETE failures with exponential backoff and records attempts', async () => {
    const executeTeardownAction = vi.fn()
      .mockRejectedValueOnce(new Error('temporary network timeout'))
      .mockResolvedValueOnce({ success: false, statusCode: 503, error: 'temporary service failure' })
      .mockResolvedValueOnce({ success: true, statusCode: 200 });
    const wait = vi.fn(async (_delayMs: number) => {});
    const adapter: EnvironmentAdapter = {
      adapterName: 'retry-test',
      executeCheck: vi.fn(),
      executeSetupAction: vi.fn(),
      executeTeardownAction,
    };
    const retryLedger = new ResourceLedger(adapter, { maxAttempts: 3, baseDelayMs: 10, wait });
    retryLedger.registerResource(mockResource1, tdAction);

    const summary = await retryLedger.executeTeardown();

    expect(executeTeardownAction).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map(([delay]) => delay)).toEqual([10, 20]);
    expect(summary).toMatchObject({ success: true, cleanedCount: 1, failedCount: 0, totalAttempts: 3 });
    expect(retryLedger.getEntry(mockResource1.id)).toMatchObject({ attemptCount: 3, resource: { teardownStatus: 'CLEANED' } });
  });

  it('stops after the bounded retry limit and includes attempt count in failed resources', async () => {
    const executeTeardownAction = vi.fn().mockResolvedValue({ success: false, statusCode: 503, error: 'service unavailable' });
    const wait = vi.fn(async (_delayMs: number) => {});
    const adapter: EnvironmentAdapter = {
      adapterName: 'retry-test',
      executeCheck: vi.fn(),
      executeSetupAction: vi.fn(),
      executeTeardownAction,
    };
    const retryLedger = new ResourceLedger(adapter, { maxAttempts: 3, baseDelayMs: 5, wait });
    retryLedger.registerResource(mockResource1, tdAction);

    const summary = await retryLedger.executeTeardown();

    expect(executeTeardownAction).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map(([delay]) => delay)).toEqual([5, 10]);
    expect(summary).toMatchObject({ success: false, failedCount: 1, totalAttempts: 3, failedResources: [{ id: mockResource1.id, error: 'service unavailable', attempts: 3 }] });
    expect(retryLedger.getEntry(mockResource1.id)?.resource.teardownStatus).toBe('FAILED');
  });

  it('hard-caps configured retries and each backoff delay', async () => {
    const executeTeardownAction = vi.fn().mockResolvedValue({ success: false, statusCode: 503, error: 'service unavailable' });
    const wait = vi.fn(async (_delayMs: number) => {});
    const adapter: EnvironmentAdapter = {
      adapterName: 'retry-test',
      executeCheck: vi.fn(),
      executeSetupAction: vi.fn(),
      executeTeardownAction,
    };
    const retryLedger = new ResourceLedger(adapter, { maxAttempts: 100, baseDelayMs: 10_000, wait });
    retryLedger.registerResource(mockResource1, tdAction);

    const summary = await retryLedger.executeTeardown();

    expect(executeTeardownAction).toHaveBeenCalledTimes(5);
    expect(wait.mock.calls.map(([delay]) => delay)).toEqual([5000, 5000, 5000, 5000]);
    expect(summary.totalAttempts).toBe(5);
  });

  it('does not retry permanent HTTP errors or non-idempotent POST cleanup actions', async () => {
    const executeTeardownAction = vi.fn().mockResolvedValue({ success: false, statusCode: 400, error: 'invalid cleanup request' });
    const wait = vi.fn(async (_delayMs: number) => {});
    const adapter: EnvironmentAdapter = {
      adapterName: 'retry-test',
      executeCheck: vi.fn(),
      executeSetupAction: vi.fn(),
      executeTeardownAction,
    };
    const retryLedger = new ResourceLedger(adapter, { maxAttempts: 5, baseDelayMs: 5, wait });
    retryLedger.registerResource(mockResource1, tdAction);
    retryLedger.registerResource(mockResource2, { ...tdAction, id: 'post-action', resourceId: mockResource2.id, method: 'POST' });

    const summary = await retryLedger.executeTeardown();

    expect(executeTeardownAction).toHaveBeenCalledTimes(2);
    expect(wait).not.toHaveBeenCalled();
    expect(summary.totalAttempts).toBe(2);
    expect(summary.failedResources.map(item => item.attempts)).toEqual([1, 1]);
  });
});
