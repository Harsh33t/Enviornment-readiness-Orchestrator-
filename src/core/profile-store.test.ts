import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnvironmentProfileStore,
  validateEnvironmentProfile,
  ALLOWLISTED_MOCK_BASE_URLS,
} from './profile-store.ts';
import { EnvironmentProfile, ActionType } from './types.ts';

describe('EnvironmentProfileStore & Validation', () => {
  let store: EnvironmentProfileStore;

  beforeEach(() => {
    store = new EnvironmentProfileStore([]);
  });

  const validProfile: EnvironmentProfile = {
    id: 'profile_valid_01',
    name: 'Valid Mock Environment Profile',
    description: 'A valid test profile',
    mockBaseUrl: ALLOWLISTED_MOCK_BASE_URLS[0],
    checks: [],
    approvedSetupActions: [
      {
        id: 'act_seed_org',
        name: 'Seed Workspace Org',
        type: ActionType.MOCK_API_REQUEST,
        endpoint: '/orgs/seed',
        targetResourceName: 'org_workspace',
        timeoutMs: 3000,
        maxRetries: 2,
      },
    ],
    teardownActions: [],
    timeoutLimitMs: 10000,
    retryLimit: 3,
  };

  it('creates, retrieves, updates, and deletes profiles successfully', () => {
    const created = store.create(validProfile);
    expect(created.id).toBe('profile_valid_01');

    const retrieved = store.get('profile_valid_01');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Valid Mock Environment Profile');

    const updated = store.update('profile_valid_01', { name: 'Updated Profile Name' });
    expect(updated.name).toBe('Updated Profile Name');

    const deleted = store.delete('profile_valid_01');
    expect(deleted).toBe(true);
    expect(store.get('profile_valid_01')).toBeUndefined();
  });

  it('rejects unknown / non-allowlisted base URLs and hostile near-matches', () => {
    const disallowedUrls = [
      'https://zorro.com/api/v1',
      'https://api.narrative.ai',
      'http://localhost:3000/mock-env-hostile',
      'http://localhost:3000/mock-env/../admin',
      'http://admin:secret@localhost:3000/mock-env',
      'mock://unsupported-external-env',
    ];

    for (const url of disallowedUrls) {
      const invalidUrlProfile: EnvironmentProfile = {
        ...validProfile,
        id: `profile_${Math.random()}`,
        mockBaseUrl: url,
      };

      const errors = validateEnvironmentProfile(invalidUrlProfile);
      expect(errors.some((e) => e.field === 'mockBaseUrl')).toBe(true);
      expect(() => store.create(invalidUrlProfile)).toThrowError(/Disallowed|Malformed|Embedded credentials/);
    }
  });

  it('rejects missing required fields (id, name, mockBaseUrl)', () => {
    const incomplete = {
      description: 'Missing id and name',
    };

    const errors = validateEnvironmentProfile(incomplete);
    expect(errors.some((e) => e.field === 'id')).toBe(true);
    expect(errors.some((e) => e.field === 'name')).toBe(true);
    expect(errors.some((e) => e.field === 'mockBaseUrl')).toBe(true);
  });

  it('rejects excessive timeouts (> 60,000ms) or below minimum', () => {
    const excessiveTimeout = {
      ...validProfile,
      id: 'profile_excessive_timeout',
      timeoutLimitMs: 120000, // 2 minutes
    };

    const errors = validateEnvironmentProfile(excessiveTimeout);
    expect(errors.some((e) => e.field === 'timeoutLimitMs')).toBe(true);
    expect(errors[0].message).toContain('exceeds maximum allowed limit');
  });

  it('rejects unbounded retries (> 5 retries)', () => {
    const excessiveRetries = {
      ...validProfile,
      id: 'profile_excessive_retries',
      retryLimit: 10,
    };

    const errors = validateEnvironmentProfile(excessiveRetries);
    expect(errors.some((e) => e.field === 'retryLimit')).toBe(true);
    expect(errors[0].message).toContain('exceeds maximum allowed limit');
  });

  it('rejects unapproved action types', () => {
    const badActionTypeProfile: EnvironmentProfile = {
      ...validProfile,
      id: 'profile_bad_action',
      approvedSetupActions: [
        {
          id: 'act_unapproved',
          name: 'Dangerous Shell Action',
          type: 'ARBITRARY_SHELL_EXEC' as unknown as ActionType,
          targetResourceName: 'shell_res',
          timeoutMs: 1000,
          maxRetries: 1,
        },
      ],
    };

    const errors = validateEnvironmentProfile(badActionTypeProfile);
    expect(errors.some((e) => e.field === 'approvedSetupActions[0].type')).toBe(true);
    expect(errors[0].message).toContain('Unapproved action type');
  });

  it('rejects plaintext credentials in shallow and nested action payloads', () => {
    const credentialLeakProfiles: EnvironmentProfile[] = [
      {
        ...validProfile,
        id: 'profile_leak_shallow',
        approvedSetupActions: [
          {
            id: 'act_leaky',
            name: 'Leaky Action',
            type: ActionType.MOCK_API_REQUEST,
            endpoint: '/login',
            payload: { user: 'admin', password: 'plainTextPassword123' },
            targetResourceName: 'auth_res',
            timeoutMs: 2000,
            maxRetries: 1,
          },
        ],
      },
      {
        ...validProfile,
        id: 'profile_leak_nested',
        approvedSetupActions: [
          {
            id: 'act_nested_leaky',
            name: 'Nested Leaky Action',
            type: ActionType.MOCK_API_REQUEST,
            endpoint: '/auth',
            payload: { auth: { credentials: { secret_key: 'sk_live_123456789' } } },
            targetResourceName: 'auth_res',
            timeoutMs: 2000,
            maxRetries: 1,
          },
        ],
      },
    ];

    for (const p of credentialLeakProfiles) {
      const errors = validateEnvironmentProfile(p);
      expect(errors.some((e) => e.field === 'approvedSetupActions[0].payload')).toBe(true);
      expect(errors[0].message).toContain('Plaintext credentials or live secrets detected');
    }
  });
});
