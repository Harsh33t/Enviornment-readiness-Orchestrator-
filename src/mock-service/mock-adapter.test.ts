import { describe, it, expect } from 'vitest';
import { LocalMockServer } from './mock-server.ts';
import { MockEnvironmentAdapter } from './mock-adapter.ts';
import { CheckStatus, ActionType } from '../core/types.ts';

describe('MockEnvironmentAdapter Boundary', () => {
  it('executes check requests through typed interface', async () => {
    const server = new LocalMockServer('HEALTHY');
    const adapter = new MockEnvironmentAdapter(server);

    expect(adapter.adapterName).toContain('MockEnvironmentAdapter');

    const pingRes = await adapter.executeCheck({
      definition: {
        id: 'chk_ping',
        name: 'Ping',
        category: 'reachability',
        purpose: 'Verify ping',
        endpoint: '/ping',
        expectedStatus: 200,
        timeoutMs: 2000,
        remediation: '',
      },
      timeoutMs: 2000,
    });

    expect(pingRes.status).toBe(CheckStatus.PASS);
    expect(pingRes.statusCode).toBe(200);

    const authRes = await adapter.executeCheck({
      definition: {
        id: 'chk_auth',
        name: 'Auth',
        category: 'auth',
        purpose: 'Verify auth',
        endpoint: '/auth',
        expectedStatus: 200,
        timeoutMs: 2000,
        remediation: '',
      },
      timeoutMs: 2000,
    });

    expect(authRes.status).toBe(CheckStatus.PASS);
  });

  it('executes setup and teardown actions through typed interface', async () => {
    const server = new LocalMockServer('MISSING_PREREQUISITE');
    const adapter = new MockEnvironmentAdapter(server);

    const setupRes = await adapter.executeSetupAction({
      action: {
        id: 'act_seed',
        name: 'Seed',
        type: ActionType.MOCK_API_REQUEST,
        endpoint: '/records/seed',
        targetResourceName: 'seed_usr',
        timeoutMs: 2000,
        maxRetries: 1,
      },
      timeoutMs: 2000,
    });

    expect(setupRes.success).toBe(true);
    expect(setupRes.createdResource?.name).toBe('seed_usr');

    const tdRes = await adapter.executeTeardownAction({
      action: {
        id: 'td_seed',
        name: 'Teardown',
        resourceId: 'seed_usr',
        endpoint: '/records/seed',
        method: 'DELETE',
      },
      timeoutMs: 2000,
    });

    expect(tdRes.success).toBe(true);
  });
});
