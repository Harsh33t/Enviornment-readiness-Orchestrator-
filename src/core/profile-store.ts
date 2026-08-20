import { EnvironmentProfile, ActionType } from './types.ts';

export const ALLOWLISTED_MOCK_BASE_URLS: readonly string[] = [
  'http://localhost:3000/mock-env',
  'http://localhost:3001/mock-env',
  'http://127.0.0.1:3000/mock-env',
  'http://127.0.0.1:3001/mock-env',
  'mock://staging-env',
  'mock://ephemeral-env',
] as const;

export const MAX_TIMEOUT_LIMIT_MS = 60000; // 60s
export const MIN_TIMEOUT_LIMIT_MS = 100;
export const MAX_RETRY_LIMIT = 5;

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Checks if a string or object recursively contains plaintext credentials.
 */
export function hasSensitivePayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('private_key') ||
      lowerKey.includes('api_key') ||
      lowerKey.includes('credential') ||
      lowerKey.includes('auth_header') ||
      lowerKey.includes('bearer')
    ) {
      return true;
    }
    if (value && typeof value === 'object' && hasSensitivePayload(value)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates an environment profile against strict safety and operational constraints.
 */
export function validateEnvironmentProfile(profile: Partial<EnvironmentProfile>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required Fields
  if (!profile.id || typeof profile.id !== 'string' || profile.id.trim().length === 0) {
    errors.push({ field: 'id', message: 'Profile ID is required and cannot be empty.' });
  }

  if (!profile.name || typeof profile.name !== 'string' || profile.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Safe display name is required.' });
  }

  // Exact Allowlisted Mock URL check with robust URL parsing
  if (!profile.mockBaseUrl || typeof profile.mockBaseUrl !== 'string') {
    errors.push({ field: 'mockBaseUrl', message: 'Mock Base URL is required.' });
  } else {
    try {
      const rawUrl = profile.mockBaseUrl.trim();

      // Check against supported mock schemes
      if (rawUrl.startsWith('mock://')) {
        const isMockAllowlisted = ALLOWLISTED_MOCK_BASE_URLS.includes(rawUrl);
        if (!isMockAllowlisted) {
          errors.push({
            field: 'mockBaseUrl',
            message: `Disallowed mock URL '${rawUrl}'. Must be one of: [${ALLOWLISTED_MOCK_BASE_URLS.join(', ')}]`,
          });
        }
      } else {
        const parsed = new URL(rawUrl);

        // Reject credentials in URLs
        if (parsed.username || parsed.password) {
          errors.push({
            field: 'mockBaseUrl',
            message: 'Embedded credentials (username/password) in URL are strictly prohibited.',
          });
        }

        // Only allow http: on localhost or 127.0.0.1
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          errors.push({
            field: 'mockBaseUrl',
            message: `Unsupported protocol '${parsed.protocol}'. Only local HTTP mock endpoints are supported.`,
          });
        }

        // Exact match of normalized origin + pathname
        const normalized = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
        const isExactMatch = ALLOWLISTED_MOCK_BASE_URLS.includes(normalized);

        if (!isExactMatch) {
          errors.push({
            field: 'mockBaseUrl',
            message: `Disallowed Base URL '${rawUrl}'. Normalized URL '${normalized}' must be in the local mock allowlist: [${ALLOWLISTED_MOCK_BASE_URLS.join(
              ', '
            )}]`,
          });
        }
      }
    } catch {
      errors.push({
        field: 'mockBaseUrl',
        message: `Malformed mock Base URL '${profile.mockBaseUrl}'.`,
      });
    }
  }

  // Timeout Limits
  if (typeof profile.timeoutLimitMs !== 'number' || isNaN(profile.timeoutLimitMs)) {
    errors.push({ field: 'timeoutLimitMs', message: 'Timeout limit must be a valid number.' });
  } else if (profile.timeoutLimitMs > MAX_TIMEOUT_LIMIT_MS) {
    errors.push({
      field: 'timeoutLimitMs',
      message: `Timeout limit of ${profile.timeoutLimitMs}ms exceeds maximum allowed limit of ${MAX_TIMEOUT_LIMIT_MS}ms.`,
    });
  } else if (profile.timeoutLimitMs < MIN_TIMEOUT_LIMIT_MS) {
    errors.push({
      field: 'timeoutLimitMs',
      message: `Timeout limit of ${profile.timeoutLimitMs}ms is below minimum allowed limit of ${MIN_TIMEOUT_LIMIT_MS}ms.`,
    });
  }

  // Retry Limits
  if (typeof profile.retryLimit !== 'number' || isNaN(profile.retryLimit)) {
    errors.push({ field: 'retryLimit', message: 'Retry limit must be a valid number.' });
  } else if (profile.retryLimit > MAX_RETRY_LIMIT) {
    errors.push({
      field: 'retryLimit',
      message: `Retry limit of ${profile.retryLimit} exceeds maximum allowed limit of ${MAX_RETRY_LIMIT}.`,
    });
  } else if (profile.retryLimit < 0) {
    errors.push({ field: 'retryLimit', message: 'Retry limit cannot be negative.' });
  }

  // Approved Setup Actions Validation
  if (Array.isArray(profile.approvedSetupActions)) {
    profile.approvedSetupActions.forEach((action, idx) => {
      if (!action.id || !action.name) {
        errors.push({
          field: `approvedSetupActions[${idx}]`,
          message: 'Setup action must have a valid id and name.',
        });
      }

      if (action.type !== ActionType.MOCK_API_REQUEST && action.type !== ActionType.LOCAL_MODULE) {
        errors.push({
          field: `approvedSetupActions[${idx}].type`,
          message: `Unapproved action type '${action.type}'. Only MOCK_API_REQUEST and LOCAL_MODULE are approved.`,
        });
      }

      if (action.maxRetries > MAX_RETRY_LIMIT) {
        errors.push({
          field: `approvedSetupActions[${idx}].maxRetries`,
          message: `Action retries (${action.maxRetries}) exceed safety limit (${MAX_RETRY_LIMIT}).`,
        });
      }

      // Check for plaintext credential leaks in payloads
      if (action.payload && hasSensitivePayload(action.payload)) {
        errors.push({
          field: `approvedSetupActions[${idx}].payload`,
          message: 'Plaintext credentials or live secrets detected in action payload. Plaintext secrets are strictly prohibited.',
        });
      }
    });
  }

  return errors;
}

