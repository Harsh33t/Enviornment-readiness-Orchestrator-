import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalMockServer } from '../mock-service/mock-server.ts';
import { BootstrapExecutor } from './bootstrap.ts';
import { SetupAction, ActionType } from '../core/types.ts';

describe('BootstrapExecutor Safety & Execution', () => {
  let mockServer: LocalMockServer;
  let executor: BootstrapExecutor;

  beforeEach(() => {
    mockServer = new LocalMockServer('HEALTHY');
    executor = new BootstrapExecutor(mockServer);
  });

  const validAction: SetupAction = {
    id: 'act_seed_rec',
    name: 'Seed Test Record',
    type: ActionType.MOCK_API_REQUEST,
    endpoint: '/records/seed',
    targetResourceName: 'seed_entity_user',
    timeoutMs: 3000,
    maxRetries: 2,
  };

  it('executes valid MOCK_API_REQUEST and records created resource', async () => {
    const { actionResult, createdResource } = await executor.executeAction(validAction);

    expect(actionResult.success).toBe(true);
    expect(actionResult.statusCode).toBe(201);
    expect(createdResource).toBeDefined();
    expect(createdResource?.resourceKey).toBe('seed_entity_user');
  });

  it('executes valid LOCAL_MODULE action type', async () => {
    const moduleAction: SetupAction = {
      ...validAction,
      id: 'act_local_mod',
      type: ActionType.LOCAL_MODULE,
    };

    const { actionResult, createdResource } = await executor.executeAction(moduleAction);

    expect(actionResult.success).toBe(true);
    expect(createdResource?.resourceType).toBe('LOCAL_MODULE_RESOURCE');
  });

  it('enforces timeout and retries when mock handler delays beyond configured timeoutMs', async () => {
    // Mock server method that simulates delayed hanging response
    let callCount = 0;
    vi.spyOn(mockServer, 'createSeedRecord').mockImplementation(() => {
      callCount++;
      return new Promise((resolve) => {
        // Delay 300ms, whereas action timeout is 100ms
        setTimeout(() => {
          resolve({
            status: 201,
            data: { created: true, record: { id: 'rec_delayed', name: 'delayed' } },
            latencyMs: 300,
          });
        }, 300);
      });
    });

    const timeoutAction: SetupAction = {
      ...validAction,
      id: 'act_timeout_test',
      timeoutMs: 100, // 100ms timeout
      maxRetries: 2,  // 2 retries (3 total attempts)
    };

    const { actionResult } = await executor.executeAction(timeoutAction);

    expect(actionResult.success).toBe(false);
    expect(actionResult.error).toContain('timed out after 100ms');
    expect(actionResult.retriesAttempted).toBe(2);
    expect(callCount).toBe(3); // 1 initial + 2 retries
  });

  it('rejects duplicate execution of the same action in a session', async () => {
    await executor.executeAction(validAction);

    await expect(executor.executeAction(validAction)).rejects.toThrowError(
      /Duplicate execution rejected/
    );
  });

  it('rejects unapproved action types', () => {
    const unsafeAction: SetupAction = {
      ...validAction,
      id: 'act_unsafe',
      type: 'EXECUTE_BASH_SCRIPT' as unknown as ActionType,
    };

    expect(() => executor.validateAction(unsafeAction)).toThrowError(/not an approved safe action type/);
  });

  it('rejects excessive timeouts and unbounded retries', () => {
    const excessiveTimeout: SetupAction = {
      ...validAction,
      timeoutMs: 120000,
    };
    expect(() => executor.validateAction(excessiveTimeout)).toThrowError(/outside allowed bounds/);

    const excessiveRetries: SetupAction = {
      ...validAction,
      maxRetries: 10,
    };
    expect(() => executor.validateAction(excessiveRetries)).toThrowError(/exceeds safety limit/);
  });

  it('rejects invalid endpoints that are not relative mock paths', () => {
    const nonRelativeAction: SetupAction = {
      ...validAction,
      id: 'act_non_relative',
      endpoint: 'https://production-api.com/v1/seed',
    };

    expect(() => executor.validateAction(nonRelativeAction)).toThrowError(/must be a local relative path/);
  });

  it('handles partial setup failure gracefully and counts exact retries', async () => {
    mockServer.setScenario('PARTIAL_SETUP_FAILURE');

    const retryAction: SetupAction = {
      ...validAction,
      id: 'act_partial_retry',
      maxRetries: 2,
    };

    const { actionResult, createdResource } = await executor.executeAction(retryAction);

    expect(actionResult.success).toBe(false);
    expect(actionResult.statusCode).toBe(500);
    expect(actionResult.error).toContain('Mock bootstrap setup failed');
    expect(actionResult.retriesAttempted).toBe(2);
    expect(createdResource).toBeUndefined();
  });
});
