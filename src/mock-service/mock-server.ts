import { MOCK_SCENARIOS, MockScenario } from './fixtures.ts';

export interface MockHttpResponse<T = Record<string, unknown>> {
  status: number;
  data: T;
  latencyMs: number;
}

/**
 * In-memory deterministic mock server handler.
 * Provides instant, zero-network-dependency responses for preflight checks.
 * Completely isolated from production systems and real networks.
 */
export class LocalMockServer {
  private activeScenario: MockScenario;
  private dynamicRecords: { id: string; name: string }[] = [];

  constructor(scenarioId: string = 'HEALTHY') {
    this.activeScenario = MOCK_SCENARIOS[scenarioId] || MOCK_SCENARIOS.HEALTHY;
    this.dynamicRecords = [...this.activeScenario.records];
  }

  public setScenario(scenarioId: string): void {
    this.activeScenario = MOCK_SCENARIOS[scenarioId] || MOCK_SCENARIOS.HEALTHY;
    this.resetState();
  }

  public resetState(): void {
    this.dynamicRecords = [...this.activeScenario.records];
  }

  public getActiveScenario(): MockScenario {
    return this.activeScenario;
  }

  /**
   * Ping / reachability check endpoint
   */
  public async getPing(): Promise<MockHttpResponse<{ reachable: boolean; timestamp: string }>> {
    return {
      status: 200,
      data: {
        reachable: true,
        timestamp: new Date().toISOString(),
      },
      latencyMs: 5,
    };
  }

  /**
   * Health status endpoint (200 Healthy vs 503 Degraded)
   */
  public async getHealth(): Promise<MockHttpResponse<{ status: string; service: string; timestamp: string }>> {
    const isHealthy = this.activeScenario.healthStatus === 200;
    return {
      status: this.activeScenario.healthStatus,
      data: {
        status: isHealthy ? 'healthy' : 'degraded',
        service: 'mock-target-api',
        timestamp: new Date().toISOString(),
      },
      latencyMs: 12,
    };
  }

  /**
   * Authentication validation endpoint (200 Authenticated vs 401 Expired)
   */
  public async getAuth(): Promise<MockHttpResponse<{ authenticated: boolean; identity?: string; error?: string }>> {
    const isOk = this.activeScenario.authStatus === 200;
    return {
      status: this.activeScenario.authStatus,
      data: isOk
        ? { authenticated: true, identity: 'mock-service-account-e2e' }
        : { authenticated: false, error: 'Token expired or invalid signature' },
      latencyMs: 18,
    };
  }

  /**
   * Feature flags endpoint
   */
  public async getFeatureFlags(): Promise<MockHttpResponse<{ flags: Record<string, boolean> }>> {
    return {
      status: 200,
      data: { flags: this.activeScenario.featureFlags },
      latencyMs: 8,
    };
  }

  /**
   * Required seed records lookup (200 Found vs 404 Missing)
   */
  public async getRequiredRecords(): Promise<
    MockHttpResponse<{ found: boolean; count: number; records: { id: string; name: string }[] }>
  > {
    const hasRequired = this.dynamicRecords.length > 0;
    return {
      status: hasRequired ? 200 : 404,
      data: {
        found: hasRequired,
        count: this.dynamicRecords.length,
        records: this.dynamicRecords,
      },
      latencyMs: 15,
    };
  }

  /**
   * Seed record creation endpoint (201 Created vs 500 Setup Failure)
   */
  public async createSeedRecord(
    name: string
  ): Promise<MockHttpResponse<{ created?: boolean; record?: { id: string; name: string }; error?: string }>> {
    if (!this.activeScenario.setupWillSucceed) {
      return {
        status: 500,
        data: { error: 'Mock bootstrap setup failed: simulated dependency error' },
        latencyMs: 35,
      };
    }

    const newRecord = {
      id: `seed_rec_${Date.now()}`,
      name,
    };
    this.dynamicRecords.push(newRecord);
    return {
      status: 201,
      data: { created: true, record: newRecord },
      latencyMs: 30,
    };
  }

  /**
   * Record deletion / teardown endpoint (200 Deleted vs 500 Teardown Failure)
   */
  public async deleteRecord(id: string): Promise<MockHttpResponse<{ deleted?: boolean; id?: string; error?: string }>> {
    if (!this.activeScenario.cleanupWillSucceed) {
      return {
        status: 500,
        data: { error: 'Mock teardown failed: resource locked or simulated network timeout' },
        latencyMs: 25,
      };
    }

    this.dynamicRecords = this.dynamicRecords.filter((r) => r.id !== id);
    return {
      status: 200,
      data: { deleted: true, id },
      latencyMs: 20,
    };
  }
}
