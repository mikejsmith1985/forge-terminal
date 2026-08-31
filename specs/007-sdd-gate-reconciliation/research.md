# Research: SDD Gate Reconciliation

**Feature**: 007-sdd-gate-reconciliation | **Date**: 2026-06-19

All technical decisions for this feature are resolved here. No NEEDS CLARIFICATION items remain.

---

## Decision 1 — Reconciliation Trigger Point

**Chosen**: Add `ReconcileFromDisk(featureDir string)` method to `internal/sdd/Orchestrator`. Call it:
- At the start of `broadcastSddPhaseStatus` (before `buildPhaseStatuses`) — satisfies FR-001 (auto-reconcile on every status cycle)
- Inside `SubmitDecision(ActionApprove)` after advancing `CurrentPhase` — satisfies FR-011 (bulk Approve semantics)

**Rationale**: A single method avoids duplicating the "scan artifacts → advance state" logic. Both call sites share the same idempotent reconciliation pass. Calling after every Approve is safe because the operation is idempotent (FR-002).

**Alternatives rejected**:
- Reconciliation inside `buildPhaseStatuses` — that function derives display state; mutating orchestrator state from within a read-only derivation violates single-responsibility.
- Reconciliation inside `State()` — mutating on a pure read is surprising and would break every unit test that calls `State()` without expecting a side effect.
- Separate broadcast event (`SDD_RECONCILED`) — unnecessary; reconciled state is already communicated via the next `SDD_PHASE_STATUS` broadcast.

---

## Decision 2 — Skip Signal Marker

**Chosen**: The canonical skip marker is the string `<!-- clarify:skip -->`. It is appended to `signalContentMarker`'s recognized pattern list in `internal/sdd/phases.go`. When the PTY monitor detects this marker in the Clarify phase output, the orchestrator sets `DecisionCard.ShouldAutoApprove = true` in the next `SDD_PHASE_GATE` broadcast.

**Rationale**: Reuses the existing `signalContentMarker` detection path with zero new machinery. The HTML comment format is invisible in rendered Markdown (safe if the agent outputs it inside a spec file) and unambiguous in terminal output. The constant is defined once in `phases.go` alongside the phase definition.

**Alternatives rejected**:
- New tool call / `skip_phase` action — requires a schema change, an extra WebSocket round-trip, and agent prompt updates; disproportionate for a one-phase signal.
- Natural language phrase ("no changes needed") — too fuzzy; could appear in normal agent output and trigger false positives.
- Frontend-only heuristic (check if spec was modified since last gate) — file-system I/O in the renderer, fragile, and not auditable.

---

## Decision 3 — Auto-Approve Timeout Storage

**Chosen**: Add `AutoApproveAfterSeconds int` to the `Phase` struct in `internal/sdd/phases.go`. Clarify phase: `AutoApproveAfterSeconds: 20`. All other phases: `AutoApproveAfterSeconds: 0` (disabled).

**Rationale**: Per-phase configuration lives alongside the phase definition, not scattered across wiring, config files, or frontend constants. Value `0` means "no auto-approve" — no magic string or sentinel enum needed. The value is transmitted to the frontend in `DecisionCard` so the countdown duration is server-authoritative.

**Alternatives rejected**:
- Environment variable / config file — overengineered for a single phase with a well-understood default; harder to override per-phase.
- Frontend-only constant — the backend would still need to signal "auto-approve eligible"; splitting the timeout between frontend and backend creates drift risk.

---

## Decision 4 — Frontend Countdown State Machine

**Chosen**: `useSddGate.js` gains two new state fields: `countdownSecondsRemaining` (number | null) and `isVetoed` (boolean). When `card.shouldAutoApprove` is true and `isVetoed` is false, a `useEffect` starts a 1-second `setInterval` that decrements `countdownSecondsRemaining`. At 0 it calls `submitDecision(ActionApprove)` via a retry wrapper (up to 3 attempts, 1 second backoff between attempts — FR-014). On veto button click, `isVetoed` is set true, the interval is cleared, and the standard gate card displays. Retry failures after 3 attempts clear `countdownSecondsRemaining` and revert to the standard gate card.

**Rationale**: All countdown logic in the hook; `SddDashboard.jsx` renders from props. The hook is independently testable with Vitest by mocking `setInterval`. The veto and retry paths are synchronous state transitions — no new async primitives needed.

**Alternatives rejected**:
- Countdown in `SddDashboard.jsx` — mixes stateful behavior with rendering; harder to unit-test without mounting the full component tree.
- Server-side countdown — rejected in clarification (client-side is correct for this use case; avoids backend timer management).
- `useReducer` for the countdown state machine — the state is simple enough that `useState` is sufficient; `useReducer` would add boilerplate with no benefit.

---

## Decision 5 — Bulk Approve in SubmitDecision

**Chosen**: Inside `Orchestrator.SubmitDecision(ActionApprove)`, after advancing `CurrentPhase` to the next phase, call `ReconcileFromDisk(state.FeatureDir)` synchronously before returning. The wiring layer then broadcasts once. This advances the pipeline through all already-complete phases in a single operation, satisfying FR-011 and FR-013.

**Rationale**: `ReconcileFromDisk` is idempotent — calling it after every Approve is safe and adds no observable overhead (it is a sequential disk-existence check, not a network call). `SubmitDecision` is the correct owner because it is the gatekeeper of all state transitions; wiring should not know the reconciliation strategy.

**Alternatives rejected**:
- Reconcile in wiring after `SubmitDecision` — violates encapsulation; wiring would need to know when to reconcile, duplicating orchestrator logic.
- Emit one gate card per intermediate phase — rejected by FR-013; the user must not see a cascade of gate cards for already-complete phases.
- Reconcile only on the next broadcast cycle — user clicks Approve and sees stale state briefly; unacceptable UX for Story 3.

---

## Affected Files (mapped to decisions)

| File | Change Type | Decisions |
|------|------------|-----------|
| `internal/sdd/orchestrator.go` | MODIFIED | D1, D5 — add `ReconcileFromDisk`, modify `SubmitDecision` |
| `internal/sdd/orchestrator_test.go` | MODIFIED | D1, D5 — tests for reconciliation and bulk Approve |
| `internal/sdd/phases.go` | MODIFIED | D2, D3 — skip marker constant, `AutoApproveAfterSeconds` field |
| `internal/sdd/types.go` | MODIFIED | D2, D3 — `ShouldAutoApprove bool` and `AutoApproveAfterSeconds int` on `DecisionCard` |
| `cmd/forge/sdd_wiring.go` | MODIFIED | D1, D2 — call `ReconcileFromDisk` before broadcast; set `ShouldAutoApprove` in gate card |
| `cmd/forge/sdd_wiring_test.go` | MODIFIED | D1 — reconciliation broadcast tests |
| `frontend/src/hooks/useSddGate.js` | MODIFIED | D4 — countdown state, veto, retry-on-failure |
| `frontend/src/hooks/useSddGate.test.js` | MODIFIED | D4 — countdown, veto, retry unit tests |
| `frontend/src/components/SddDashboard.jsx` | MODIFIED | D4 — countdown UI, veto button |
| `frontend/src/components/SddDashboard.css` | MODIFIED | D4 — countdown indicator styles |
| `frontend/src/components/SddDashboard.test.jsx` | MODIFIED | D4 — countdown rendering tests |
