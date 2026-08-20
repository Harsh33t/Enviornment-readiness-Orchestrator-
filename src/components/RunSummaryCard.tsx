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
        return <span className="badge badge-pass" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>✓ RUN COMPLETED (ALL PASSED)</span>;
      case 'AWAITING_APPROVAL':
        return <span className="badge badge-warn" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>⚡ AWAITING OPERATOR APPROVAL</span>;
      case 'ENVIRONMENT_FAILED':
        return <span className="badge badge-block" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>🛑 ENVIRONMENT / SETUP FAILURE</span>;
      case 'BLOCKED':
        return <span className="badge badge-block" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>⛔ PREFLIGHT BLOCKED</span>;
      case 'TEST_FAILED':
        return <span className="badge badge-warn" style={{ fontSize: '0.85rem', padding: '6px 14px', background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e' }}>🐛 GENUINE PRODUCT REGRESSION</span>;
      case 'CLEANUP_FAILED':
        return <span className="badge badge-block" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>⚠️ TEARDOWN CLEANUP FAILED</span>;
      default:
        return <span className="badge badge-info">{classification}</span>;
    }
  };

  const isProductBug = result.finalClassification === 'TEST_FAILED';
  const isEnvBug = result.finalClassification === 'ENVIRONMENT_FAILED' || result.finalClassification === 'BLOCKED';
  const isAwaiting = result.finalClassification === 'AWAITING_APPROVAL';

  // Use effective preflight report (post-bootstrap if available, else initial)
  const report = result.effectivePreflightReport || result.preflightReport;
  const passedCount = report.results.filter((r) => r.status === 'PASS').length;
  const totalCount = report.results.length;

  return (
    <div
      className="glass-card"
      style={{
        padding: '24px',
        marginBottom: '24px',
        borderLeft: isProductBug
          ? '4px solid #f43f5e'
          : isAwaiting
          ? '4px solid var(--status-warn)'
          : isEnvBug
          ? '4px solid var(--status-block)'
          : '4px solid var(--status-pass)',
        animation: 'cardSlideIn var(--dur-normal) var(--ease-out-quart)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
            ORCHESTRATION OUTCOME & CLASSIFICATION
          </div>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{result.rootCauseMessage}</h2>
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
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Effective Preflight</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {passedCount} / {totalCount} Passed
            {result.postBootstrapReport && (
              <span style={{ fontSize: '0.75rem', color: 'var(--status-pass)', marginLeft: '6px' }}>
                (Verified)
              </span>
            )}
          </div>
        </div>

        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Teardown Status</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: result.teardownSummary?.success ? 'var(--status-pass)' : result.teardownSummary ? 'var(--status-block)' : 'var(--text-muted)' }}>
            {result.teardownSummary ? `${result.teardownSummary.cleanedCount} / ${result.teardownSummary.totalTracked} Cleaned` : 'Pending execution'}
          </div>
        </div>
      </div>
    </div>
  );
};
