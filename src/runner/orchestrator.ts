import { RunState, EnvironmentProfile, Run } from '../core/types.ts';
import { RunStateMachine } from '../core/state-machine.ts';
import { LocalMockServer } from '../mock-service/mock-server.ts';
import { PreflightRunner, PreflightReport } from './preflight.ts';
import { BootstrapExecutor, ActionResult } from './bootstrap.ts';
import { ResourceLedger, TeardownSummary, LedgerEntry } from './teardown.ts';

export interface OrchestrationOptions {
  autoApproveBootstrap?: boolean;
  simulateProductTestFailure?: boolean;
}

export interface OrchestrationResult {
  run: Run;
  preflightReport: PreflightReport;
  postBootstrapReport?: PreflightReport;
  effectivePreflightReport: PreflightReport;
  bootstrapResults: ActionResult[];
  teardownSummary?: TeardownSummary;
  finalLedgerEntries: LedgerEntry[];
  finalClassification: 'COMPLETED' | 'ENVIRONMENT_FAILED' | 'TEST_FAILED' | 'CLEANUP_FAILED' | 'BLOCKED' | 'AWAITING_APPROVAL';
  rootCauseMessage: string;
}

/**
 * End-to-End Run Orchestrator implementing complete preflight, bootstrap, test, teardown, and failure classification lifecycle.
 */
export class Orchestrator {
  private profile: EnvironmentProfile;
  private mockServer: LocalMockServer;
  private stateMachine: RunStateMachine;
  private preflightRunner: PreflightRunner;
  private bootstrapExecutor: BootstrapExecutor;
  private resourceLedger: ResourceLedger;

  constructor(profile: EnvironmentProfile, mockServer: LocalMockServer) {
    this.profile = profile;
    this.mockServer = mockServer;
    this.stateMachine = new RunStateMachine(profile.id);
    this.preflightRunner = new PreflightRunner(mockServer);
    this.bootstrapExecutor = new BootstrapExecutor(mockServer);
    this.resourceLedger = new ResourceLedger(mockServer);

    // Register any profile-configured test teardown fixtures in the ledger
    if (Array.isArray(profile.teardownActions)) {
      for (const td of profile.teardownActions) {
        this.resourceLedger.registerResource(
          {
            id: td.resourceId,
            resourceType: 'PROFILE_TEST_FIXTURE',
            resourceKey: td.resourceId,
            createdViaActionId: 'profile_fixture',
            createdAt: new Date().toISOString(),
            teardownStatus: 'ACTIVE',
          },
          td
        );
      }
    }
  }

  public getStateMachine(): RunStateMachine {
    return this.stateMachine;
  }

  public getLedger(): ResourceLedger {
    return this.resourceLedger;
  }

  public getMockServer(): LocalMockServer {
    return this.mockServer;
  }

  /**
   * Helper to perform synchronized teardown and update both ledger and state-machine.
   */
  private async performTeardown(): Promise<TeardownSummary> {
    const summary = await this.resourceLedger.executeTeardown();

    // Synchronize state-machine records with authoritative ledger statuses
    for (const entry of this.resourceLedger.getEntries()) {
      if (entry.resource.teardownStatus === 'CLEANED') {
        this.stateMachine.markResourceCleaned(entry.resource.id);
      } else if (entry.resource.teardownStatus === 'FAILED') {
        this.stateMachine.markResourceCleanupFailed(entry.resource.id);
      }
    }

    return summary;
  }

