/**
 * Mock Environment Fixtures for Deterministic Scenarios
 */

export interface MockScenario {
  id: string;
  name: string;
  description: string;
  healthStatus: number;
  authStatus: number;
  featureFlags: Record<string, boolean>;
  records: { id: string; name: string }[];
  setupWillSucceed: boolean;
  cleanupWillSucceed: boolean;
}

export const MOCK_SCENARIOS: Record<string, MockScenario> = {
  HEALTHY: {
    id: 'HEALTHY',
    name: 'Healthy Staging Environment',
    description: 'All preflight checks pass without requiring bootstrap.',
    healthStatus: 200,
    authStatus: 200,
    featureFlags: { 'e2e-suite-enabled': true, 'beta-ui': true },
    records: [
      { id: 'usr_seed_001', name: 'E2E Test User' },
      { id: 'org_seed_001', name: 'E2E Test Workspace' },
    ],
    setupWillSucceed: true,
    cleanupWillSucceed: true,
  },
  MISSING_PREREQUISITE: {
    id: 'MISSING_PREREQUISITE',
    name: 'Missing Required Seed Record',
    description: 'Health & auth pass, but required seed record is missing. Bootstrap creates it.',
    healthStatus: 200,
    authStatus: 200,
    featureFlags: { 'e2e-suite-enabled': true },
    records: [], // missing
    setupWillSucceed: true,
    cleanupWillSucceed: true,
  },
  BLOCKED_AUTH_EXPIRED: {
    id: 'BLOCKED_AUTH_EXPIRED',
    name: 'Expired Service Auth Token',
    description: 'Preflight detects 401 Unauthorized before any test starts.',
    healthStatus: 200,
    authStatus: 401,
    featureFlags: { 'e2e-suite-enabled': true },
    records: [],
    setupWillSucceed: false,
    cleanupWillSucceed: true,
  },
  BLOCKED_SERVICE_DEGRADED: {
    id: 'BLOCKED_SERVICE_DEGRADED',
    name: 'Target Service Unavailable (503)',
    description: 'Preflight detects service outage and immediately blocks run.',
    healthStatus: 503,
    authStatus: 200,
    featureFlags: { 'e2e-suite-enabled': true },
    records: [],
    setupWillSucceed: false,
    cleanupWillSucceed: true,
  },
  PARTIAL_SETUP_FAILURE: {
    id: 'PARTIAL_SETUP_FAILURE',
    name: 'Bootstrap Action Failure',
    description: 'Setup starts but fails mid-way, triggering automatic resource tracking cleanup.',
    healthStatus: 200,
    authStatus: 200,
    featureFlags: { 'e2e-suite-enabled': true },
    records: [],
    setupWillSucceed: false,
    cleanupWillSucceed: true,
  },
  CLEANUP_FAILURE: {
    id: 'CLEANUP_FAILURE',
    name: 'Teardown Deletion Failure',
    description: 'Teardown fails to delete a created mock resource, flagging cleanup failure.',
    healthStatus: 200,
    authStatus: 200,
    featureFlags: { 'e2e-suite-enabled': true },
    records: [{ id: 'usr_seed_001', name: 'E2E Test User' }],
    setupWillSucceed: true,
    cleanupWillSucceed: false,
  },
};
