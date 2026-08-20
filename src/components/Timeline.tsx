import React from 'react';
import { RunEvent, RunState } from '../core/types.ts';

interface TimelineProps {
  events: RunEvent[];
  currentState: RunState;
}

export const Timeline: React.FC<TimelineProps> = ({ events, currentState }) => {
  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⏱️</span> Run State Transition Timeline
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Strict state machine progression history & event audit log
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Current State:</span>
          <span className="badge badge-info">{currentState}</span>
        </div>
      </div>

      {events.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No events recorded.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {events.map((evt, idx) => (
            <div
              key={evt.id || idx}
              style={{
                display: 'flex',
                gap: '16px',
                alignItems: 'flex-start',
                padding: '10px 14px',
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: 'var(--radius-md)',
                borderLeft: '3px solid var(--accent-indigo)',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '80px' }}>
                {new Date(evt.timestamp).toLocaleTimeString()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                    {evt.state}
                  </span>
                </div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  {evt.message}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
