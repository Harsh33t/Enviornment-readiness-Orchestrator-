# 5-Minute Technical Demonstration Script

This walkthrough guides you through demonstrating the **Environment Readiness Prototype** during a technical interview or demo.

---

## 🎯 Demonstration Objective
Show how an orchestration layer on top of testing primitives can:
1. Prevent flaky test runs by validating target readiness *before* starting a suite.
2. Safely bootstrap missing seed data with operator approval.
3. Distinguish **Environment Flakiness** from **Genuine Product Bugs**.
4. Guarantee resource tracking and teardown rollback.

---

## ⏱️ Step-by-Step 5-Minute Flow

### 0:00 – 1:00 | Problem Context & Architecture
1. **Explain the problem:** "In cloud E2E testing, tests frequently fail due to expired auth tokens, 503s, or missing seed records. This masks real product regressions and burns CI time."
2. **Show the architecture:** Point out the local mock isolation, deterministic state machine, and resource ledger.

### 1:00 – 2:00 | Scenario 1: Healthy Run
1. Select **`Healthy Staging Environment`** in the simulation controls.
2. Click **`Run Preflight & Orchestrator`**.
3. **Observe:** All 5 checks return `PASS`. State transitions `PENDING` $\rightarrow$ `PREFLIGHT_RUNNING` $\rightarrow$ `READY` $\rightarrow$ `TEST_RUNNING` $\rightarrow$ `CLEANING_UP` $\rightarrow$ `COMPLETED`.
4. Classification displays: `✓ RUN COMPLETED (ALL PASSED)`.

### 2:00 – 3:00 | Scenario 2: Missing Seed Data & Bootstrap Approval
1. Select **`Missing Required Seed Record`**.
2. Click **`Run Preflight & Orchestrator`**.
3. **Observe:** Preflight returns `WARN` on `chk_records` (HTTP 404). Run halts in `BOOTSTRAPPING` pending operator approval.
4. Point out the **Remediation Panel** showing deterministic root-cause analysis.
5. Click **`Approve & Run Bootstrap Setup`**.
6. **Observe:** `BootstrapExecutor` creates the seed record, registers it in the **Resource Ledger**, reruns preflight to verify `PASS`, executes the test, and automatically cleans up the created entity in teardown.

### 3:00 – 4:00 | Scenario 3: Blocked Run vs. Product Bug
1. Select **`Expired Service Auth Token`** (or **`Target Service Unavailable`**).
2. Click **`Run Preflight & Orchestrator`**.
3. **Observe:** Preflight returns `BLOCK` (HTTP 401/503). Run is immediately halted and classified as `🛑 ENVIRONMENT / SETUP FAILURE`. Zero test minutes wasted.
4. Now select **`Healthy Staging Environment`** and check the box **`Simulate Product Test Regression (Bug)`**.
5. Click **`Run Preflight & Orchestrator`**.
6. **Observe:** Preflight passes 100%, but the test fails. Classification displays: `🐛 GENUINE PRODUCT REGRESSION`. Teardown cleanly runs.

### 4:00 – 5:00 | Scenario 4: Resource Ledger & Teardown Failure
1. Select **`Teardown Deletion Failure`**.
2. Click **`Run Preflight & Orchestrator`**.
3. **Observe:** Run is classified as `⚠️ TEARDOWN CLEANUP FAILED` and the Resource Ledger table highlights the exact uncleaned entity with the error message.
