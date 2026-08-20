import React from 'react';

export const ShellStatus: React.FC = () => {
  const boundaries = [
    { label: 'Network Isolation', value: '100% Mock Endpoints (No Live Traffic)', status: 'pass' },
    { label: 'Credentials & Auth', value: 'Synthetic Tokens (No Real Secrets)', status: 'pass' },
    { label: 'Decision Logic', value: 'Deterministic Status-Code Rules (No LLM)', status: 'pass' },
    { label: 'Process Sandboxing', value: 'In-Memory Handlers (No Shell Execution)', status: 'pass' },
  ];

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="badge badge-pass" style={{ marginBottom: '8px' }}>
            ✓ Application Shell Ready
          </span>
          <h2 style={{ fontSize: '1.25rem', marginTop: '4px' }}>Prototype Safety & Boundary Verification</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            This prototype demonstrates E2E preflight checks and setup classification safely using isolated mock engines.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem' }}
          >
            📄 README.md
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2" style={{ gap: '12px', marginTop: '16px' }}>
        {boundaries.map((b, idx) => (
          <div
            key={idx}
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{b.label}</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{b.value}</div>
            </div>
            <span className="badge badge-pass">ACTIVE</span>
          </div>
        ))}
      </div>
    </div>
  );
};