/**
 * In-memory CRUD Repository for Environment Profiles.
 */
export class EnvironmentProfileStore {
  private profiles: Map<string, EnvironmentProfile> = new Map();

  constructor(initialProfiles?: EnvironmentProfile[]) {
    if (initialProfiles) {
      for (const p of initialProfiles) {
        this.create(p);
      }
    } else {
      this.seedDefaultProfile();
    }
  }

  private seedDefaultProfile(): void {
    const defaultProfile: EnvironmentProfile = {
      id: 'profile_mock_staging',
      name: 'Default Mock Staging Profile',
      description: 'Standard local mock staging environment for E2E suite preflights.',
      mockBaseUrl: 'http://localhost:3000/mock-env',
      checks: [
        {
          id: 'chk_reachability',
          name: 'Target Base Reachability',
          category: 'reachability',
          purpose: 'Verify target mock server is online',
          endpoint: '/ping',
          expectedStatus: 200,
          timeoutMs: 2000,
          remediation: 'Check mock service process',
        },
        {
          id: 'chk_health',
          name: 'Service Health Status',
          category: 'health',
          purpose: 'Verify microservice health status',
          endpoint: '/health',
          expectedStatus: 200,
          timeoutMs: 2000,
          remediation: 'Inspect mock service container',
        },
        {
          id: 'chk_auth',
          name: 'Service Account Auth',
          category: 'auth',
          purpose: 'Verify auth token validity',
          endpoint: '/auth',
          expectedStatus: 200,
          timeoutMs: 2000,
          remediation: 'Refresh service account mock credentials',
        },
        {
          id: 'chk_records',
          name: 'Prerequisite Test Seed Records',
          category: 'data',
          purpose: 'Check required test records exist',
          endpoint: '/records',
          expectedStatus: 200,
          timeoutMs: 2000,
          remediation: 'Run approved bootstrap setup action',
        },
        {
          id: 'chk_feature_flags',
          name: 'Feature Flag Configuration',
          category: 'feature_flag',
          purpose: 'Verify required feature flags are enabled',
          endpoint: '/flags',
          expectedStatus: 200,
          timeoutMs: 2000,
          remediation: 'Enable required flag in configuration',
        },
      ],
      approvedSetupActions: [
        {
          id: 'act_seed_test_user',
          name: 'Seed Test User Entity',
          type: ActionType.MOCK_API_REQUEST,
          endpoint: '/records/seed',
          payload: { role: 'e2e-tester', tenant: 'mock-corp' },
          targetResourceName: 'usr_seed_user',
          timeoutMs: 5000,
          maxRetries: 2,
        },
      ],
      teardownActions: [
        {
          id: 'td_delete_seed_user',
          name: 'Delete Seed Test User',
          resourceId: 'usr_seed_user',
          endpoint: '/records/seed',
          method: 'DELETE',
        },
      ],
      timeoutLimitMs: 15000,
      retryLimit: 2,
    };

    this.profiles.set(defaultProfile.id, defaultProfile);
  }

  public list(): EnvironmentProfile[] {
    return Array.from(this.profiles.values());
  }

  public get(id: string): EnvironmentProfile | undefined {
    return this.profiles.get(id);
  }

  public create(profile: EnvironmentProfile): EnvironmentProfile {
    const errors = validateEnvironmentProfile(profile);
    if (errors.length > 0) {
      throw new Error(`Profile validation failed: ${errors.map((e) => `[${e.field}] ${e.message}`).join('; ')}`);
    }

    if (this.profiles.has(profile.id)) {
      throw new Error(`Profile with ID '${profile.id}' already exists.`);
    }

    this.profiles.set(profile.id, { ...profile });
    return { ...profile };
  }

  public update(id: string, updates: Partial<EnvironmentProfile>): EnvironmentProfile {
    const existing = this.profiles.get(id);
    if (!existing) {
      throw new Error(`Profile '${id}' not found.`);
    }

    const merged: EnvironmentProfile = {
      ...existing,
      ...updates,
      id, // Preserve immutable ID
    };

    const errors = validateEnvironmentProfile(merged);
    if (errors.length > 0) {
      throw new Error(`Profile validation failed: ${errors.map((e) => `[${e.field}] ${e.message}`).join('; ')}`);
    }

    this.profiles.set(id, merged);
    return { ...merged };
  }

  public delete(id: string): boolean {
    return this.profiles.delete(id);
  }
}
