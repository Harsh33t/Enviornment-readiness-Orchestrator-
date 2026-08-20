import { describe, it, expect, beforeEach } from 'vitest';
import { LocalMockServer } from '../mock-service/mock-server.ts';
import { ResourceLedger } from './teardown.ts';
import { ResourceRecord, TeardownAction } from '../core/types.ts';

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
});
