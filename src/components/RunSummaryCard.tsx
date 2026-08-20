import React from 'react';
import { OrchestrationResult } from '../runner/orchestrator.ts';

interface RunSummaryCardProps {
  result: OrchestrationResult | null;
}

export const RunSummaryCard: React.FC<RunSummaryCardProps> = ({ result }) => {
  if (!result) return null;

  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case 'COMPLETED':
        return <span className="badge badge-pass" style={{ fontSize: '0.9rem', padding: '6px 14px' }}>✓ RUN COMPLETED (ALL PASSED)</span>;
      case 'ENVIRONMENT_FAILED':
        return <span className="badge badge-block" style={{ fontSize: '0.9rem', padding: '6px 14px' }}>🛑 ENVIRONMENT / SETUP FAILURE</span>;
      case 'BLOCKED':
        return <span className="badge badge-block" style={{ fontSize: '0.9rem', padding: '6px 14px' }}>⛔ PREFLIGHT BLOCKED</span>;
      case 'TEST_FAILED':
        return <span className="badge badge-warn" style={{ fontSize: '0.9rem', padding: '6px 14px', background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e' }}>🐛 GENUINE PRODUCT REGRESSION</span>;
      case 'CLEANUP_FAILED':
        return <span className="badge badge-block" style={{ fontSize: '0.9rem', padding: '6px 14px' }}>⚠️ TEARDOWN CLEANUP FAILED</span>;
      default:
        return <span className="badge badge-info">{classification}</span>;
    }
  };

  const isProductBug = result.finalClassification === 'TEST_FAILED';
  const isEnvBug = result.finalClassification === 'ENVIRONMENT_FAILED' || result.finalClassification === 'BLOCKED';

  return (
    <div
      className="glass-card"
      style={{
        padding: '24px',
        marginBottom: '24px',
        borderLeft: isProductBug
          ? '4px solid #f43f5e'
          : isEnvBug
          ? '4px solid var(--status-block)'
          : '4px solid var(--status-pass)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
            ORCHESTRATION OUTCOME & CLASSIFICATION
          </div>
          <h2 style={{ fontSize: '1.35rem', margin: 0 }}>{result.rootCauseMessage}</h2>
        </div>
        <div>{getClassificationBadge(result.finalClassification)}</div>
      </div>

      <div className="grid grid-cols-3" style={{ gap: '12px', marginTop: '16px' }}>
        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Failure Category</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {result.run.failureCategory || 'NONE'}
          </div>
        </div>

        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Preflight Checks</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {result.preflightReport.results.filter((r) => r.status === 'PASS').length} / {result.preflightReport.results.length} Passed
          </div>
        </div>

        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Teardown Status</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: result.teardownSummary?.success ? 'var(--status-pass)' : 'var(--status-block)' }}>
            {result.teardownSummary ? `${result.teardownSummary.cleanedCount} / ${result.teardownSummary.totalTracked} Cleaned` : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  );
};
