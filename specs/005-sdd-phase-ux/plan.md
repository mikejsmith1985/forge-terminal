# Implementation Plan: SDD Phase UX — Glanceable State + Action Guidance

**Branch**: `feature/005-sdd-phase-ux` | **Date**: 2026-06-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-sdd-phase-ux/spec.md`

## Summary

The SDD pipeline panel (shipped in spec-004) cannot distinguish "phase running for the
first time" from "phase re-running after rejection" from "phase complete" — three visually
identical states. The fix has two independent parts:

1. **Backend**: track a per-phase `RunCount` inside the orchestrator's in-memory state and
   surface it in the `SDD_PHASE_STATUS` WebSocket event. Add a new `iterating` display status
   that fires when `RunCount ≥ 2` and the phase is at the gate.

2. **Frontend**: update `SddPipelinePanel` to render five visually distinct state icons,
   show a `×N` counter when N ≥ 2, and add an `ActionPromptStrip` component that maps the
   current pipeline state to exactly one imperative sentence — shown in the panel footer and
   in the `PhaseDecisionCard` footer.

No new transport, no new layout containers, no external dependencies beyond what already exists.

## Technical Context

**Language/Version**: Go 1.22 (backend), React 18 / Vite (frontend)

**Primary Dependencies**: `sync.Map` + `tutor.Watcher` (Go); Vitest + Playwright (test)

**Storage**: In-memory `phaseRunCounts map[PhaseName]int` on the orchestrator; no persistence
required (counter resets on new session/feature bind, matching pipeline lifecycle in spec-004).

**Testing**: Go `testing` package (unit, mocked); Vitest (React component/hook unit tests);
Playwright (`@playwright/test`) for UX tests against `run-dev-clean.ps1`.

**Target Platform**: Desktop Forge Terminal (Electron + Chromium renderer). No mobile scope.

**Project Type**: Fullstack desktop app (Go binary + embedded React frontend).

**Performance Goals**: State transition animation ≤ 16 ms (one frame at 60 fps). Action prompt
derivation is a pure function; no async work.

**Constraints**: No new HTTP endpoints. No new WebSocket message types beyond the existing
`SDD_PHASE_STATUS` (extend its payload instead). `PhaseStatusEntry` change is
backward-compatible: frontend falls back to `runCount: 0` if the field is absent.

**Scale/Scope**: Five phases, one active pipeline per session, one action prompt at a time.

## Constitution Check

| Article | Gate | Status |
|---------|------|--------|
| I — Prime Directive | Best route, not fastest | ✓ Extending existing types is simpler than a new event type |
| II — Process Protection | No wildcard kills | ✓ No process management in this feature |
| III — Branching | Feature branch required | ✓ `feature/005-sdd-phase-ux` |
| IV — Code Quality | Self-documenting names, verb-first, no magic numbers | ✓ All prompt strings are named constants; icon map is keyed by enum value |
| V — Testing | Red → Green → Refactor; 3-layer separation | ✓ Unit tests first (mocked); Playwright tests last |
| VI — Docs | CHANGELOG updated in PR | ✓ |
| VII — Framework-First | Confirm no framework already provides it | ✓ See Framework-First verdict below |
| X — Verification | Evidence required; xterm.js buffer for terminal assertions | ✓ Playwright reads buffer, not DOM |

**Framework-First verdict**: All three deliverables extend existing components:
- `RunCount` counter: in-memory map on the existing `Orchestrator` struct (no new package)
- `iterating` status: new value in the existing `PhaseDisplayStatus` enum (no new type)
- `ActionPromptStrip`: new React component in the existing `components/` directory; it is a
  pure function of `phaseStatuses` + `isCardOpen` — no external state manager, no new hook.
  The project has no framework for "derived string from state machine" that would cover this;
  a small component is the right size. *Custom because*: no existing Forge component maps
  pipeline state to a prompt string; the closest (PhaseDecisionCard) is a card, not a strip.

## Project Structure

### Documentation (this feature)

```text
specs/005-sdd-phase-ux/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── sdd-phase-status-v2.md   ← Phase 1 output (extended payload contract)
└── tasks.md             ← /speckit-tasks output (not created here)
```

### Source Code

```text
internal/sdd/
├── types.go             ← add PhaseDisplayIterating, RunCount on PhaseStatusEntry
├── orchestrator.go      ← add phaseRunCounts map, PhaseRunCount() method
└── orchestrator_test.go ← add run-count unit tests

cmd/forge/
└── sdd_wiring.go        ← update buildPhaseStatuses + derivePhaseDisplayStatus

