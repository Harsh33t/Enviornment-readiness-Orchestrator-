import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { ShellStatus } from './components/ShellStatus.tsx';
import { CheckMatrix } from './components/CheckMatrix.tsx';
import { Timeline } from './components/Timeline.tsx';
import { ResourceLedgerTable } from './components/ResourceLedgerTable.tsx';
import { RemediationPanel } from './components/RemediationPanel.tsx';
import { RunSummaryCard } from './components/RunSummaryCard.tsx';

import { EnvironmentProfileStore } from './core/profile-store.ts';
import { LocalMockServer } from './mock-service/mock-server.ts';
import { MOCK_SCENARIOS } from './mock-service/fixtures.ts';
import { Orchestrator, OrchestrationResult } from './runner/orchestrator.ts';
import { generateRemediationGuidance } from './runner/remediation.ts';
import { RunState } from './core/types.ts';

export const App: React.FC = () => {
  const profileStore = useMemo(() => new EnvironmentProfileStore(), []);
  const profiles = profileStore.list();
  const [selectedProfileId, setSelectedProfileId] = useState<string>(profiles[0]?.id || 'profile_mock_staging');
  const activeProfile = profileStore.get(selectedProfileId) || profiles[0];

  const [selectedScenario, setSelectedScenario] = useState<string>('HEALTHY');
  const [simulateProductBug, setSimulateProductBug] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(false);
  const [orchestrationResult, setOrchestrationResult] = useState<OrchestrationResult | null>(null);

  // Initialize mock server
  const mockServer = useMemo(() => new LocalMockServer(selectedScenario), [selectedScenario]);

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    mockServer.setScenario(scenarioId);
    setOrchestrationResult(null);
  };

  const handleRunOrchestration = useCallback(
    async (autoApprove: boolean = false) => {
      setIsRunning(true);
      mockServer.setScenario(selectedScenario);

      try {
        const orchestrator = new Orchestrator(activeProfile, mockServer);
        const result = await orchestrator.execute({
          autoApproveBootstrap: autoApprove,
          simulateProductTestFailure: simulateProductBug,
        });

        setOrchestrationResult(result);
      } catch (err: unknown) {
        console.error('Run orchestration error:', err);
      } finally {
        setIsRunning(false);
        setIsBootstrapping(false);
      }
    },
    [activeProfile, mockServer, selectedScenario, simulateProductBug]
  );

  const handleApproveBootstrap = async () => {
    setIsBootstrapping(true);
    await handleRunOrchestration(true);
  };

  const handleCancelRun = () => {
    setIsRunning(false);
    setIsBootstrapping(false);
  };

  // Keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isRunning && !isBootstrapping && (e.ctrlKey || e.metaKey)) {
        handleRunOrchestration(false);
      } else if (e.key === 'Escape' && isRunning) {
        handleCancelRun();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, isBootstrapping, handleRunOrchestration]);

  // Generate remediation from effective report (post-bootstrap if completed, else initial)
  const remediationGuidance = useMemo(() => {
    if (!orchestrationResult) return [];
    return generateRemediationGuidance(orchestrationResult.effectivePreflightReport.results);
  }, [orchestrationResult]);

  const currentState = orchestrationResult?.run.currentState || (isRunning ? RunState.PREFLIGHT_RUNNING : RunState.PENDING);
  const events = orchestrationResult?.run.events || [];
  const checkResults = orchestrationResult?.effectivePreflightReport?.results || [];
  const ledgerEntries = orchestrationResult?.finalLedgerEntries || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <main className="container" style={{ flex: 1, paddingBottom: '48px' }}>
        <ShellStatus />

        {/* Profile & Scenario Control Bar */}
        <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🎯</span> Environment Profile & Simulation Controls
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Profile:</span>
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  style={{
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                    fontSize: '0.85rem',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.mockBaseUrl})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={simulateProductBug}
                  onChange={(e) => setSimulateProductBug(e.target.checked)}
                  style={{ accentColor: '#f43f5e', cursor: 'pointer' }}
                />
                <span style={{ color: simulateProductBug ? '#f43f5e' : 'var(--text-secondary)' }}>
                  Simulate Product Test Regression (Bug)
                </span>
              </label>

              {isRunning ? (
                <button
                  onClick={handleCancelRun}
                  className="btn btn-secondary"
                  style={{ borderColor: 'var(--status-block)', color: 'var(--status-block)' }}
                >
                  ✕ Cancel Run
                </button>
              ) : (
                <button
                  onClick={() => handleRunOrchestration(false)}
                  disabled={isRunning}
                  className="btn btn-primary"
                  style={{ padding: '10px 20px', fontSize: '0.9rem' }}
                >
                  ▶ Run Preflight & Orchestrator
                </button>
              )}
            </div>
          </div>

          {/* Stepper Progress Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(0, 0, 0, 0.3)',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px',
            fontSize: '0.8rem',
            overflowX: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--status-pass)' }}>
              <span>✓</span> 1. Profile Loaded
            </div>
            <div style={{ color: 'var(--text-muted)' }}>→</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: currentState !== RunState.PENDING ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
              <span>●</span> 2. Preflight Checks
            </div>
            <div style={{ color: 'var(--text-muted)' }}>→</div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: currentState === RunState.AWAITING_APPROVAL || currentState === RunState.BOOTSTRAPPING
                ? 'var(--status-warn)'
                : 'var(--text-muted)'
            }}>
              <span>⚡</span> 3. Bootstrap Setup {currentState === RunState.AWAITING_APPROVAL && '(Approval Pending)'}
            </div>
            <div style={{ color: 'var(--text-muted)' }}>→</div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: currentState === RunState.TEST_RUNNING || currentState === RunState.COMPLETED
                ? 'var(--accent-indigo)'
                : 'var(--text-muted)'
            }}>
              <span>🧪</span> 4. Product Test
            </div>
            <div style={{ color: 'var(--text-muted)' }}>→</div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: currentState === RunState.CLEANING_UP || currentState === RunState.COMPLETED
                ? 'var(--status-pass)'
                : 'var(--text-muted)'
            }}>
              <span>🧹</span> 5. Teardown
            </div>
          </div>

          {/* Scenario Cards */}
          <div className="grid grid-cols-3" style={{ gap: '10px' }}>
            {Object.values(MOCK_SCENARIOS).map((scenario) => {
              const isSelected = selectedScenario === scenario.id;
              return (
                <div
                  key={scenario.id}
                  onClick={() => handleScenarioChange(scenario.id)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected ? '1.5px solid var(--accent-indigo)' : '1px solid var(--border-subtle)',
                    background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(0, 0, 0, 0.25)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                      {scenario.name}
                    </div>
                    {isSelected && <span className="badge badge-pass" style={{ fontSize: '0.65rem' }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    {scenario.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Run Outcome Breakdown */}
        <RunSummaryCard result={orchestrationResult} />

        {/* Remediation Panel & Bootstrap Action */}
        <RemediationPanel
          guidanceList={remediationGuidance}
          currentState={currentState}
          onApproveBootstrap={handleApproveBootstrap}
          isBootstrapping={isBootstrapping}
        />

        {/* Preflight Check Matrix */}
        <CheckMatrix results={checkResults} isLoading={isRunning} />

        {/* Timeline & Ledger Grid */}
        <div className="grid grid-cols-2">
          <Timeline events={events} currentState={currentState} />
          <ResourceLedgerTable entries={ledgerEntries} isCleaningUp={currentState === RunState.CLEANING_UP} />
        </div>
      </main>

      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '20px 0',
        color: 'var(--text-muted)',
        fontSize: '0.8rem',
        textAlign: 'center',
      }}>
        <div className="container">
          Environment Readiness Prototype — Deterministic Local Mock Orchestration — Zero External Network Dependencies
        </div>
      </footer>
    </div>
  );
};
