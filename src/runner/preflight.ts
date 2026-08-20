import { CheckStatus, CheckResult } from '../core/types.ts';
import { LocalMockServer } from '../mock-service/mock-server.ts';

export interface PreflightReport {
  overallStatus: CheckStatus;
  suggestedRunState: 'READY' | 'BLOCKED' | 'BOOTSTRAPPING' | 'ENVIRONMENT_FAILED';
  summary: string;
  results: CheckResult[];
  executedAt: string;
}

/**
 * Sanitizes any potential secret fields, auth tokens, or sensitive headers from evidence payloads.
 * Operates recursively on nested objects and arrays without leaking prefix characters.
 */
export function sanitizeEvidence(rawPayload: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!rawPayload || typeof rawPayload !== 'object') return {};
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawPayload)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      lowerKey.includes('auth') ||
      lowerKey.includes('cookie') ||
      lowerKey.includes('key') ||
      lowerKey.includes('credential') ||
      lowerKey.includes('bearer')
    ) {
      sanitized[key] = '[REDACTED_SECRET]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeEvidence(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        item && typeof item === 'object' ? sanitizeEvidence(item as Record<string, unknown>) : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Deterministic Preflight Checks Runner against local mock service.
 */
export class PreflightRunner {
  private mockServer: LocalMockServer;

  constructor(mockServer: LocalMockServer) {
    this.mockServer = mockServer;
  }

  /**
   * Check 1: Reachability
   */
  public async checkReachability(_timeoutMs: number = 2000): Promise<CheckResult> {
    const start = Date.now();
    try {
      const res = await this.mockServer.getPing();
      const duration = Date.now() - start;
      const pass = res.status === 200 && res.data.reachable;

      return {
        checkId: 'chk_reachability',
        name: 'Target Base URL Reachability',
        status: pass ? CheckStatus.PASS : CheckStatus.BLOCK,
        evidence: {
          statusCode: res.status,
          responseTimeMs: duration,
          details: pass ? 'Target mock server reachable' : 'Target URL unreachable',
          payloadSnippet: sanitizeEvidence(res.data),
        },
        timestamp: new Date().toISOString(),
        remediation: pass ? undefined : 'Verify network connectivity and base URL configuration.',
      };
    } catch (err: unknown) {
      return {
        checkId: 'chk_reachability',
        name: 'Target Base URL Reachability',
        status: CheckStatus.BLOCK,
        evidence: {
          details: err instanceof Error ? err.message : 'Network error connecting to endpoint',
        },
        timestamp: new Date().toISOString(),
        remediation: 'Check local mock service status and ensure port is accessible.',
      };
    }
  }

  /**
   * Check 2: Service Health
   */
  public async checkHealth(_timeoutMs: number = 2000): Promise<CheckResult> {
    const start = Date.now();
    try {
      const res = await this.mockServer.getHealth();
      const duration = Date.now() - start;
      const isHealthy = res.status === 200;

      return {
        checkId: 'chk_health',
        name: 'Service Health Status',
        status: isHealthy ? CheckStatus.PASS : CheckStatus.BLOCK,
        evidence: {
          statusCode: res.status,
          responseTimeMs: duration,
          details: isHealthy ? 'Service healthy (HTTP 200)' : `Service degraded with status ${res.status}`,
          payloadSnippet: sanitizeEvidence(res.data),
        },
        timestamp: new Date().toISOString(),
        remediation: isHealthy ? undefined : 'Target service is down or degraded. Pause test run until restored.',
      };
    } catch (err: unknown) {
      return {
        checkId: 'chk_health',
        name: 'Service Health Status',
        status: CheckStatus.ERROR,
        evidence: {
          details: err instanceof Error ? err.message : 'Health check failed',
        },
        timestamp: new Date().toISOString(),
        remediation: 'Inspect service logs and verify API container health.',
      };
    }
  }

  /**
   * Check 3: Authentication & Token Validity
   */
  public async checkAuthentication(_timeoutMs: number = 2000): Promise<CheckResult> {
    const start = Date.now();
    try {
      const res = await this.mockServer.getAuth();
      const duration = Date.now() - start;
      const isAuth = res.status === 200 && res.data.authenticated;

      return {
        checkId: 'chk_auth',
        name: 'Service Account Authentication',
        status: isAuth ? CheckStatus.PASS : CheckStatus.BLOCK,
        evidence: {
          statusCode: res.status,
          responseTimeMs: duration,
          details: isAuth ? 'Authentication token valid' : 'Authentication failed / token expired',
          payloadSnippet: sanitizeEvidence(res.data),
        },
        timestamp: new Date().toISOString(),
        remediation: isAuth ? undefined : 'Rotate or refresh the test runner service-account credentials.',
      };
    } catch (err: unknown) {
      return {
        checkId: 'chk_auth',
        name: 'Service Account Authentication',
        status: CheckStatus.ERROR,
        evidence: {
          details: err instanceof Error ? err.message : 'Auth verification error',
        },
        timestamp: new Date().toISOString(),
        remediation: 'Inspect authentication provider or mock auth configuration.',
      };
    }
  }

  /**
   * Check 4: Required Seed Records Lookup
   */
  public async checkRequiredRecords(_timeoutMs: number = 2000): Promise<CheckResult> {
    const start = Date.now();
    try {
      const res = await this.mockServer.getRequiredRecords();
      const duration = Date.now() - start;
      const hasRecords = res.status === 200 && res.data.found;

      return {
        checkId: 'chk_records',
        name: 'Prerequisite Test Seed Records',
        status: hasRecords ? CheckStatus.PASS : CheckStatus.WARN,
        evidence: {
          statusCode: res.status,
          responseTimeMs: duration,
          details: hasRecords
            ? `Found ${res.data.count} prerequisite test record(s)`
            : 'Prerequisite test seed records missing (HTTP 404)',
          payloadSnippet: sanitizeEvidence(res.data),
        },
        timestamp: new Date().toISOString(),
        remediation: hasRecords
          ? undefined
          : 'Trigger approved bootstrap setup action to create missing prerequisite entities.',
      };
    } catch (err: unknown) {
      return {
        checkId: 'chk_records',
        name: 'Prerequisite Test Seed Records',
        status: CheckStatus.ERROR,
        evidence: {
          details: err instanceof Error ? err.message : 'Record query error',
        },
        timestamp: new Date().toISOString(),
        remediation: 'Verify data store access or tenant configuration.',
      };
    }
  }

  /**
   * Check 5: Feature Flag Configuration
   */
  public async checkFeatureFlags(requiredFlagKey: string = 'e2e-suite-enabled'): Promise<CheckResult> {
    const start = Date.now();
    try {
      const res = await this.mockServer.getFeatureFlags();
      const duration = Date.now() - start;
      const flags = res.data.flags || {};
      const isEnabled = Boolean(flags[requiredFlagKey]);

      return {
        checkId: 'chk_feature_flags',
        name: 'Feature Flag Configuration',
        status: isEnabled ? CheckStatus.PASS : CheckStatus.WARN,
        evidence: {
          statusCode: res.status,
          responseTimeMs: duration,
          details: isEnabled
            ? `Required flag '${requiredFlagKey}' is enabled`
            : `Required flag '${requiredFlagKey}' is missing or disabled`,
          payloadSnippet: sanitizeEvidence(res.data),
        },
        timestamp: new Date().toISOString(),
        remediation: isEnabled ? undefined : `Enable feature flag '${requiredFlagKey}' in test environment settings.`,
      };
    } catch (err: unknown) {
      return {
        checkId: 'chk_feature_flags',
        name: 'Feature Flag Configuration',
        status: CheckStatus.ERROR,
        evidence: {
          details: err instanceof Error ? err.message : 'Feature flag check error',
        },
        timestamp: new Date().toISOString(),
        remediation: 'Check feature flag service configuration.',
      };
    }
  }

  /**
   * Runs the complete preflight check suite and computes overall run disposition.
   */
  public async runAll(): Promise<PreflightReport> {
    const results: CheckResult[] = [];

    const reachability = await this.checkReachability();
    results.push(reachability);

    const health = await this.checkHealth();
    results.push(health);

    const auth = await this.checkAuthentication();
    results.push(auth);

    const records = await this.checkRequiredRecords();
    results.push(records);

    const flags = await this.checkFeatureFlags();
    results.push(flags);

    // Compute overall classification deterministically
    const hasBlock = results.some((r) => r.status === CheckStatus.BLOCK);
    const hasError = results.some((r) => r.status === CheckStatus.ERROR);
    const hasWarn = results.some((r) => r.status === CheckStatus.WARN);

    let overallStatus: CheckStatus = CheckStatus.PASS;
    let suggestedRunState: PreflightReport['suggestedRunState'] = 'READY';
    let summary = 'All preflight environment checks passed successfully.';

    if (hasBlock || hasError) {
      overallStatus = hasBlock ? CheckStatus.BLOCK : CheckStatus.ERROR;
      suggestedRunState = 'BLOCKED';
      summary = 'Environment preflight checks blocked: critical service outage or expired authentication.';
    } else if (hasWarn) {
      overallStatus = CheckStatus.WARN;
      suggestedRunState = 'BOOTSTRAPPING';
      summary = 'Preflight warnings detected (e.g. missing seed records). Approved bootstrap setup recommended.';
    }

    return {
      overallStatus,
      suggestedRunState,
      summary,
      results,
      executedAt: new Date().toISOString(),
    };
  }
}
