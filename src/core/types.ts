/**
 * Environment Readiness Prototype - Core Domain Types
 */

export enum RunState {
  PENDING = 'PENDING',
  PREFLIGHT_RUNNING = 'PREFLIGHT_RUNNING',
  BLOCKED = 'BLOCKED',
  BOOTSTRAPPING = 'BOOTSTRAPPING',
  READY = 'READY',
  TEST_RUNNING = 'TEST_RUNNING',
  TEST_FAILED = 'TEST_FAILED',
  ENVIRONMENT_FAILED = 'ENVIRONMENT_FAILED',
  CLEANING_UP = 'CLEANING_UP',
  COMPLETED = 'COMPLETED',
  CLEANUP_FAILED = 'CLEANUP_FAILED',
}

export enum CheckStatus {
  PASS = 'PASS',
  WARN = 'WARN',
  BLOCK = 'BLOCK',
  ERROR = 'ERROR',
}

export enum ActionType {
  MOCK_API_REQUEST = 'MOCK_API_REQUEST',
  LOCAL_MODULE = 'LOCAL_MODULE',
}

export interface CheckDefinition {
  id: string;
  name: string;
  category: 'reachability' | 'auth' | 'health' | 'data' | 'feature_flag';
  purpose: string;
  endpoint: string;
  expectedStatus: number;
  timeoutMs: number;
  remediation: string;
}

export interface CheckResult {
  checkId: string;
  name: string;
  status: CheckStatus;
  evidence: {
    statusCode?: number;
    responseTimeMs?: number;
    details?: string;
    payloadSnippet?: Record<string, unknown>;
  };
  timestamp: string;
  remediation?: string;
}

export interface SetupAction {
  id: string;
  name: string;
  type: ActionType;
  endpoint?: string;
  payload?: Record<string, unknown>;
  targetResourceName: string;
  timeoutMs: number;
  maxRetries: number;
}

export interface ResourceRecord {
  id: string;
  resourceType: string;
  resourceKey: string;
  createdViaActionId: string;
  createdAt: string;
  teardownStatus: 'ACTIVE' | 'CLEANED' | 'FAILED';
}

export interface TeardownAction {
  id: string;
  name: string;
  resourceId: string;
  endpoint: string;
  method: 'DELETE' | 'POST';
}

export interface EnvironmentProfile {
  id: string;
  name: string;
  description: string;
  mockBaseUrl: string;
  checks: CheckDefinition[];
  approvedSetupActions: SetupAction[];
  teardownActions: TeardownAction[];
  timeoutLimitMs: number;
  retryLimit: number;
}

export interface RunEvent {
  id: string;
  timestamp: string;
  state: RunState;
  message: string;
  data?: Record<string, unknown>;
}

export interface Run {
  id: string;
  profileId: string;
  currentState: RunState;
  events: RunEvent[];
  checkResults: CheckResult[];
  createdResources: ResourceRecord[];
  failureCategory?: 'NONE' | 'ENVIRONMENT_SETUP' | 'PRODUCT_REGRESSION' | 'CLEANUP_FAILURE';
  startedAt: string;
  finishedAt?: string;
}
