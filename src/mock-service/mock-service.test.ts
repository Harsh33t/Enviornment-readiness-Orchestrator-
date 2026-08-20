import { describe, it, expect, beforeEach } from 'vitest';
import { LocalMockServer } from './mock-server.ts';

describe('Local Mock Environment Service', () => {
  let server: LocalMockServer;

  beforeEach(() => {
    server = new LocalMockServer('HEALTHY');
  });

  it('proves HEALTHY scenario is repeatable', async () => {
    server.setScenario('HEALTHY');

    const ping = await server.getPing();
    expect(ping.status).toBe(200);

    const health = await server.getHealth();
    expect(health.status).toBe(200);
    expect(health.data.status).toBe('healthy');

    const auth = await server.getAuth();
    expect(auth.status).toBe(200);
    expect(auth.data.authenticated).toBe(true);

    const records = await server.getRequiredRecords();
    expect(records.status).toBe(200);
    expect(records.data.found).toBe(true);
    expect(records.data.records.length).toBeGreaterThan(0);
  });

  it('proves MISSING_PREREQUISITE scenario and seed creation', async () => {
    server.setScenario('MISSING_PREREQUISITE');

    const initialRecords = await server.getRequiredRecords();
    expect(initialRecords.status).toBe(404);
    expect(initialRecords.data.found).toBe(false);

    // Create seed record
    const created = await server.createSeedRecord('E2E Dynamic User');
    expect(created.status).toBe(201);
    expect(created.data.created).toBe(true);
    expect(created.data.record?.name).toBe('E2E Dynamic User');

    // Records lookup now succeeds
    const afterRecords = await server.getRequiredRecords();
    expect(afterRecords.status).toBe(200);
    expect(afterRecords.data.found).toBe(true);
  });

  it('proves BLOCKED_AUTH_EXPIRED scenario returns 401', async () => {
    server.setScenario('BLOCKED_AUTH_EXPIRED');

    const auth = await server.getAuth();
    expect(auth.status).toBe(401);
    expect(auth.data.authenticated).toBe(false);
    expect(auth.data.error).toContain('Token expired');
  });

  it('proves BLOCKED_SERVICE_DEGRADED scenario returns 503', async () => {
    server.setScenario('BLOCKED_SERVICE_DEGRADED');

    const health = await server.getHealth();
    expect(health.status).toBe(503);
    expect(health.data.status).toBe('degraded');
  });

  it('proves PARTIAL_SETUP_FAILURE scenario fails on record creation', async () => {
    server.setScenario('PARTIAL_SETUP_FAILURE');

    const createAttempt = await server.createSeedRecord('Test User');
    expect(createAttempt.status).toBe(500);
    expect(createAttempt.data.error).toContain('Mock bootstrap setup failed');
  });

  it('proves CLEANUP_FAILURE scenario fails on teardown deletion', async () => {
    server.setScenario('CLEANUP_FAILURE');

    const deleteAttempt = await server.deleteRecord('usr_seed_001');
    expect(deleteAttempt.status).toBe(500);
    expect(deleteAttempt.data.error).toContain('Mock teardown failed');
  });
});
