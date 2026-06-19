# Quickstart Validation Guide: SDD Gate Reconciliation

**Feature**: 007-sdd-gate-reconciliation | **Date**: 2026-06-19

Nine scenarios that prove the feature works end-to-end. Run against a live Forge Terminal instance started via `run-dev-clean.ps1`. WebSocket injection uses `window.__wsInject(msg)` (existing test helper).

---

## Prerequisites

- Forge Terminal running via `run-dev-clean.ps1` (never the binary directly — Article V)
- A test project with a `.specify/` directory bound to an active SDD session
- Browser DevTools open for `window.__wsInject` access

---

## Scenario 1 — Stuck pipeline auto-reconciles (US1 / FR-001)

**Setup**: Inject a `SDD_PHASE_STATUS` event with `currentPhase: "clarify"`, `status: "AwaitingDecision"`, and phase entries showing Clarify as AWAITING and Plan/Tasks/Validate/Implement as complete (artifacts exist on disk in the test project).

**Steps**:
1. Inject the status event
2. Wait one broadcast cycle (≤ 2 seconds)
3. Observe the SDD Dashboard phase rail

**Expected**: All phases display their correct completion status. No gate card appears. The pipeline is no longer stuck.

---

## Scenario 2 — Manual Approve resolves all pending gates in one click (US3 / FR-011, FR-013)

**Setup**: Place the orchestrator in state `currentPhase: "clarify"`, `status: "AwaitingDecision"` with Plan/Tasks/Validate/Implement artifacts present on disk. The decision bar shows the Clarify gate card.

**Steps**:
1. Click Approve on the Clarify gate card
2. Observe the dashboard

**Expected**: Dashboard immediately shows all phases complete. No intermediate gate cards appear for Plan, Tasks, Validate, or Implement. Exactly one status update fires.

---

## Scenario 3 — Skip marker triggers countdown (US2 / FR-005, FR-006, FR-009)

**Setup**: Inject a `SDD_PHASE_GATE` event for Clarify with `shouldAutoApprove: true`, `autoApproveAfterSeconds: 20`.

**Steps**:
1. Inject the gate event
2. Observe the decision bar immediately

**Expected**: A countdown from 20 appears. A single "Stop — I want to add input" veto button is visible. The Approve / Reject / Clarify buttons are NOT shown.

---

## Scenario 4 — 20-second countdown auto-approves (US2 / FR-007)

**Setup**: As Scenario 3 but with `autoApproveAfterSeconds: 3` for test speed.

**Steps**:
1. Inject the gate event
2. Wait 3 seconds without interacting

**Expected**: After 3 seconds, Clarify auto-approves. Pipeline advances. A brief "Auto-approved — no clarification needed" confirmation appears. Decision bar clears. Pipeline status updates to show Plan as active.

---

## Scenario 5 — Veto button cancels countdown (US2 / FR-008)

**Setup**: As Scenario 3 (`autoApproveAfterSeconds: 20`).

**Steps**:
1. Inject the gate event (countdown starts)
2. Click "Stop — I want to add input" within 20 seconds

**Expected**: Countdown stops immediately. Standard gate card appears (Approve / Reject / Clarify). No auto-approve fires.

---

## Scenario 6 — Non-skip Clarify shows standard gate (US2 / FR-009 — negative case)

**Setup**: Inject a `SDD_PHASE_GATE` event for Clarify with `shouldAutoApprove: false`.

**Steps**:
1. Inject the gate event
2. Observe the decision bar

**Expected**: Standard gate card appears immediately (Approve / Reject / Clarify). No countdown. No veto button.

---

## Scenario 7 — Auto-approve API failure retries and reverts (US2 / FR-014)

**Setup**: Inject gate event with `autoApproveAfterSeconds: 3`. Intercept the Approve POST (`/api/sdd/decision`) and force it to return HTTP 503 for the first 3 attempts.

**Steps**:
1. Inject gate event
2. Wait 3 seconds (countdown fires)
3. Observe retry behavior (check network tab: 3 × POST → 503)
4. Observe UI after third failure

**Expected**: Three retries visible in the network tab with ~1 second spacing. After the third failure, the standard gate card appears (Approve / Reject / Clarify). The pipeline is not stuck — the user can click Approve manually.

---

## Scenario 8 — Reconciliation is idempotent (FR-002, SC-005)

**Setup**: Project with all 6 phase artifacts on disk. Session in a clean state.

**Steps**:
1. Trigger 10 consecutive `SDD_PHASE_STATUS` events (simulating 10 broadcast cycles)
2. After each event, read the orchestrator state (via `GET /api/sdd/status`)

**Expected**: After the first cycle the state converges to all-complete. Cycles 2–10 produce identical state. No duplicate gate cards. No additional broadcasts fired.

---

## Scenario 9 — In-progress phase is not disturbed by reconciliation (FR-003)

**Setup**: Phases 1–3 complete (artifacts on disk). Phase 4 (Tasks) is actively running — the PTY is active but no artifact yet produced.

**Steps**:
1. Let a status broadcast cycle fire while Phase 4 is running
2. Observe Phase 4 status

**Expected**: Phases 1–3 show complete. Phase 4 shows active/running. Reconciliation does not advance CurrentPhase past Phase 3. Phase 4 is not prematurely marked complete.
