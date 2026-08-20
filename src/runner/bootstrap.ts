import { SetupAction, ActionType, ResourceRecord } from '../core/types.ts';
import { LocalMockServer } from '../mock-service/mock-server.ts';
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
 * Safe Bootstrap Executor.
 * Strictly executes only two approved action types: MOCK_API_REQUEST and LOCAL_MODULE.
 * Explicitly disallows shell execution, subprocesses, or arbitrary evaluation.
 */
export class BootstrapExecutor {
  private mockServer: LocalMockServer;
  private executedActionIds: Set<string> = new Set();

  constructor(mockServer: LocalMockServer) {
    this.mockServer = mockServer;
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
   * Executes a single setup action with bounded retry logic and timeout enforcement.
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
        if (action.type === ActionType.MOCK_API_REQUEST) {
          const res = await withTimeout(
            this.mockServer.createSeedRecord(action.targetResourceName),
            action.timeoutMs,
            action.name
          );
          const duration = Date.now() - start;

          if (res.status === 201 && res.data.record) {
            this.executedActionIds.add(action.id);

            const resource: ResourceRecord = {
              id: res.data.record.id,
              resourceType: 'MOCK_SEED_RECORD',
              resourceKey: res.data.record.name,
              createdViaActionId: action.id,
              createdAt: new Date().toISOString(),
              teardownStatus: 'ACTIVE',
            };

            const result: ActionResult = {
              actionId: action.id,
              name: action.name,
              type: action.type,
              success: true,
              statusCode: res.status,
              durationMs: duration,
              retriesAttempted: retries,
              createdResourceId: resource.id,
              evidence: sanitizeEvidence(res.data),
              timestamp: new Date().toISOString(),
            };

            return { actionResult: result, createdResource: resource };
          } else {
            lastError = (res.data.error as string) || `Mock API returned status ${res.status}`;
          }
        } else if (action.type === ActionType.LOCAL_MODULE) {
          // Local Module safe deterministic handler
          this.executedActionIds.add(action.id);
          const duration = Date.now() - start;
          const resourceId = `mod_rec_${Date.now()}`;

          const resource: ResourceRecord = {
            id: resourceId,
            resourceType: 'LOCAL_MODULE_RESOURCE',
            resourceKey: action.targetResourceName,
            createdViaActionId: action.id,
            createdAt: new Date().toISOString(),
            teardownStatus: 'ACTIVE',
          };

          const result: ActionResult = {
            actionId: action.id,
            name: action.name,
            type: action.type,
            success: true,
            statusCode: 200,
            durationMs: duration,
            retriesAttempted: retries,
            createdResourceId: resource.id,
            evidence: { module: action.name, executed: true },
            timestamp: new Date().toISOString(),
          };

          return { actionResult: result, createdResource: resource };
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
