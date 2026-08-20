# Mock Environment Service Guide

This document describes the design, endpoints, fixtures, and execution modes of the **Local Mock Environment Service**.

---

## 1. Overview

The mock service provides a **100% offline, deterministic simulation** of a cloud E2E target staging environment. It eliminates external dependencies and guarantees reproducible preflight check results.

---

## 2. Endpoints & Responses

| Endpoint / Method | Purpose | Normal Response | Failure / Degraded Response |
| :--- | :--- | :--- | :--- |
| `getPing()` | Network reachability | `200 { reachable: true }` | Network timeout / throw |
| `getHealth()` | Microservice health | `200 { status: "healthy" }` | `503 { status: "degraded" }` |
| `getAuth()` | Service Account Auth | `200 { authenticated: true }` | `401 { error: "Token expired" }` |
| `getFeatureFlags()` | Feature flags config | `200 { flags: { ... } }` | `200 { flags: {} }` (missing flags) |
| `getRequiredRecords()` | Prerequisite seed data | `200 { found: true, records: [...] }` | `404 { found: false }` |
| `createSeedRecord(name)` | Bootstrap action | `201 { created: true }` | `500 { error: "Setup failed" }` |
| `deleteRecord(id)` | Teardown cleanup | `200 { deleted: true }` | `500 { error: "Teardown failed" }` |

---

## 3. Deterministic Scenarios & Fixtures

1. **`HEALTHY`**: All endpoints return `200 OK`. Preflight passes immediately; run moves to `READY`.
2. **`MISSING_PREREQUISITE`**: Health & Auth pass, but seed data returns `404`. Preflight returns `WARN`, prompting `BOOTSTRAPPING`.
3. **`BLOCKED_AUTH_EXPIRED`**: Auth returns `401 Unauthorized`. Preflight returns `BLOCK`, preventing run start.
4. **`BLOCKED_SERVICE_DEGRADED`**: Target service returns `503 Service Unavailable`. Preflight returns `BLOCK`.
5. **`PARTIAL_SETUP_FAILURE`**: Setup begins but fails on creation (`500`), triggering resource tracking rollback.
6. **`CLEANUP_FAILURE`**: Teardown fails to delete created mock entities (`500`), moving run to `CLEANUP_FAILED`.

---

## 4. How to Use the Mock Service in Code

```typescript
import { LocalMockServer } from './src/mock-service/mock-server.ts';
import { PreflightRunner } from './src/runner/preflight.ts';

// 1. Initialize server with a scenario fixture
const mockServer = new LocalMockServer('HEALTHY');

// 2. Attach Preflight Runner
const runner = new PreflightRunner(mockServer);

// 3. Execute deterministic checks
const report = await runner.runAll();
console.log('Preflight status:', report.overallStatus); // PASS
console.log('Suggested state:', report.suggestedRunState); // READY
```
