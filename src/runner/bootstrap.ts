import { SetupAction, ActionType, ResourceRecord } from '../core/types.ts';
import { EnvironmentAdapter } from '../core/adapter.ts';
import { LocalMockServer } from '../mock-service/mock-server.ts';
import { MockEnvironmentAdapter } from '../mock-service/mock-adapter.ts';
import { sanitizeEvidence } from './preflight.ts';

export interface ActionResult {
  actionId: string;
  name: string;
  type: ActionType;
  success: boolean;
  statusCode?: number;
  durationMs: number;
  retriesAttempted: number;
  createdResourceId?: string;
  error?: string;
  evidence: Record<string, unknown>;
  timestamp: string;
}

/**
 * Executes a promise with an explicit timeout rejection.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Safe Bootstrap Executor executing via EnvironmentAdapter.
 */
export class BootstrapExecutor {
  private adapter: EnvironmentAdapter;
  private executedActionIds: Set<string> = new Set();

  constructor(serverOrAdapter: LocalMockServer | EnvironmentAdapter) {
    if ('executeSetupAction' in serverOrAdapter) {
      this.adapter = serverOrAdapter;
    } else {
      this.adapter = new MockEnvironmentAdapter(serverOrAdapter);
    }
  }

  /**
   * Validates safety constraints of an action before execution.
   */
  public validateAction(action: SetupAction): void {
    if (action.type !== ActionType.MOCK_API_REQUEST && action.type !== ActionType.LOCAL_MODULE) {
      throw new Error(`Execution rejected: Action type '${action.type}' is not an approved safe action type.`);
    }

    if (action.maxRetries > 5) {
      throw new Error(`Execution rejected: Max retries (${action.maxRetries}) exceeds safety limit of 5.`);
    }

    if (action.timeoutMs > 60000 || action.timeoutMs < 100) {
      throw new Error(`Execution rejected: Timeout ${action.timeoutMs}ms is outside allowed bounds [100ms, 60000ms].`);
    }

    if (action.endpoint && !action.endpoint.startsWith('/')) {
      throw new Error(`Execution rejected: Endpoint must be a local relative path, got '${action.endpoint}'.`);
    }
  }

  /**
   * Executes a single setup action with bounded retry logic and timeout enforcement through EnvironmentAdapter.
   */
  public async executeAction(action: SetupAction): Promise<{ actionResult: ActionResult; createdResource?: ResourceRecord }> {
    this.validateAction(action);

    // Prevent duplicate unintended execution of the same action in a run
    if (this.executedActionIds.has(action.id)) {
      throw new Error(`Duplicate execution rejected: Action '${action.id}' has already been executed in this session.`);
    }

    const start = Date.now();
    let retries = 0;
    let lastError = '';

    while (retries <= action.maxRetries) {
      try {
        const res = await withTimeout(
          this.adapter.executeSetupAction({ action, timeoutMs: action.timeoutMs }),
          action.timeoutMs,
          action.name
        );
        const duration = Date.now() - start;

        if (res.success && res.createdResource) {
          this.executedActionIds.add(action.id);

          const resource: ResourceRecord = {
            id: res.createdResource.id,
            resourceType: action.type === ActionType.MOCK_API_REQUEST ? 'MOCK_SEED_RECORD' : 'LOCAL_MODULE_RESOURCE',
            resourceKey: res.createdResource.name,
            createdViaActionId: action.id,
            createdAt: new Date().toISOString(),
            teardownStatus: 'ACTIVE',
          };

          const result: ActionResult = {
            actionId: action.id,
            name: action.name,
            type: action.type,
            success: true,
            statusCode: res.statusCode,
            durationMs: duration,
            retriesAttempted: retries,
            createdResourceId: resource.id,
            evidence: sanitizeEvidence(res.details),
            timestamp: new Date().toISOString(),
          };

          return { actionResult: result, createdResource: resource };
        } else {
          lastError = res.error || `Setup action failed with status ${res.statusCode}`;
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : 'Unknown execution error';
      }

      retries++;
    }

    const duration = Date.now() - start;
    const failedResult: ActionResult = {
      actionId: action.id,
      name: action.name,
      type: action.type,
      success: false,
      statusCode: 500,
      durationMs: duration,
      retriesAttempted: action.maxRetries,
      error: lastError,
      evidence: { error: lastError },
      timestamp: new Date().toISOString(),
    };

    return { actionResult: failedResult };
  }

  public reset(): void {
    this.executedActionIds.clear();
  }
}
