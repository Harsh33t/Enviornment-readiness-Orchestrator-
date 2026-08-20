import { ResourceRecord, TeardownAction } from '../core/types.ts';
import { EnvironmentAdapter } from '../core/adapter.ts';
import { LocalMockServer } from '../mock-service/mock-server.ts';
import { MockEnvironmentAdapter } from '../mock-service/mock-adapter.ts';

export interface LedgerEntry {
  resource: ResourceRecord;
  teardownAction?: TeardownAction;
  cleanedAt?: string;
  error?: string;
}

export interface TeardownSummary {
  totalTracked: number;
  cleanedCount: number;
  failedCount: number;
  success: boolean;
  failedResources: Array<{ id: string; error: string }>;
  timestamp: string;
}

/**
 * Run-Scoped Resource Ledger and Idempotent Teardown Manager.
 * Tracks ephemeral test resources and executes cleanup via EnvironmentAdapter.
 */
export class ResourceLedger {
  private adapter: EnvironmentAdapter;
  private ledger: Map<string, LedgerEntry> = new Map();

  constructor(serverOrAdapter: LocalMockServer | EnvironmentAdapter) {
    if ('executeTeardownAction' in serverOrAdapter) {
      this.adapter = serverOrAdapter;
    } else {
      this.adapter = new MockEnvironmentAdapter(serverOrAdapter);
    }
  }

  /**
   * Registers a created resource in the ledger for run-scoped lifecycle tracking.
   */
  public registerResource(resource: ResourceRecord, teardownAction?: TeardownAction): void {
    this.ledger.set(resource.id, {
      resource: { ...resource },
      teardownAction,
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
      .filter((e) => e.resource.teardownStatus === 'ACTIVE')
      .map((e) => e.resource);
  }

  /**
   * Executes idempotent teardown across all ledgered active resources via EnvironmentAdapter.
   */
  public async executeTeardown(): Promise<TeardownSummary> {
    const entries = Array.from(this.ledger.values());
    let cleanedCount = 0;
    let failedCount = 0;
    const failedResources: Array<{ id: string; error: string }> = [];

    for (const entry of entries) {
      // Idempotent guard: if already CLEANED, do not re-delete
      if (entry.resource.teardownStatus === 'CLEANED') {
        cleanedCount++;
        continue;
      }

      if (entry.teardownAction) {
        try {
          const res = await this.adapter.executeTeardownAction({
            action: entry.teardownAction,
            timeoutMs: 3000,
          });

          if (res.success) {
            entry.resource.teardownStatus = 'CLEANED';
            entry.cleanedAt = new Date().toISOString();
            cleanedCount++;
          } else {
            const err = res.error || `Teardown failed with status ${res.statusCode}`;
            entry.resource.teardownStatus = 'FAILED';
            entry.error = err;
            failedCount++;
            failedResources.push({ id: entry.resource.id, error: err });
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Teardown execution error';
          entry.resource.teardownStatus = 'FAILED';
          entry.error = errMsg;
          failedCount++;
          failedResources.push({ id: entry.resource.id, error: errMsg });
        }
      } else {
        // Ephemeral in-memory resource without external teardown hook -> clean in ledger
        entry.resource.teardownStatus = 'CLEANED';
        entry.cleanedAt = new Date().toISOString();
        cleanedCount++;
      }
    }

    const overallSuccess = failedCount === 0;

    return {
      totalTracked: entries.length,
      cleanedCount,
      failedCount,
      success: overallSuccess,
      failedResources,
      timestamp: new Date().toISOString(),
    };
  }

  public clear(): void {
    this.ledger.clear();
  }
}
