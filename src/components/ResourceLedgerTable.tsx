import React from 'react';
import { LedgerEntry } from '../runner/teardown.ts';

interface ResourceLedgerProps {
  entries: LedgerEntry[];
  isCleaningUp?: boolean;
}

export const ResourceLedgerTable: React.FC<ResourceLedgerProps> = ({ entries, isCleaningUp }) => {
  const getTeardownBadge = (status: string) => {
    switch (status) {
      case 'CLEANED':
        return <span className="badge badge-pass">✓ CLEANED</span>;
      case 'FAILED':
        return <span className="badge badge-block">✕ FAILED</span>;
      case 'ACTIVE':
        return <span className="badge badge-warn">● ACTIVE</span>;
      default:
        return <span className="badge badge-info">{status}</span>;
    }
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📦</span> Run-Scoped Resource Ledger
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Run-scoped lifecycle tracking and automatic teardown verification for mock resources
          </p>
        </div>
        <span className="badge badge-info">
          {isCleaningUp ? 'TEARDOWN IN PROGRESS...' : `${entries.length} TRACKED RESOURCES`}
        </span>
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No mock resources created or registered in this session.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Opaque ID</th>
                <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Resource Type</th>
                <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Creating Action</th>
                <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Teardown Status</th>
                <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Cleanup Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.resource.id}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                  }}
                >
                  <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                    {entry.resource.id}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 500 }}>{entry.resource.resourceType}</td>
                  <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {entry.resource.createdViaActionId}
                  </td>
                  <td style={{ padding: '12px' }}>{getTeardownBadge(entry.resource.teardownStatus)}</td>
                  <td style={{ padding: '12px', color: entry.error ? 'var(--status-block)' : 'var(--text-secondary)', fontSize: '0.825rem' }}>
                    {entry.error ? `Error: ${entry.error}` : entry.cleanedAt ? `Cleaned at ${new Date(entry.cleanedAt).toLocaleTimeString()}` : 'Provisioned & pending test teardown'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
