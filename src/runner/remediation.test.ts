import { describe, it, expect } from 'vitest';
import { generateRemediationGuidance } from './remediation.ts';
import { CheckStatus, CheckResult } from '../core/types.ts';

describe('Deterministic Remediation Engine', () => {
  it('returns empty guidance when all checks PASS', () => {
    const checks: CheckResult[] = [
      { checkId: 'chk_reachability', name: 'Reachability', status: CheckStatus.PASS, evidence: { statusCode: 200 }, timestamp: '' },
      { checkId: 'chk_health', name: 'Health', status: CheckStatus.PASS, evidence: { statusCode: 200 }, timestamp: '' },
    ];

    const guidance = generateRemediationGuidance(checks);
    expect(guidance).toHaveLength(0);
  });

  it('generates actionable bootstrap guidance on missing seed record WARN', () => {
    const checks: CheckResult[] = [
      {
        checkId: 'chk_records',
        name: 'Prerequisite Test Seed Records',
        status: CheckStatus.WARN,
        evidence: { statusCode: 404, details: 'Seed user not found' },
        timestamp: '',
      },
    ];

    const guidance = generateRemediationGuidance(checks);
    expect(guidance).toHaveLength(1);
    expect(guidance[0].safeBootstrapActionAvailable).toBe(true);
    expect(guidance[0].rootCauseAnalysis).toContain('Required seed records');
    expect(guidance[0].recommendedOperatorSteps.some((s) => s.toLowerCase().includes('bootstrap'))).toBe(true);
  });

  it('generates block guidance on 401 auth expiration', () => {
    const checks: CheckResult[] = [
      {
        checkId: 'chk_auth',
        name: 'Service Account Auth',
        status: CheckStatus.BLOCK,
        evidence: { statusCode: 401 },
        timestamp: '',
      },
    ];

    const guidance = generateRemediationGuidance(checks);
    expect(guidance).toHaveLength(1);
    expect(guidance[0].safeBootstrapActionAvailable).toBe(false);
    expect(guidance[0].rootCauseAnalysis).toContain('service-account credentials');
  });

  it('generates block guidance on 503 service outage', () => {
    const checks: CheckResult[] = [
      {
        checkId: 'chk_health',
        name: 'Service Health Status',
        status: CheckStatus.BLOCK,
        evidence: { statusCode: 503 },
        timestamp: '',
      },
    ];

    const guidance = generateRemediationGuidance(checks);
    expect(guidance).toHaveLength(1);
    expect(guidance[0].safeBootstrapActionAvailable).toBe(false);
    expect(guidance[0].rootCauseAnalysis).toContain('degraded');
  });
});
