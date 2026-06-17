# Data Model: SDD Phase UX — Glanceable State + Action Guidance

**Date**: 2026-06-16

## Changes to existing entities

### PhaseDisplayStatus (extended)

File: `internal/sdd/types.go`

Adds one new value to the existing enum:

| Value | Meaning | Existing? |
|-------|---------|-----------|
| `pending` | Phase has never run | yes |
| `active` | Phase is running for the first time | yes |
| `awaiting-decision` | Gate card open, first run | yes |
| `complete` | Phase approved | yes |
| `rejected` | Phase rejected, awaiting re-run (`⚠ Redo`) | yes |
| `iterating` | Gate card open, second or later run (`↻`) | **NEW** |

Derivation rule for `iterating` (added to `derivePhaseDisplayStatus` in `sdd_wiring.go`):
```
phaseOrder == currentOrder
  && pipelineStatus == StatusAwaitingDecision
  && runCount[phase] >= 2
→ PhaseDisplayIterating
```

### PhaseStatusEntry (extended)

File: `internal/sdd/types.go`

Adds one field:

```go
type PhaseStatusEntry struct {
    Phase         PhaseName          `json:"phase"`
    Order         int                `json:"order"`
    DisplayStatus PhaseDisplayStatus `json:"displayStatus"`
    ArtifactPath  string             `json:"artifactPath"`
    DecidedAt     *time.Time         `json:"decidedAt"`
    RunCount      int                `json:"runCount"` // NEW: total completed runs (0 = never run)
}
```

`RunCount` is 0 for a phase that has never fired `HandlePhaseComplete`. It reaches 1 on the
first completion, 2 on the first re-run completion, etc. The frontend shows `×N` only when N ≥ 2.

### Orchestrator (extended)

File: `internal/sdd/orchestrator.go`

Adds per-phase run counter to the existing `Orchestrator` struct:

```go
type Orchestrator struct {
    // ... existing fields ...
    phaseRunCounts map[PhaseName]int  // NEW: incremented in HandlePhaseComplete
}
```

New exported read method:

```go
// PhaseRunCount returns the number of times HandlePhaseComplete has fired for phase.
func (o *Orchestrator) PhaseRunCount(phase PhaseName) int
```

Counter is incremented inside `HandlePhaseComplete` under the existing `mu` lock, before
fanning out to subscribers (so subscribers see the updated count if they call `PhaseRunCount`).

## New entities

### ActionPrompt

Not a stored entity — a pure derived value computed by `deriveActionPrompt` in `ActionPromptStrip.jsx`.

**Inputs**: `phases []PhaseStatusEntry`, `isCardOpen bool`

**Output**: `string` — exactly one sentence, ≤ 100 characters, ending in a period or command name.

**Derivation priority order** (first match wins):

1. All phases `complete` → `"Pipeline complete."`
2. `isCardOpen && any phase has displayStatus 'iterating'` → `"Approve this iteration, or Reject to try again."`
3. `isCardOpen` (first run gate) → `"Review the artifact above, then Approve, Reject, or Clarify."`
4. Any phase has `displayStatus 'rejected'` → `"Run /speckit-{phase} to retry this phase."`
5. Any phase has `displayStatus 'active'` → `"{Phase} is running…"`
6. phases is non-empty → find first `pending` phase → `"Run {startCommand} to continue."`
7. phases is empty → `"Run /speckit-specify to start a new feature."`

## State transition diagram (extended)

```
                         ┌─────────────────────────────────────────┐
                         │                                         │
  bind (no feature)      │           HandlePhaseComplete (run 1)   │
        │                ▼                                         │
    [idle] ──────────► [pending] ──────────────────────────► [awaiting-decision]
                                                                    │
                                         ┌──────────────────────── │
                                         │  Approve / Clarify       ▼
                                         │                  [advancing → complete]
                                         │  Reject                  │
                                         └──────────────────► [rejected]
                                                                    │
                                                  re-run by user    │
                                                        │           │
                                              HandlePhaseComplete   │
                                               (run 2, counter=2)  │
                                                        │           │
                                                        ▼           │
                                                 [iterating] ◄──────┘
                                                        │
                                         Approve / Clarify │ Reject
                                                        │           │
                                              [complete ×2]   [rejected (again)]
```
