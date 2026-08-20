import { ResourceRecord, TeardownAction } from '../core/types.ts';
import { LocalMockServer } from '../mock-service/mock-server.ts';

export interface LedgerEntry {
  resource: ResourceRecord;
  teardownAction?: TeardownAction;
  cleanedAt?: string;
  error?: string;
}

export interface TeardownSummary {
  success: boolean;
  totalTracked: number;
  cleanedCount: number;
  failedCount: number;
  failedResources: LedgerEntry[];
  executedAt: string;
}

/**
 * Run-scoped Resource Ledger and Idempotent Teardown Manager.
 */
export class ResourceLedger {
  private ledger: Map<string, LedgerEntry> = new Map();
  private mockServer: LocalMockServer;

  constructor(mockServer: LocalMockServer) {
    this.mockServer = mockServer;
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

  /**
   * Returns all entries in the ledger.
   */
  public getEntries(): LedgerEntry[] {
    return Array.from(this.ledger.values());
  }

  /**
   * Returns active (uncleaned) resources.
   */
  public getActiveResources(): LedgerEntry[] {
    return this.getEntries().filter((e) => e.resource.teardownStatus === 'ACTIVE');
  }

  /**
   * Executes idempotent teardown across all registered active resources.
   */
  public async executeTeardown(): Promise<TeardownSummary> {
    const entries = this.getEntries();
    let cleanedCount = 0;
    let failedCount = 0;
    const failedResources: LedgerEntry[] = [];

    for (const entry of entries) {
      // Idempotent check: skip already cleaned resources
      if (entry.resource.teardownStatus === 'CLEANED') {
        cleanedCount++;
        continue;
      }

      try {
        const res = await this.mockServer.deleteRecord(entry.resource.id);
        if (res.status === 200) {
          entry.resource.teardownStatus = 'CLEANED';
          entry.cleanedAt = new Date().toISOString();
          cleanedCount++;
        } else {
          entry.resource.teardownStatus = 'FAILED';
          entry.error = (res.data.error as string) || `Teardown deletion failed with status ${res.status}`;
          failedCount++;
          failedResources.push(entry);
        }
      } catch (err: unknown) {
        entry.resource.teardownStatus = 'FAILED';
        entry.error = err instanceof Error ? err.message : 'Unknown teardown exception';
        failedCount++;
        failedResources.push(entry);
      }
    }

    return {
      success: failedCount === 0,
      totalTracked: entries.length,
      cleanedCount,
      failedCount,
      failedResources,
      executedAt: new Date().toISOString(),
    };
  }

  public clear(): void {
    this.ledger.clear();
  }
}
