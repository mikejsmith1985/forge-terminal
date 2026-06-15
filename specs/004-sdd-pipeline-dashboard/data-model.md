# Data Model: SDD Pipeline Dashboard

**Feature**: specs/004-sdd-pipeline-dashboard  
**Date**: 2026-06-15

---

## Existing types (unchanged)

`internal/sdd/types.go` already defines:
- `PhaseName` — `specify | clarify | plan | validate | implement`
- `DecisionCard` — `{cardId, sessionId, phase, summary, actions}`
- `PipelineState` — `{FeatureDir, SessionID, CurrentPhase, PendingCard, Status}`
- `PipelineStatus` — `idle | awaiting-decision | advancing | rejected | complete`

---

## New types

### `PhaseStatusEntry` (`internal/sdd/types.go`)

One row in the status panel. The panel renders one entry per phase.

```
PhaseStatusEntry {
    Phase        PhaseName     // "specify", "clarify", "plan", "validate", "implement"
    Order        int           // 1-5, from phaseTable
    DisplayStatus PhaseDisplayStatus  // "pending" | "active" | "complete" | "rejected"
    ArtifactPath string        // feature-relative path, e.g. "spec.md"; "" for pty-quiet phases
    DecidedAt    *time.Time    // nil while still pending
}
```

### `PhaseDisplayStatus` (`internal/sdd/types.go`)

The status shown on each panel row. Separate from `PipelineStatus` (which is the whole-pipeline status, not per-phase).

```
PhaseDisplayStatus string
    "pending"   // not yet reached
    "active"    // command injected; phase is running (pty-quiet phases only while waiter blocks)
    "awaiting-decision"  // artifact detected; gate card pending
    "complete"  // developer approved
    "rejected"  // developer rejected
```

### `PhaseStatusEvent` (`cmd/forge/sdd_wiring.go`)

The on-the-wire `SDD_PHASE_STATUS` WebSocket message.

```
PhaseStatusEvent {
    Type      string              // always "SDD_PHASE_STATUS"
    SessionID string
    Feature   string              // e.g. "004-sdd-pipeline-dashboard"
    Phases    []PhaseStatusEntry  // all 5 phases, ordered
}
```

### `sddArtifactPreview` (`cmd/forge/sdd_wiring.go`)

Artifact content embedded in the `SDD_PHASE_GATE` envelope (R3).

```
sddArtifactPreview {
    Content      string  // up to sddArtifactMaxLines lines of plain text
    TotalLines   int     // actual line count of the full file
    FilePath     string  // feature-relative path, e.g. "plan.md"
    IsTruncated  bool    // true when TotalLines > sddArtifactMaxLines
}
```

### `sddGateEnvelope` (extended, `cmd/forge/sdd_wiring.go`)

Adds `ArtifactPreview` to the existing struct; omitted for pty-quiet phases.

```
sddGateEnvelope {
    Type             string              // "SDD_PHASE_GATE"
    DecisionCard     (embedded)          // existing fields: cardId, sessionId, phase, summary, actions
    ArtifactPreview  *sddArtifactPreview // null when no artifact (Validate, Implement)
}
```

---

## Frontend state shape (`useSddGate.js`)

```js
// Existing state (unchanged)
card: {             // current SDD_PHASE_GATE payload, or null
    type, cardId, sessionId, phase, summary, actions,
    artifactPreview: { content, totalLines, filePath, isTruncated } | null
}

// New state
phaseStatuses: [    // SDD_PHASE_STATUS payload, or []
    { phase, order, displayStatus, artifactPath, decidedAt }
]
```

---

## State transitions

```
Per-phase display status:

  (new session)  → pending
  pending        → active          [command injected after an Approve, pty-quiet phases only]
  active         → awaiting-decision  [pty-quiet fires HandlePhaseComplete]
  pending        → awaiting-decision  [artifact detected, file-based phases]
  awaiting-decision → complete     [user Approves]
  awaiting-decision → rejected     [user Rejects]
  rejected       → (end; pipeline stopped)
  complete       → (next phase becomes active/pending)
```
