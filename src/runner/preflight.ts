import { CheckStatus, CheckResult, EnvironmentProfile, CheckDefinition } from '../core/types.ts';
import { EnvironmentAdapter } from '../core/adapter.ts';
import { LocalMockServer } from '../mock-service/mock-server.ts';
import { MockEnvironmentAdapter } from '../mock-service/mock-adapter.ts';

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

const DEFAULT_CHECKS: CheckDefinition[] = [
  {
    id: 'chk_reachability',
    name: 'Target Mock Base Reachability',
    category: 'reachability',
    purpose: 'Verify target mock server is online',
    endpoint: '/ping',
    expectedStatus: 200,
    timeoutMs: 2000,
    remediation: 'Check mock service process',
  },
  {
    id: 'chk_health',
    name: 'Service Health Status',
    category: 'health',
    purpose: 'Verify service health status',
    endpoint: '/health',
    expectedStatus: 200,
    timeoutMs: 2000,
    remediation: 'Inspect mock service container',
  },
  {
    id: 'chk_auth',
    name: 'Service Account Auth',
    category: 'auth',
    purpose: 'Verify auth token validity',
    endpoint: '/auth',
    expectedStatus: 200,
    timeoutMs: 2000,
    remediation: 'Refresh service account mock credentials',
  },
  {
    id: 'chk_records',
    name: 'Prerequisite Test Seed Records',
    category: 'data',
    purpose: 'Check required test records exist',
    endpoint: '/records',
    expectedStatus: 200,
    timeoutMs: 2000,
    remediation: 'Run approved bootstrap setup action',
  },
  {
    id: 'chk_feature_flags',
    name: 'Feature Flag Configuration',
    category: 'feature_flag',
    purpose: 'Verify required feature flags are enabled',
    endpoint: '/flags',
    expectedStatus: 200,
    timeoutMs: 2000,
    remediation: 'Enable required flag in configuration',
  },
];

/**
 * Deterministic Preflight Checks Runner using EnvironmentAdapter.
 */
export class PreflightRunner {
  private adapter: EnvironmentAdapter;
  private profile?: EnvironmentProfile;

  constructor(serverOrAdapter: LocalMockServer | EnvironmentAdapter, profile?: EnvironmentProfile) {
    if ('executeCheck' in serverOrAdapter) {
      this.adapter = serverOrAdapter;
    } else {
      this.adapter = new MockEnvironmentAdapter(serverOrAdapter);
    }
    this.profile = profile;
  }

  public async runCheck(checkDef: CheckDefinition): Promise<CheckResult> {
    const res = await this.adapter.executeCheck({
      definition: checkDef,
      timeoutMs: checkDef.timeoutMs || 2000,
    });

    let remediationText = checkDef.remediation;
    if (res.status === CheckStatus.WARN && checkDef.id === 'chk_records') {
      remediationText = 'Trigger approved bootstrap action to seed missing entity records.';
    } else if (res.status === CheckStatus.BLOCK && checkDef.id === 'chk_auth') {
      remediationText = 'Rotate or refresh the test runner service account authorization token.';
    } else if (res.status === CheckStatus.BLOCK && checkDef.id === 'chk_health') {
      remediationText = 'Target service is down or degraded. Inspect service logs before re-running.';
    }

    return {
      checkId: checkDef.id,
      name: checkDef.name,
      status: res.status,
      evidence: {
        statusCode: res.statusCode,
        responseTimeMs: res.responseTimeMs,
        details: res.details,
        payloadSnippet: sanitizeEvidence(res.payload),
      },
      timestamp: new Date().toISOString(),
      remediation: remediationText,
    };
  }

  public async checkReachability(timeoutMs: number = 2000): Promise<CheckResult> {
    return this.runCheck({
      id: 'chk_reachability',
      name: 'Target Mock Base Reachability',
      category: 'reachability',
      purpose: 'Verify target mock server is online',
      endpoint: '/ping',
      expectedStatus: 200,
      timeoutMs,
      remediation: 'Check mock service process',
    });
  }

  public async checkHealth(timeoutMs: number = 2000): Promise<CheckResult> {
    return this.runCheck({
      id: 'chk_health',
      name: 'Service Health Status',
      category: 'health',
      purpose: 'Verify service health status',
      endpoint: '/health',
      expectedStatus: 200,
      timeoutMs,
      remediation: 'Inspect mock service container',
    });
  }

  public async checkAuthentication(timeoutMs: number = 2000): Promise<CheckResult> {
    return this.runCheck({
      id: 'chk_auth',
      name: 'Service Account Auth',
      category: 'auth',
      purpose: 'Verify auth token validity',
      endpoint: '/auth',
      expectedStatus: 200,
      timeoutMs,
      remediation: 'Refresh service account mock credentials',
    });
  }

  public async checkRequiredRecords(timeoutMs: number = 2000): Promise<CheckResult> {
    return this.runCheck({
      id: 'chk_records',
      name: 'Prerequisite Test Seed Records',
      category: 'data',
      purpose: 'Check required test records exist',
      endpoint: '/records',
      expectedStatus: 200,
      timeoutMs,
      remediation: 'Run approved bootstrap setup action',
    });
  }

  public async checkFeatureFlags(timeoutMs: number = 2000): Promise<CheckResult> {
    return this.runCheck({
      id: 'chk_feature_flags',
      name: 'Feature Flag Configuration',
      category: 'feature_flag',
      purpose: 'Verify required feature flags are enabled',
      endpoint: '/flags',
      expectedStatus: 200,
      timeoutMs,
      remediation: 'Enable required flag in configuration',
    });
  }

  /**
   * Executes all configured checks and computes overall readiness disposition.
   */
  public async runAll(): Promise<PreflightReport> {
    const checksToRun =
      this.profile?.checks && this.profile.checks.length > 0
        ? this.profile.checks
        : DEFAULT_CHECKS;

    const results: CheckResult[] = [];
    for (const checkDef of checksToRun) {
      const res = await this.runCheck(checkDef);
      results.push(res);
    }

    const hasBlock = results.some((r) => r.status === CheckStatus.BLOCK || r.status === CheckStatus.ERROR);
    const hasWarn = results.some((r) => r.status === CheckStatus.WARN);

    let overallStatus = CheckStatus.PASS;
    let suggestedRunState: PreflightReport['suggestedRunState'] = 'READY';
    let summary = 'All preflight checks passed successfully. Environment is READY.';

    if (hasBlock) {
      overallStatus = CheckStatus.BLOCK;
      suggestedRunState = 'BLOCKED';
      summary = 'Preflight failed with critical blockers (e.g. auth expired or service degraded). Run must halt.';
    } else if (hasWarn) {
      overallStatus = CheckStatus.WARN;
      suggestedRunState = 'BOOTSTRAPPING';
      summary = 'Preflight detected missing prerequisite seed records. Safe bootstrap setup required.';
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
