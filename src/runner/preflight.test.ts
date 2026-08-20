import { describe, it, expect } from 'vitest';
import { LocalMockServer } from '../mock-service/mock-server.ts';
import { PreflightRunner, sanitizeEvidence } from './preflight.ts';
import { CheckStatus } from '../core/types.ts';

describe('Preflight Runner', () => {
  it('passes all checks and suggests READY for HEALTHY scenario', async () => {
    const server = new LocalMockServer('HEALTHY');
    const runner = new PreflightRunner(server);

    const report = await runner.runAll();

    expect(report.overallStatus).toBe(CheckStatus.PASS);
    expect(report.suggestedRunState).toBe('READY');
    expect(report.results).toHaveLength(5);
    expect(report.results.every((r) => r.status === CheckStatus.PASS)).toBe(true);
  });

  it('suggests BOOTSTRAPPING when required seed records are missing', async () => {
    const server = new LocalMockServer('MISSING_PREREQUISITE');
    const runner = new PreflightRunner(server);

    const report = await runner.runAll();

    expect(report.overallStatus).toBe(CheckStatus.WARN);
    expect(report.suggestedRunState).toBe('BOOTSTRAPPING');

    const recordsCheck = report.results.find((r) => r.checkId === 'chk_records');
    expect(recordsCheck?.status).toBe(CheckStatus.WARN);
    expect(recordsCheck?.remediation).toContain('Trigger approved bootstrap');
  });

  it('suggests BLOCKED when authentication token is expired (401)', async () => {
    const server = new LocalMockServer('BLOCKED_AUTH_EXPIRED');
    const runner = new PreflightRunner(server);

    const report = await runner.runAll();

    expect(report.overallStatus).toBe(CheckStatus.BLOCK);
    expect(report.suggestedRunState).toBe('BLOCKED');

    const authCheck = report.results.find((r) => r.checkId === 'chk_auth');
    expect(authCheck?.status).toBe(CheckStatus.BLOCK);
    expect(authCheck?.remediation).toContain('Rotate or refresh the test runner');
  });

  it('suggests BLOCKED when service is degraded (503)', async () => {
    const server = new LocalMockServer('BLOCKED_SERVICE_DEGRADED');
    const runner = new PreflightRunner(server);

    const report = await runner.runAll();

    expect(report.overallStatus).toBe(CheckStatus.BLOCK);
    expect(report.suggestedRunState).toBe('BLOCKED');

    const healthCheck = report.results.find((r) => r.checkId === 'chk_health');
    expect(healthCheck?.status).toBe(CheckStatus.BLOCK);
    expect(healthCheck?.remediation).toContain('Target service is down or degraded');
  });

  it('sanitizes secrets, tokens, and authorization data from evidence payloads', () => {
    const rawPayload = {
      user: 'test-admin',
      authToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super_secret_payload',
      api_key: 'sk_live_123456789abcdef',
      password: 'my-super-secret-password',
      normalField: 'ok-data',
    };

    const sanitized = sanitizeEvidence(rawPayload);

    expect(sanitized.normalField).toBe('ok-data');
    expect(sanitized.user).toBe('test-admin');
    expect(sanitized.authToken).not.toContain('super_secret_payload');
    expect(sanitized.authToken).toContain('[MASKED_SECRET_');
    expect(sanitized.api_key).toContain('[MASKED_SECRET_');
    expect(sanitized.password).toContain('[MASKED_SECRET_');
  });
});
