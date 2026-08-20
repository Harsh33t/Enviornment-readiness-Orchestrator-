import { describe, it, expect, beforeEach } from 'vitest';
import { LocalMockServer } from '../mock-service/mock-server.ts';
import { EnvironmentProfileStore } from '../core/profile-store.ts';
import { Orchestrator } from './orchestrator.ts';
import { RunState } from '../core/types.ts';

describe('End-to-End Orchestration & Classification', () => {
  let profileStore: EnvironmentProfileStore;

  beforeEach(() => {
    profileStore = new EnvironmentProfileStore();
  });

  it('scenario 1: executes HEALTHY environment run to COMPLETED', async () => {
    const profile = profileStore.list()[0];
    const mockServer = new LocalMockServer('HEALTHY');
    const orchestrator = new Orchestrator(profile, mockServer);

    const result = await orchestrator.execute({ autoApproveBootstrap: true });

    expect(result.finalClassification).toBe('COMPLETED');
    expect(result.run.currentState).toBe(RunState.COMPLETED);
    expect(result.run.failureCategory).toBe('NONE');
    expect(result.teardownSummary?.success).toBe(true);
  });

  it('scenario 2: bootstraps MISSING_PREREQUISITE and executes to COMPLETED', async () => {
    const profile = profileStore.list()[0];
    const mockServer = new LocalMockServer('MISSING_PREREQUISITE');
    const orchestrator = new Orchestrator(profile, mockServer);

    const result = await orchestrator.execute({ autoApproveBootstrap: true });

    expect(result.finalClassification).toBe('COMPLETED');
    expect(result.bootstrapResults.length).toBeGreaterThan(0);
    expect(result.bootstrapResults[0].success).toBe(true);
    expect(result.postBootstrapReport?.overallStatus).toBe('PASS');
    expect(result.teardownSummary?.cleanedCount).toBeGreaterThan(0);
  });

  it('scenario 3: halts on BLOCKED_AUTH_EXPIRED before test runs', async () => {
    const profile = profileStore.list()[0];
    const mockServer = new LocalMockServer('BLOCKED_AUTH_EXPIRED');
    const orchestrator = new Orchestrator(profile, mockServer);

    const result = await orchestrator.execute({ autoApproveBootstrap: true });

    expect(result.finalClassification).toBe('BLOCKED');
    expect(result.run.failureCategory).toBe('ENVIRONMENT_SETUP');
    expect(result.preflightReport.suggestedRunState).toBe('BLOCKED');
  });

  it('scenario 4: halts on BLOCKED_SERVICE_DEGRADED (503)', async () => {
    const profile = profileStore.list()[0];
    const mockServer = new LocalMockServer('BLOCKED_SERVICE_DEGRADED');
    const orchestrator = new Orchestrator(profile, mockServer);

    const result = await orchestrator.execute({ autoApproveBootstrap: true });

    expect(result.finalClassification).toBe('BLOCKED');
    expect(result.run.failureCategory).toBe('ENVIRONMENT_SETUP');
    expect(result.rootCauseMessage).toContain('blocked');
  });

  it('scenario 5: handles PARTIAL_SETUP_FAILURE and cleans up provisioned resources', async () => {
    const profile = profileStore.list()[0];
    const mockServer = new LocalMockServer('PARTIAL_SETUP_FAILURE');
    const orchestrator = new Orchestrator(profile, mockServer);

    const result = await orchestrator.execute({ autoApproveBootstrap: true });

    expect(result.finalClassification).toBe('ENVIRONMENT_FAILED');
    expect(result.run.failureCategory).toBe('ENVIRONMENT_SETUP');
    expect(result.bootstrapResults.some((r) => !r.success)).toBe(true);
  });

  it('scenario 6: classifies CLEANUP_FAILURE when teardown deletion fails', async () => {
    const profile = profileStore.list()[0];
    const mockServer = new LocalMockServer('CLEANUP_FAILURE');
    const orchestrator = new Orchestrator(profile, mockServer);

    const result = await orchestrator.execute({ autoApproveBootstrap: true });

    expect(result.finalClassification).toBe('CLEANUP_FAILED');
    expect(result.run.currentState).toBe(RunState.CLEANUP_FAILED);
    expect(result.teardownSummary?.failedCount).toBeGreaterThan(0);
    expect(result.teardownSummary?.failedResources.length).toBeGreaterThan(0);
  });

  it('distinguishes genuine PRODUCT_REGRESSION from environment failures', async () => {
    const profile = profileStore.list()[0];
    const mockServer = new LocalMockServer('HEALTHY');
    const orchestrator = new Orchestrator(profile, mockServer);

    const result = await orchestrator.execute({
      autoApproveBootstrap: true,
      simulateProductTestFailure: true,
    });

    expect(result.finalClassification).toBe('TEST_FAILED');
    expect(result.run.failureCategory).toBe('PRODUCT_REGRESSION');
    expect(result.teardownSummary?.success).toBe(true);
    expect(result.rootCauseMessage).toContain('Genuine product regression');
  });
});
