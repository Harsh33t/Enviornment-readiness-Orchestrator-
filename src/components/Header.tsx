import React from 'react';

export const Header: React.FC = () => {
  return (
    <header style={{
      borderBottom: '1px solid var(--border-subtle)',
      backgroundColor: 'rgba(10, 13, 20, 0.8)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div className="container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '16px',
        paddingBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            boxShadow: 'var(--shadow-glow)',
          }}>
            🛡️
          </div>
          <div>
            <h1 style={{ fontSize: '1.15rem', letterSpacing: '-0.02em', margin: 0 }}>
              Environment Readiness <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>| Orchestrator</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Cloud E2E Preflight & Bootstrap Lifecycle Prototype
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="badge badge-info" title="Zero live network probing or production dependencies">
            ● Local Mock Isolation
          </span>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
            v0.1.0 Shell
          </span>
        </div>
      </div>
    </header>
  );
};
