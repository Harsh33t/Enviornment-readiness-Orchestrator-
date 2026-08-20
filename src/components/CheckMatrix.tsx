import React from 'react';
import { CheckResult, CheckStatus } from '../core/types.ts';

interface CheckMatrixProps {
  results: CheckResult[];
  isLoading?: boolean;
}

export const CheckMatrix: React.FC<CheckMatrixProps> = ({ results, isLoading }) => {
  const getBadge = (status: CheckStatus) => {
    switch (status) {
      case CheckStatus.PASS:
        return <span className="badge badge-pass">✓ PASS</span>;
      case CheckStatus.WARN:
        return <span className="badge badge-warn">⚠️ WARN</span>;
      case CheckStatus.BLOCK:
        return <span className="badge badge-block">🛑 BLOCK</span>;
      case CheckStatus.ERROR:
        return <span className="badge badge-block">✕ ERROR</span>;
      default:
        return <span className="badge badge-info">{status}</span>;
    }
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📋</span> Preflight Check-Result Matrix
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Deterministic environment evaluations prior to test suite execution
          </p>
        </div>
        <span className={`badge ${isLoading ? 'badge-evaluating' : 'badge-info'}`}>
          {isLoading ? (
            <>
              <span className="spinner" style={{ width: '10px', height: '10px' }} />
              EVALUATING CHECKS...
            </>
          ) : (
            `${results.length} CHECKS EVALUATED`
          )}
        </span>
      </div>

      {results.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No preflight checks executed yet. Click &quot;Run Preflight & Orchestrator&quot; to begin.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Check ID</th>
                <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>HTTP / Latency</th>
                <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Evidence Details</th>
              </tr>
            </thead>
            <tbody>
              {results.map((chk, idx) => (
                <tr
                  key={chk.checkId}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    animation: `checkRowIn var(--dur-normal) var(--ease-out-quart) forwards`,
                    animationDelay: `${idx * 50}ms`,
                  }}
                >
                  <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
                    {chk.checkId}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 500 }}>{chk.name}</td>
                  <td style={{ padding: '12px' }}>
                    {getBadge(chk.status)}
                  </td>
                  <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {chk.evidence.statusCode ? (
                      <span>
                        HTTP {chk.evidence.statusCode} ({chk.evidence.responseTimeMs || 0}ms)
                      </span>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                    {chk.evidence.details || 'Check passed assertion rules.'}
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
