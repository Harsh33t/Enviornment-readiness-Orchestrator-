import { describe, it, expect, beforeEach } from 'vitest';
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

  it('handles partial setup failure gracefully', async () => {
    mockServer.setScenario('PARTIAL_SETUP_FAILURE');

    const { actionResult, createdResource } = await executor.executeAction(validAction);

    expect(actionResult.success).toBe(false);
    expect(actionResult.statusCode).toBe(500);
    expect(actionResult.error).toContain('Mock bootstrap setup failed');
    expect(createdResource).toBeUndefined();
  });
});
