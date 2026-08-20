import {
  RunState,
  Run,
  RunEvent,
  CheckResult,
  ResourceRecord,
} from './types.ts';

/**
 * Explicit state machine transition mapping.
 * Disallows illegal transitions to prevent invalid test execution states.
 */
export const VALID_TRANSITIONS: Record<RunState, RunState[]> = {
  [RunState.PENDING]: [RunState.PREFLIGHT_RUNNING],
  [RunState.PREFLIGHT_RUNNING]: [
    RunState.READY,
    RunState.BLOCKED,
    RunState.BOOTSTRAPPING,
    RunState.ENVIRONMENT_FAILED,
  ],
  [RunState.BOOTSTRAPPING]: [
    RunState.READY,
    RunState.ENVIRONMENT_FAILED,
    RunState.CLEANING_UP,
  ],
  [RunState.BLOCKED]: [
    RunState.CLEANING_UP,
    RunState.COMPLETED,
  ],
  [RunState.READY]: [
    RunState.TEST_RUNNING,
    RunState.CLEANING_UP,
  ],
  [RunState.TEST_RUNNING]: [
    RunState.COMPLETED,
    RunState.TEST_FAILED,
    RunState.ENVIRONMENT_FAILED,
    RunState.CLEANING_UP,
  ],
  [RunState.TEST_FAILED]: [RunState.CLEANING_UP],
  [RunState.ENVIRONMENT_FAILED]: [RunState.CLEANING_UP],
  [RunState.CLEANING_UP]: [
    RunState.COMPLETED,
    RunState.CLEANUP_FAILED,
  ],
  [RunState.COMPLETED]: [],
  [RunState.CLEANUP_FAILED]: [],
};

/**
 * Terminal states in the execution lifecycle.
 */
export const TERMINAL_STATES: readonly RunState[] = [
  RunState.COMPLETED,
  RunState.CLEANUP_FAILED,
] as const;

/**
 * Validates if a state transition is legal according to the state machine rules.
 */
export function isValidTransition(fromState: RunState, toState: RunState): boolean {
  const allowedNext = VALID_TRANSITIONS[fromState];
  if (!allowedNext) return false;
  return allowedNext.includes(toState);
}

/**
 * Asserts valid transition, throwing a descriptive error if illegal.
 */
export function assertValidTransition(fromState: RunState, toState: RunState): void {
  if (!isValidTransition(fromState, toState)) {
    throw new Error(
      `Illegal state transition: Cannot transition from '${fromState}' to '${toState}'. Allowed: [${
        VALID_TRANSITIONS[fromState]?.join(', ') || 'None (Terminal State)'
      }]`
    );
  }
}

/**
 * In-memory state machine execution runner for a single test run.
 */
export class RunStateMachine {
  private run: Run;

  constructor(profileId: string) {
    this.run = {
      id: `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      profileId,
      currentState: RunState.PENDING,
      events: [
        {
          id: `evt_${Date.now()}_init`,
          timestamp: new Date().toISOString(),
          state: RunState.PENDING,
          message: 'Run initialized in PENDING state',
        },
      ],
      checkResults: [],
      createdResources: [],
      failureCategory: 'NONE',
      startedAt: new Date().toISOString(),
    };
  }

  public getRun(): Readonly<Run> {
    return this.run;
  }

  public getState(): RunState {
    return this.run.currentState;
  }

  public transitionTo(nextState: RunState, reason?: string, data?: Record<string, unknown>): void {
    assertValidTransition(this.run.currentState, nextState);

    const event: RunEvent = {
      id: `evt_${Date.now()}_${this.run.events.length}`,
      timestamp: new Date().toISOString(),
      state: nextState,
      message: reason || `Transitioned from ${this.run.currentState} to ${nextState}`,
      data,
    };

    this.run.currentState = nextState;
    this.run.events.push(event);

    if (TERMINAL_STATES.includes(nextState)) {
      this.run.finishedAt = new Date().toISOString();
    }
  }

  public recordCheckResult(result: CheckResult): void {
    this.run.checkResults.push(result);
  }

  public trackCreatedResource(resource: ResourceRecord): void {
    this.run.createdResources.push(resource);
  }

  public markResourceCleaned(resourceId: string): void {
    const res = this.run.createdResources.find((r) => r.id === resourceId);
    if (res) {
      res.teardownStatus = 'CLEANED';
    }
  }

  public markResourceCleanupFailed(resourceId: string): void {
    const res = this.run.createdResources.find((r) => r.id === resourceId);
    if (res) {
      res.teardownStatus = 'FAILED';
    }
  }

  public setFailureCategory(category: NonNullable<Run['failureCategory']>): void {
    this.run.failureCategory = category;
  }
}
