# Data Model: SDD Gate Reconciliation

**Feature**: 007-sdd-gate-reconciliation | **Date**: 2026-06-19

This document records all entity changes. Unchanged structs are omitted.

---

## Modified: `Phase` (internal/sdd/types.go)

The `Phase` struct gains one field for opt-in auto-approve:

| Field | Type | Description |
|-------|------|-------------|
| `AutoApproveAfterSeconds` | `int` | Seconds before a skip-signalled gate self-approves. `0` = auto-approve disabled for this phase. |

**Validation**: Must be ≥ 0. A value of 0 means the phase always requires a manual gate decision.

**Populated by**: `phases.go` phase table. Clarify phase: `20`. All others: `0`.

---

## Modified: `DecisionCard` (internal/sdd/types.go)

The `DecisionCard` struct gains two fields so the frontend can render the countdown without client-side configuration:

| Field | Type | Description |
|-------|------|-------------|
| `ShouldAutoApprove` | `bool` | True when the phase completion signal contained the skip marker (`<!-- clarify:skip -->`). Frontend starts countdown when true. |
| `AutoApproveAfterSeconds` | `int` | Countdown duration in seconds (copied from `Phase.AutoApproveAfterSeconds` when `ShouldAutoApprove` is true). |

**State transitions**:
- `ShouldAutoApprove = false` → frontend renders standard gate card (Approve / Reject / Clarify)
- `ShouldAutoApprove = true` → frontend renders countdown + veto button only; auto-submits Approve after `AutoApproveAfterSeconds` seconds unless vetoed

---

## Unchanged: `PhaseStatusEntry` (internal/sdd/types.go)

No changes. `ArtifactPath` is already emitted as an absolute path (fixed in v7.19.2).

---

## New: `ReconcileFromDisk` method (internal/sdd/orchestrator.go)

Not a data entity, but a state-transition operation relevant to the data model:

```
ReconcileFromDisk(featureDir string)
  For each phase in ascending order:
    If phase.ExpectedArtifact == "":
      skip (no artifact to check)
    If file exists at filepath.Join(featureDir, phase.ExpectedArtifact):
      If phase.Order > currentPhaseOrder AND phase.Order <= currentPhaseOrder + 1:
        advance CurrentPhase to this phase
    Else:
      stop scanning (first missing artifact = current frontier)
```

**Invariants**:
- Never advances past a phase whose artifact does not exist on disk.
- Never rewinds CurrentPhase (only advances forward).
- Idempotent: running on an already-reconciled state produces no change.
- Does not fire gate cards or broadcasts — the caller (wiring) broadcasts once after reconciliation.

---

## Frontend State: `useSddGate` hook additions

| State field | Type | Initial value | Description |
|-------------|------|---------------|-------------|
| `countdownSecondsRemaining` | `number \| null` | `null` | Active countdown value; null when no countdown is running |
| `isVetoed` | `boolean` | `false` | True when user clicked the veto button; persists until card is dismissed |

**Transitions**:
- Card arrives with `shouldAutoApprove: true` → set `countdownSecondsRemaining = card.autoApproveAfterSeconds`, `isVetoed = false`
- Each 1-second tick → decrement `countdownSecondsRemaining`
- `countdownSecondsRemaining` reaches 0 → call `submitDecision(ActionApprove)` (with retry), set `countdownSecondsRemaining = null`
- Veto clicked → `isVetoed = true`, clear interval, `countdownSecondsRemaining = null`
- All retries fail → `countdownSecondsRemaining = null`, `isVetoed = true` (shows standard gate card)
- Gate cleared (card dismissed) → reset both fields to initial values

---

## Skip Signal Constant

Defined in `internal/sdd/phases.go`:

```go
// clarifySkipMarker is the canonical string an agent must output in its
// terminal response to signal that the Clarify phase found no changes needed.
// When detected by signalContentMarker, ShouldAutoApprove is set on the gate card.
const clarifySkipMarker = "<!-- clarify:skip -->"
```