  /**
   * Executes the full orchestrated run.
   */
  public async execute(options: OrchestrationOptions = {}): Promise<OrchestrationResult> {
    const bootstrapResults: ActionResult[] = [];

    // Step 1: Transition to PREFLIGHT_RUNNING
    this.stateMachine.transitionTo(RunState.PREFLIGHT_RUNNING, 'Executing preflight readiness check suite');

    // Step 2: Run Preflight Checks
    const preflightReport = await this.preflightRunner.runAll();
    for (const result of preflightReport.results) {
      this.stateMachine.recordCheckResult(result);
    }

    // Step 3: Handle Blocked Preflight
    if (preflightReport.suggestedRunState === 'BLOCKED') {
      this.stateMachine.setFailureCategory('ENVIRONMENT_SETUP');
      this.stateMachine.transitionTo(RunState.BLOCKED, `Run blocked by preflight: ${preflightReport.summary}`);

      // Run cleanup for safety
      this.stateMachine.transitionTo(RunState.CLEANING_UP, 'Cleaning any ephemeral preflight allocations');
      const teardownSummary = await this.performTeardown();

      if (!teardownSummary.success) {
        this.stateMachine.setFailureCategory('CLEANUP_FAILURE');
        this.stateMachine.transitionTo(RunState.CLEANUP_FAILED, 'Teardown failed during blocked run termination');
        return {
          run: this.stateMachine.getRun(),
          preflightReport,
          effectivePreflightReport: preflightReport,
          bootstrapResults,
          teardownSummary,
          finalLedgerEntries: this.resourceLedger.getEntries(),
          finalClassification: 'CLEANUP_FAILED',
          rootCauseMessage: 'Preflight blocked due to environment failure, and cleanup subsequently failed.',
        };
      }

      this.stateMachine.transitionTo(RunState.COMPLETED, 'Preflight blocked run cleanly halted and cleaned');
      return {
        run: this.stateMachine.getRun(),
        preflightReport,
        effectivePreflightReport: preflightReport,
        bootstrapResults,
        teardownSummary,
        finalLedgerEntries: this.resourceLedger.getEntries(),
        finalClassification: 'BLOCKED',
        rootCauseMessage: `Preflight checks blocked run: ${preflightReport.summary}`,
      };
    }

    // Step 4: Handle Bootstrapping if required
    let postBootstrapReport: PreflightReport | undefined;
    if (preflightReport.suggestedRunState === 'BOOTSTRAPPING') {
      if (!options.autoApproveBootstrap) {
        // Transition to explicit AWAITING_APPROVAL state without marking failure
        this.stateMachine.setFailureCategory('NONE');
        this.stateMachine.transitionTo(
          RunState.AWAITING_APPROVAL,
          'Preflight detected missing prerequisite records. Paused awaiting explicit operator approval.'
        );

        return {
          run: this.stateMachine.getRun(),
          preflightReport,
          effectivePreflightReport: preflightReport,
          bootstrapResults,
          finalLedgerEntries: this.resourceLedger.getEntries(),
          finalClassification: 'AWAITING_APPROVAL',
          rootCauseMessage: 'Preflight checks passed with warnings (missing seed records). Awaiting explicit operator approval to run bootstrap actions.',
        };
      }

      this.stateMachine.transitionTo(RunState.BOOTSTRAPPING, 'Executing approved setup bootstrap actions');

      let bootstrapFailed = false;
      for (const action of this.profile.approvedSetupActions) {
        const { actionResult, createdResource } = await this.bootstrapExecutor.executeAction(action);
        bootstrapResults.push(actionResult);

        if (createdResource) {
          this.stateMachine.trackCreatedResource(createdResource);
          const tdAction = this.profile.teardownActions.find((t) => t.resourceId === createdResource.resourceKey);
          this.resourceLedger.registerResource(createdResource, tdAction);
        }

        if (!actionResult.success) {
          bootstrapFailed = true;
          break;
        }
      }

      if (bootstrapFailed) {
        this.stateMachine.setFailureCategory('ENVIRONMENT_SETUP');
        this.stateMachine.transitionTo(RunState.ENVIRONMENT_FAILED, 'Bootstrap setup action failed execution');

        // Rollback / cleanup created resources
        this.stateMachine.transitionTo(RunState.CLEANING_UP, 'Tearing down partially provisioned bootstrap resources');
        const teardownSummary = await this.performTeardown();

        if (!teardownSummary.success) {
          this.stateMachine.setFailureCategory('CLEANUP_FAILURE');
          this.stateMachine.transitionTo(RunState.CLEANUP_FAILED, 'Teardown failed after bootstrap failure');
          return {
            run: this.stateMachine.getRun(),
            preflightReport,
            effectivePreflightReport: preflightReport,
            bootstrapResults,
            teardownSummary,
            finalLedgerEntries: this.resourceLedger.getEntries(),
            finalClassification: 'CLEANUP_FAILED',
            rootCauseMessage: 'Bootstrap setup failed, and subsequent teardown failed.',
          };
        }

        this.stateMachine.transitionTo(RunState.COMPLETED, 'Bootstrap failure cleanup complete');
        return {
          run: this.stateMachine.getRun(),
          preflightReport,
          effectivePreflightReport: preflightReport,
          bootstrapResults,
          teardownSummary,
          finalLedgerEntries: this.resourceLedger.getEntries(),
          finalClassification: 'ENVIRONMENT_FAILED',
          rootCauseMessage: 'Bootstrap setup action failed to ready the test environment.',
        };
      }

      // Re-run preflight checks to confirm readiness
      postBootstrapReport = await this.preflightRunner.runAll();
      if (postBootstrapReport.overallStatus !== 'PASS') {
        this.stateMachine.setFailureCategory('ENVIRONMENT_SETUP');
        this.stateMachine.transitionTo(RunState.ENVIRONMENT_FAILED, 'Post-bootstrap preflight verification failed');
        this.stateMachine.transitionTo(RunState.CLEANING_UP, 'Cleaning resources after failed post-bootstrap check');
        const teardownSummary = await this.performTeardown();
        this.stateMachine.transitionTo(RunState.COMPLETED, 'Terminated after failed verification');
        return {
          run: this.stateMachine.getRun(),
          preflightReport,
          postBootstrapReport,
          effectivePreflightReport: postBootstrapReport,
          bootstrapResults,
          teardownSummary,
          finalLedgerEntries: this.resourceLedger.getEntries(),
          finalClassification: 'ENVIRONMENT_FAILED',
          rootCauseMessage: 'Post-bootstrap preflight check failed to reach READY state.',
        };
      }
    }

    // Determine effective preflight report
    const effectivePreflightReport = postBootstrapReport || preflightReport;

    // Step 5: Transition to READY
    this.stateMachine.transitionTo(RunState.READY, 'Environment verified READY for E2E test suite execution');

    // Step 6: Execute Simulated Product Test
    this.stateMachine.transitionTo(RunState.TEST_RUNNING, 'Launching simulated E2E product test suite');

    let testFailed = Boolean(options.simulateProductTestFailure);

    if (testFailed) {
      this.stateMachine.setFailureCategory('PRODUCT_REGRESSION');
      this.stateMachine.transitionTo(RunState.TEST_FAILED, 'Simulated product assertion failure: checkout flow failed');
    }

    // Step 7: Teardown
    this.stateMachine.transitionTo(RunState.CLEANING_UP, 'Executing teardown across all ledgered resources');
    const teardownSummary = await this.performTeardown();

    if (!teardownSummary.success) {
      this.stateMachine.setFailureCategory('CLEANUP_FAILURE');
      this.stateMachine.transitionTo(RunState.CLEANUP_FAILED, 'Resource teardown failed to clean up all entities');
      return {
        run: this.stateMachine.getRun(),
        preflightReport,
        postBootstrapReport,
        effectivePreflightReport,
        bootstrapResults,
        teardownSummary,
        finalLedgerEntries: this.resourceLedger.getEntries(),
        finalClassification: 'CLEANUP_FAILED',
        rootCauseMessage: `Cleanup failed for ${teardownSummary.failedCount} resource(s). Manual operator intervention required.`,
      };
    }

    // Step 8: Terminal Completion
    this.stateMachine.transitionTo(RunState.COMPLETED, 'Run finished and resources cleaned up');

    const finalClassification = testFailed ? 'TEST_FAILED' : 'COMPLETED';
    const rootCauseMessage = testFailed
      ? 'Genuine product regression detected (Environment preflight and setup passed cleanly).'
      : 'All preflight checks, test executions, and teardown cleanup completed successfully.';

    return {
      run: this.stateMachine.getRun(),
      preflightReport,
      postBootstrapReport,
      effectivePreflightReport,
      bootstrapResults,
      teardownSummary,
      finalLedgerEntries: this.resourceLedger.getEntries(),
      finalClassification,
      rootCauseMessage,
    };
  }
}
