import React from 'react';
import { RemediationGuidance } from '../runner/remediation.ts';
import { RunState } from '../core/types.ts';

interface RemediationPanelProps {
  guidanceList: RemediationGuidance[];
  currentState?: RunState;
  onApproveBootstrap?: () => void;
  isBootstrapping?: boolean;
}

export const RemediationPanel: React.FC<RemediationPanelProps> = ({
  guidanceList,
  currentState,
  onApproveBootstrap,
  isBootstrapping,
}) => {
  // If no current unresolved issues, don't show active remediation
  if (guidanceList.length === 0) return null;

  const isActionable =
    currentState === RunState.AWAITING_APPROVAL ||
    currentState === RunState.PREFLIGHT_RUNNING ||
    currentState === RunState.PENDING;

  const hasBootstrapAction = guidanceList.some((g) => g.safeBootstrapActionAvailable);

  return (
    <div
      className="glass-card"
      style={{
        padding: '24px',
        marginBottom: '24px',
        borderColor: 'var(--border-highlight)',
        animation: 'cardSlideIn var(--dur-normal) var(--ease-out-quart)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="badge badge-warn" style={{ marginBottom: '6px' }}>
            ⚠️ Actionable Preflight Guidance
          </span>
          <h3 style={{ fontSize: '1.2rem', marginTop: '4px' }}>Deterministic Failure Analysis & Remediation</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Deterministic rule-based recommendations based strictly on HTTP response codes and missing preconditions
          </p>
        </div>

        {hasBootstrapAction && (
          <button
            onClick={onApproveBootstrap}
            disabled={isBootstrapping || !isActionable}
            className="btn btn-primary"
            style={{ fontSize: '0.875rem' }}
          >
            {isBootstrapping
              ? '⏳ Bootstrapping Environment...'
              : !isActionable
              ? '✓ Bootstrap Step Processed'
              : '⚡ Approve & Run Bootstrap Setup'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
        {guidanceList.map((item) => (
          <div
            key={item.checkId}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {item.checkName}
              </div>
              <span className={`badge ${item.status === 'BLOCK' ? 'badge-block' : 'badge-warn'}`}>
                {item.status}: {item.evidenceSummary}
              </span>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              <strong>Root Cause:</strong> {item.rootCauseAnalysis}
            </p>

            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Recommended Remediation Steps:
              </div>
              <ul style={{ paddingLeft: '20px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                {item.recommendedOperatorSteps.map((step, idx) => (
                  <li key={idx} style={{ marginBottom: '3px' }}>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
