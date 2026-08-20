import { EnvironmentAdapter, CheckRequest, CheckResponse, SetupRequest, SetupResponse, TeardownRequest, TeardownResponse } from '../core/adapter.ts';
import { CheckStatus, ActionType } from '../core/types.ts';
import { LocalMockServer } from './mock-server.ts';

/**
 * Concrete offline mock implementation of EnvironmentAdapter.
 * Executes profile-declared checks and setup/teardown actions safely against LocalMockServer.
 */
export class MockEnvironmentAdapter implements EnvironmentAdapter {
  public readonly adapterName = 'MockEnvironmentAdapter (Isolated In-Memory)';
  private server: LocalMockServer;

  constructor(server: LocalMockServer) {
    this.server = server;
  }

  public async executeCheck(req: CheckRequest): Promise<CheckResponse> {
    const { definition } = req;
    const endpoint = definition.endpoint;

    if (endpoint === '/ping') {
      const res = await this.server.getPing();
      return {
        status: res.status === definition.expectedStatus ? CheckStatus.PASS : CheckStatus.BLOCK,
        statusCode: res.status,
        responseTimeMs: res.latencyMs,
        details: 'Mock server reachability verified',
        payload: res.data,
      };
    }

    if (endpoint === '/health') {
      const res = await this.server.getHealth();
      const isPass = res.status === definition.expectedStatus;
      return {
        status: isPass ? CheckStatus.PASS : CheckStatus.BLOCK,
        statusCode: res.status,
        responseTimeMs: res.latencyMs,
        details: isPass ? 'Mock service healthy' : 'Service degraded (503)',
        payload: res.data,
      };
    }

    if (endpoint === '/auth') {
      const res = await this.server.getAuth();
      const isPass = res.status === definition.expectedStatus;
      return {
        status: isPass ? CheckStatus.PASS : CheckStatus.BLOCK,
        statusCode: res.status,
        responseTimeMs: res.latencyMs,
        details: isPass ? 'Authentication token valid' : 'Authentication expired (401)',
        payload: res.data,
      };
    }

    if (endpoint === '/records' || endpoint.startsWith('/records')) {
      const res = await this.server.getRequiredRecords();
      const isPass = res.status === definition.expectedStatus;
      return {
        status: isPass ? CheckStatus.PASS : CheckStatus.WARN,
        statusCode: res.status,
        responseTimeMs: res.latencyMs,
        details: isPass ? 'Required prerequisite records exist' : 'Missing seed data records (404)',
        payload: res.data,
      };
    }

    if (endpoint === '/flags') {
      const res = await this.server.getFeatureFlags();
      const isPass = res.status === definition.expectedStatus;
      return {
        status: isPass ? CheckStatus.PASS : CheckStatus.BLOCK,
        statusCode: res.status,
        responseTimeMs: res.latencyMs,
        details: isPass ? 'Feature flags enabled' : 'Required feature flags disabled',
        payload: res.data,
      };
    }

    // Default handler for arbitrary profile-defined mock endpoints
    return {
      status: CheckStatus.PASS,
      statusCode: 200,
      responseTimeMs: 10,
      details: `Mock check executed for endpoint '${endpoint}'`,
      payload: { endpoint, mockHandled: true },
    };
  }

  public async executeSetupAction(req: SetupRequest): Promise<SetupResponse> {
    const { action } = req;

    if (action.type === ActionType.MOCK_API_REQUEST) {
      const res = await this.server.createSeedRecord(action.targetResourceName);
      if (res.status === 201 && res.data.record) {
        return {
          success: true,
          statusCode: res.status,
          createdResource: res.data.record,
          details: res.data,
        };
      }
      return {
        success: false,
        statusCode: res.status,
        error: (res.data.error as string) || `Mock API returned status ${res.status}`,
        details: res.data,
      };
    }

    if (action.type === ActionType.LOCAL_MODULE) {
      return {
        success: true,
        statusCode: 200,
        createdResource: { id: `mod_${Date.now()}`, name: action.targetResourceName },
        details: { moduleExecuted: action.name },
      };
    }

    return {
      success: false,
      statusCode: 400,
      error: `Unsupported action type '${action.type}'`,
    };
  }

  public async executeTeardownAction(req: TeardownRequest): Promise<TeardownResponse> {
    const { action } = req;
    const res = await this.server.deleteRecord(action.resourceId);

    if (res.status === 200) {
      return {
        success: true,
        statusCode: res.status,
      };
    }

    return {
      success: false,
      statusCode: res.status,
      error: (res.data.error as string) || `Mock deletion failed with status ${res.status}`,
    };
  }
}
