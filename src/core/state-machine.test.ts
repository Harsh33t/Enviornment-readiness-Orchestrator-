import { describe, it, expect, beforeEach } from 'vitest';
import { RunState, CheckStatus, ResourceRecord } from './types.ts';
import {
  TERMINAL_STATES,
  isValidTransition,
  RunStateMachine,
} from './state-machine.ts';

describe('Domain Model & State Machine', () => {
  let sm: RunStateMachine;

  beforeEach(() => {
    sm = new RunStateMachine('env_profile_staging_01');
  });

  describe('Initial State', () => {
    it('initializes in PENDING state with event history', () => {
      expect(sm.getState()).toBe(RunState.PENDING);
      const run = sm.getRun();
      expect(run.profileId).toBe('env_profile_staging_01');
      expect(run.events).toHaveLength(1);
      expect(run.events[0].state).toBe(RunState.PENDING);
      expect(run.failureCategory).toBe('NONE');
    });
  });

  describe('Valid State Transitions', () => {
    it('executes standard happy path: PENDING -> PREFLIGHT_RUNNING -> READY -> TEST_RUNNING -> COMPLETED', () => {
      sm.transitionTo(RunState.PREFLIGHT_RUNNING, 'Starting preflight suite');
      expect(sm.getState()).toBe(RunState.PREFLIGHT_RUNNING);

      sm.transitionTo(RunState.READY, 'All preflight checks passed');
      expect(sm.getState()).toBe(RunState.READY);

      sm.transitionTo(RunState.TEST_RUNNING, 'Executing test suite');
      expect(sm.getState()).toBe(RunState.TEST_RUNNING);

      sm.transitionTo(RunState.COMPLETED, 'All tests passed cleanly');
      expect(sm.getState()).toBe(RunState.COMPLETED);
      expect(sm.getRun().finishedAt).toBeDefined();
    });

    it('executes bootstrap approval and recovery path: PREFLIGHT_RUNNING -> AWAITING_APPROVAL -> BOOTSTRAPPING -> READY', () => {
      sm.transitionTo(RunState.PREFLIGHT_RUNNING);
      sm.transitionTo(RunState.AWAITING_APPROVAL, 'Missing seed record, awaiting operator approval');
      expect(sm.getState()).toBe(RunState.AWAITING_APPROVAL);

      sm.transitionTo(RunState.BOOTSTRAPPING, 'Operator approved bootstrap');
      expect(sm.getState()).toBe(RunState.BOOTSTRAPPING);

      sm.transitionTo(RunState.READY, 'Bootstrap succeeded');
      expect(sm.getState()).toBe(RunState.READY);
    });

    it('executes preflight blocked flow: PREFLIGHT_RUNNING -> BLOCKED -> CLEANING_UP -> COMPLETED', () => {
      sm.transitionTo(RunState.PREFLIGHT_RUNNING);
      sm.transitionTo(RunState.BLOCKED, 'Auth token expired 401');
      expect(sm.getState()).toBe(RunState.BLOCKED);

      sm.transitionTo(RunState.CLEANING_UP, 'Cleaning any ephemeral preflight items');
      expect(sm.getState()).toBe(RunState.CLEANING_UP);

      sm.transitionTo(RunState.COMPLETED, 'Cleaned up and terminated');
      expect(sm.getState()).toBe(RunState.COMPLETED);
    });

    it('handles test failure with cleanup: TEST_RUNNING -> TEST_FAILED -> CLEANING_UP -> COMPLETED', () => {
      sm.transitionTo(RunState.PREFLIGHT_RUNNING);
      sm.transitionTo(RunState.READY);
      sm.transitionTo(RunState.TEST_RUNNING);
      sm.setFailureCategory('PRODUCT_REGRESSION');

      sm.transitionTo(RunState.TEST_FAILED, 'Assertion failed in checkout flow');
      expect(sm.getState()).toBe(RunState.TEST_FAILED);

      sm.transitionTo(RunState.CLEANING_UP, 'Teardown created test accounts');
      sm.transitionTo(RunState.COMPLETED, 'Cleanup complete');
      expect(sm.getState()).toBe(RunState.COMPLETED);
    });
  });

  describe('Invalid State Transitions', () => {
    it('rejects illegal skipping transitions', () => {
      expect(isValidTransition(RunState.PENDING, RunState.TEST_RUNNING)).toBe(false);
      expect(isValidTransition(RunState.PENDING, RunState.READY)).toBe(false);
      expect(isValidTransition(RunState.BLOCKED, RunState.TEST_RUNNING)).toBe(false);

      expect(() => {
        sm.transitionTo(RunState.TEST_RUNNING);
      }).toThrowError(/Illegal state transition/);
    });

    it('rejects backwards transitions', () => {
      sm.transitionTo(RunState.PREFLIGHT_RUNNING);
      expect(isValidTransition(RunState.PREFLIGHT_RUNNING, RunState.PENDING)).toBe(false);
      expect(() => {
        sm.transitionTo(RunState.PENDING);
      }).toThrowError(/Illegal state transition/);
    });
  });

  describe('Repeated Cleanup and Terminal State Protection', () => {
    it('prevents transitioning out of terminal COMPLETED state', () => {
      sm.transitionTo(RunState.PREFLIGHT_RUNNING);
      sm.transitionTo(RunState.READY);
      sm.transitionTo(RunState.TEST_RUNNING);
      sm.transitionTo(RunState.COMPLETED);

      expect(TERMINAL_STATES).toContain(RunState.COMPLETED);
      expect(isValidTransition(RunState.COMPLETED, RunState.CLEANING_UP)).toBe(false);

      expect(() => {
        sm.transitionTo(RunState.CLEANING_UP);
      }).toThrowError(/Illegal state transition: Cannot transition from 'COMPLETED' to 'CLEANING_UP'/);
    });

    it('prevents repeated cleanup once CLEANUP_FAILED is reached', () => {
      sm.transitionTo(RunState.PREFLIGHT_RUNNING);
      sm.transitionTo(RunState.ENVIRONMENT_FAILED);
      sm.transitionTo(RunState.CLEANING_UP);
      sm.transitionTo(RunState.CLEANUP_FAILED, 'Failed to delete mock resource');

      expect(sm.getState()).toBe(RunState.CLEANUP_FAILED);
      expect(isValidTransition(RunState.CLEANUP_FAILED, RunState.CLEANING_UP)).toBe(false);

      expect(() => {
        sm.transitionTo(RunState.CLEANING_UP);
      }).toThrowError(/Illegal state transition/);
    });
  });

  describe('Partial Setup and Resource Tracking Flow', () => {
    it('tracks partial setup resources and triggers cleanup on setup failure', () => {
      sm.transitionTo(RunState.PREFLIGHT_RUNNING);
      sm.transitionTo(RunState.BOOTSTRAPPING, 'Running setup action 1 of 2');

      // Resource 1 created before failure
      const mockResource: ResourceRecord = {
        id: 'rec_tenant_01',
        resourceType: 'MOCK_TENANT',
        resourceKey: 'test-org-123',
        createdViaActionId: 'act_create_tenant',
        createdAt: new Date().toISOString(),
        teardownStatus: 'ACTIVE',
      };
      sm.trackCreatedResource(mockResource);

      expect(sm.getRun().createdResources).toHaveLength(1);
      expect(sm.getRun().createdResources[0].teardownStatus).toBe('ACTIVE');

      // Step 2 fails -> ENVIRONMENT_FAILED
      sm.setFailureCategory('ENVIRONMENT_SETUP');
      sm.transitionTo(RunState.ENVIRONMENT_FAILED, 'Setup action 2 failed (500)');
      expect(sm.getState()).toBe(RunState.ENVIRONMENT_FAILED);

      // Transition to CLEANING_UP
      sm.transitionTo(RunState.CLEANING_UP, 'Cleaning up partially provisioned resources');
      expect(sm.getState()).toBe(RunState.CLEANING_UP);

      // Mark resource cleaned up
      sm.markResourceCleaned('rec_tenant_01');
      expect(sm.getRun().createdResources[0].teardownStatus).toBe('CLEANED');

      // Finalize
      sm.transitionTo(RunState.COMPLETED, 'Teardown finished after partial setup');
      expect(sm.getState()).toBe(RunState.COMPLETED);
      expect(sm.getRun().failureCategory).toBe('ENVIRONMENT_SETUP');
    });

    it('records check results and marks run events accurately', () => {
      sm.transitionTo(RunState.PREFLIGHT_RUNNING);

      sm.recordCheckResult({
        checkId: 'chk_health',
        name: 'Service Health Endpoint',
        status: CheckStatus.PASS,
        evidence: { statusCode: 200, responseTimeMs: 12 },
        timestamp: new Date().toISOString(),
      });

      sm.recordCheckResult({
        checkId: 'chk_data',
        name: 'Required Test User Record',
        status: CheckStatus.WARN,
        evidence: { statusCode: 404, details: 'Seed user not found' },
        timestamp: new Date().toISOString(),
        remediation: 'Run approved setup action to seed test user',
      });

      const results = sm.getRun().checkResults;
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe(CheckStatus.PASS);
      expect(results[1].status).toBe(CheckStatus.WARN);
    });
  });
});