frontend/src/
├── components/
│   ├── SddPipelinePanel.jsx      ← update STATUS_ICON, add ×N counter, mount ActionPromptStrip
│   ├── SddPipelinePanel.css      ← add per-state colour classes + animation
│   ├── SddPipelinePanel.test.jsx ← update icon tests, add counter + prompt tests
│   ├── ActionPromptStrip.jsx     ← new: maps pipeline state → single sentence
│   ├── ActionPromptStrip.css     ← new: bold strip styling
│   ├── ActionPromptStrip.test.jsx← new: unit tests for every prompt variant
│   ├── PhaseDecisionCard.jsx     ← add ActionPromptStrip in card footer
│   └── PhaseDecisionCard.test.jsx← add footer prompt test
└── hooks/
    └── useSddGate.js             ← no changes (runCount flows through phaseStatuses already)
```

**Structure Decision**: All changes are in-place extensions of spec-004 files. The only new
files are `ActionPromptStrip.jsx/.css/.test.jsx` — small enough to not warrant a new directory.

## Complexity Tracking

No constitution violations.

## Technical Decisions (from research)

### Decision 1 — Where to track RunCount

**Chosen**: In-memory `phaseRunCounts map[PhaseName]int` on the `Orchestrator` struct,
incremented inside `HandlePhaseComplete` under the existing mutex.

**Rationale**: `HandlePhaseComplete` is already the single completion seam (I1 from spec-003);
incrementing a counter there requires zero new events or goroutines. Reading history from disk
(`history.go`) on every `buildPhaseStatuses` call would add I/O to a hot path and couple the
display layer to the persistence layer.

**Alternatives rejected**:
- Read `history.go` on every status broadcast — couples display to disk, adds I/O latency
- New `SDD_PHASE_STARTED` event from the terminal — requires hooking the PTY input path, which
  is unrelated to the completion seam; overly invasive for this UX-only feature

### Decision 2 — When does `iterating` fire?

**Chosen**: `iterating` is the display status of the current phase when `RunCount ≥ 2` AND
`pipelineStatus == StatusAwaitingDecision`. This means the gate card is open for a re-run.

**Rationale**: We have no "phase started" event (the watcher fires on artifact write, not
command entry). The most legible disambiguation is at the gate card: a gate with `runCount ≥ 2`
is visually tagged `↻ Iterating` instead of `⏳ Awaiting`. The `⚠ Redo` state already covers
the gap between rejection and re-run (when `pipelineStatus == StatusRejected`).

**State table (complete)**:

| Condition | Display Status |
|-----------|----------------|
| `currentOrder == 0` | `pending` (all phases) |
| `phaseOrder < currentOrder` | `complete` |
| `phaseOrder == currentOrder && status == AwaitingDecision && runCount == 1` | `awaiting-decision` |
| `phaseOrder == currentOrder && status == AwaitingDecision && runCount >= 2` | `iterating` |
| `phaseOrder == currentOrder && status == Rejected` | `rejected` |
| `phaseOrder == currentOrder && status ∈ {Advancing, Complete}` | `complete` |
| `phaseOrder == currentOrder+1 && status == Advancing` | `active` |
| otherwise | `pending` |

### Decision 3 — Action prompt derivation

**Chosen**: Pure function `deriveActionPrompt(phases []PhaseStatusEntry, isCardOpen bool) string`
defined inside `ActionPromptStrip.jsx`. All prompt strings are named constants at the top of
the file. The function reads the first non-complete phase to determine context.

**Prompt string table**:

| Condition | Prompt |
|-----------|--------|
| All phases complete | `Pipeline complete.` |
| `isCardOpen && iterating phase` | `Approve this iteration, or Reject to try again.` |
| `isCardOpen` (first run) | `Review the artifact above, then Approve, Reject, or Clarify.` |
| Any phase `rejected` | `Run /speckit-{phase} to retry this phase.` |
| Any phase `active` | `{Phase} is running…` |
| No phase active, first pending phase | `Run {startCommand} to continue.` |
| No pipeline (phases empty) | `Run /speckit-specify to start a new feature.` |

### Decision 4 — Animation approach

**Chosen**: Two CSS mechanisms applied to the existing BEM modifier classes in `SddPipelinePanel.css`. No JavaScript animation library.

1. **State-change transitions**: `transition: color 200ms ease, background-color 200ms ease` on the `.sdd-pipeline-panel__row` base rule — fires automatically on every React class-swap, making all state changes visually animated.
2. **Continuous spin**: `@keyframes sdd-spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }` applied via `animation: sdd-spin 0.8s linear infinite` to the icon `<span>` inside both `.sdd-pipeline-panel__row--active` (blue) and `.sdd-pipeline-panel__row--iterating` (amber). Colour alone distinguishes the two spinning states (Q2 clarification applied 2026-06-17).

**Rationale**: The project already uses BEM modifiers per display status. Both `⟳ Running` and `↻ Iterating` spin because a spinning icon universally signals "in progress." Colour as the sole differentiator is sufficient and matches the spec's existing icon+colour contract. Zero bundle cost; zero JavaScript animation logic.
