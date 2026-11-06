import { ResourceRecord, TeardownAction } from '../core/types.ts';
import { EnvironmentAdapter } from '../core/adapter.ts';
import { LocalMockServer } from '../mock-service/mock-server.ts';
import { MockEnvironmentAdapter } from '../mock-service/mock-adapter.ts';

export interface LedgerEntry {
  resource: ResourceRecord;
  teardownAction?: TeardownAction;
  cleanedAt?: string;
  lastAttemptAt?: string;
  attemptCount: number;
  error?: string;
}

export interface FailedTeardownResource {
  id: string;
  error: string;
  attempts: number;
}

export interface TeardownSummary {
  totalTracked: number;
  cleanedCount: number;
  failedCount: number;
  totalAttempts: number;
  success: boolean;
  failedResources: FailedTeardownResource[];
  timestamp: string;
}

export interface TeardownRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ALLOWED_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 100;
const MAX_BASE_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 5000;
const RETRYABLE_STATUSES = new Set([408, 429]);

function sleep(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function isRetryableStatus(statusCode: number): boolean {
  return RETRYABLE_STATUSES.has(statusCode) || (statusCode >= 500 && statusCode <= 599);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Teardown execution error';
}

/**
 * Run-Scoped Resource Ledger and Idempotent Teardown Manager.
 * Tracks ephemeral test resources and performs bounded retries only for DELETE cleanup.
 */
export class ResourceLedger {
  private adapter: EnvironmentAdapter;
  private ledger: Map<string, LedgerEntry> = new Map();
  private maxAttempts: number;
  private baseDelayMs: number;
  private wait: (delayMs: number) => Promise<void>;

  constructor(serverOrAdapter: LocalMockServer | EnvironmentAdapter, options: TeardownRetryOptions = {}) {
    if ('executeTeardownAction' in serverOrAdapter) {
      this.adapter = serverOrAdapter;
    } else {
      this.adapter = new MockEnvironmentAdapter(serverOrAdapter);
    }
    const requestedAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.maxAttempts = Number.isFinite(requestedAttempts)
      ? Math.min(MAX_ALLOWED_ATTEMPTS, Math.max(1, Math.floor(requestedAttempts)))
      : DEFAULT_MAX_ATTEMPTS;
    const requestedDelay = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.baseDelayMs = Number.isFinite(requestedDelay)
      ? Math.min(MAX_BASE_DELAY_MS, Math.max(0, requestedDelay))
      : DEFAULT_BASE_DELAY_MS;
    this.wait = options.wait ?? sleep;
  }

  /**
   * Registers a created resource in the ledger for run-scoped lifecycle tracking.
   */
  public registerResource(resource: ResourceRecord, teardownAction?: TeardownAction): void {
    this.ledger.set(resource.id, {
      resource: { ...resource },
      teardownAction,
      attemptCount: 0,
    });
  }

  public getEntries(): LedgerEntry[] {
    return Array.from(this.ledger.values());
  }

  public getEntry(id: string): LedgerEntry | undefined {
    return this.ledger.get(id);
  }

  public getActiveResources(): ResourceRecord[] {
    return Array.from(this.ledger.values())
      .filter((entry) => entry.resource.teardownStatus === 'ACTIVE')
      .map((entry) => entry.resource);
  }

  /**
   * Executes teardown across ledgered resources. Only DELETE requests are retried,
   * because a timed-out POST may already have applied a non-idempotent side effect.
   */
  public async executeTeardown(): Promise<TeardownSummary> {
    const entries = Array.from(this.ledger.values());
    let cleanedCount = 0;
    let failedCount = 0;
    let totalAttempts = 0;
    const failedResources: FailedTeardownResource[] = [];

    for (const entry of entries) {
      if (entry.resource.teardownStatus === 'CLEANED') {
        cleanedCount++;
        continue;
      }

      if (!entry.teardownAction) {
        entry.resource.teardownStatus = 'CLEANED';
        entry.cleanedAt = new Date().toISOString();
        cleanedCount++;
        continue;
      }

      const attemptsBefore = entry.attemptCount;
      const result = await this.executeActionWithRetry(entry);
      const attemptsThisRun = entry.attemptCount - attemptsBefore;
      totalAttempts += attemptsThisRun;

      if (result.success) {
        entry.resource.teardownStatus = 'CLEANED';
        entry.cleanedAt = new Date().toISOString();
        entry.error = undefined;
        cleanedCount++;
      } else {
        entry.resource.teardownStatus = 'FAILED';
        entry.error = result.error;
        failedCount++;
        failedResources.push({ id: entry.resource.id, error: result.error, attempts: attemptsThisRun });
      }
    }

    return {
      totalTracked: entries.length,
      cleanedCount,
      failedCount,
      totalAttempts,
      success: failedCount === 0,
      failedResources,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeActionWithRetry(entry: LedgerEntry): Promise<{ success: true } | { success: false; error: string }> {
    const action = entry.teardownAction!;
    const attemptsAllowed = action.method === 'DELETE' ? this.maxAttempts : 1;
    let lastError = 'Teardown execution error';

    for (let attempt = 1; attempt <= attemptsAllowed; attempt++) {
      entry.attemptCount++;
      entry.lastAttemptAt = new Date().toISOString();
      try {
        const response = await this.adapter.executeTeardownAction({ action, timeoutMs: 3000 });
        if (response.success) return { success: true };
        lastError = response.error || `Teardown failed with status ${response.statusCode}`;
        if (action.method !== 'DELETE' || !isRetryableStatus(response.statusCode) || attempt === attemptsAllowed) {
          return { success: false, error: lastError };
        }
      } catch (error: unknown) {
        lastError = errorMessage(error);
        if (action.method !== 'DELETE' || attempt === attemptsAllowed) {
          return { success: false, error: lastError };
        }
      }

      const delayMs = Math.min(MAX_RETRY_DELAY_MS, this.baseDelayMs * (2 ** (attempt - 1)));
      await this.wait(delayMs);
    }

    return { success: false, error: lastError };
  }

  public clear(): void {
    this.ledger.clear();
  }
}
