import { CheckDefinition, CheckStatus, SetupAction, TeardownAction } from './types.ts';

export interface CheckRequest {
  definition: CheckDefinition;
  timeoutMs: number;
}

export interface CheckResponse {
  status: CheckStatus;
  statusCode: number;
  responseTimeMs: number;
  details: string;
  payload?: Record<string, unknown>;
}

export interface SetupRequest {
  action: SetupAction;
  timeoutMs: number;
}

export interface SetupResponse {
  success: boolean;
  statusCode: number;
  createdResource?: { id: string; name: string };
  error?: string;
  details?: Record<string, unknown>;
}

export interface TeardownRequest {
  action: TeardownAction;
  timeoutMs: number;
}

export interface TeardownResponse {
  success: boolean;
  statusCode: number;
  error?: string;
}

/**
 * Extensible Environment Adapter interface.
 * Decouples the lifecycle orchestrator from any specific runtime or network transport.
 * Allows seamless switching between local deterministic mock adapters, staging HTTP adapters, or Kubernetes/VPC adapters.
 */
export interface EnvironmentAdapter {
  readonly adapterName: string;
  executeCheck(req: CheckRequest): Promise<CheckResponse>;
  executeSetupAction(req: SetupRequest): Promise<SetupResponse>;
  executeTeardownAction(req: TeardownRequest): Promise<TeardownResponse>;
}
