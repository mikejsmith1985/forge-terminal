# Implementation Plan: SDD Pipeline Dashboard

**Branch**: `feature/006-sdd-pipeline-dashboard` | **Date**: 2026-06-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-sdd-pipeline-dashboard/spec.md`

## Summary

Replace the collapsible `SddPipelinePanel` (bottom bar) and floating `PhaseDecisionCard` (drawer) with a single always-visible `SddDashboard` component. The dashboard shows all 6 pipeline phases in a horizontal rail with live status icons, renders inline decision controls when a gate is open, expands a per-phase detail strip on click, and feeds into an always-present action prompt. No new backend endpoints. No new WebSocket message types. Two components and six files are deleted; one new component (`SddDashboard`) and one minor hook update (`useSddGate` gains `featureName` + `phaseSummaries`) replace everything.

## Technical Context

**Language/Version**: Go 1.22 (no backend changes); React 18 / Vite (frontend only)

**Primary Dependencies**: `useSddGate` hook (existing); `ActionPromptStrip` (existing, unchanged); `lucide-react` icons; native HTML `<dialog>` element (Chromium, no library); Vitest + Playwright (`@playwright/test`)

**Storage**: Local React state in `SddDashboard` (`selectedPhase`, `isClarifyOpen`); `phaseSummaries` in a `useRef` inside `useSddGate` (no persistence — resets with session)

**Testing**: Vitest (unit, mocked) for all new React components and hook changes; Playwright against `run-dev-clean.ps1` for UX scenarios; no new Go tests (no backend changes)

**Target Platform**: Desktop Forge Terminal (Electron + Chromium renderer). No mobile scope.

**Project Type**: Fullstack desktop app (Go binary + embedded React frontend) — frontend-only change.

**Performance Goals**: Phase rail renders in ≤ 1 frame (16 ms) on each `SDD_PHASE_STATUS` event. Detail strip expand/collapse ≤ 150 ms CSS transition. No JavaScript animation — CSS only.

**Constraints**: No new HTTP endpoints. No new WebSocket message types. `SDD_PHASE_STATUS` payload is unchanged on the wire; only the frontend extraction of `feature` field is new. `PhaseStatusEntry` and `PhaseSummary` Go types are unchanged.

**Scale/Scope**: One dashboard per session, six phase cells, one open detail strip at a time, one action prompt sentence.

## Constitution Check

| Article | Gate | Status |
|---------|------|--------|
| I — Prime Directive | Best route, not fastest | ✓ Replacing two broken components with one cohesive one; no shortcuts |
| II — Process Protection | No wildcard kills | ✓ No process management in this feature |
| III — Branching | Feature branch required | ✓ `feature/006-sdd-pipeline-dashboard` |
| IV — Code Quality | Self-documenting names, verb-first, no magic numbers | ✓ All icon/status maps are named constants; sub-components are verb-first |
| V — Testing | Red → Green → Refactor; 3-layer separation | ✓ Vitest unit tests first; Playwright UX tests last |
| VI — Docs | CHANGELOG updated in PR | ✓ |
| VII — Framework-First | Confirm no framework already provides it | ✓ See Framework-First verdict below |
| X — Verification | Evidence required; xterm.js buffer for terminal assertions | ✓ Playwright reads buffer, not DOM |

**Framework-First verdict**: No external UI framework provides a "phase status rail" or "inline decision bar" for this specific use case. The native `<dialog>` element replaces a custom modal pattern (Article VII satisfied). BEM CSS modifiers and `lucide-react` icons are already in use. All sub-components are new React functions in a single file — no external dependency added. *Custom because*: no existing Forge component maps an ordered pipeline phase array to a horizontal status rail with per-cell drill-down; the closest (`SddPipelinePanel`) is a vertical collapsible list, which is what we are replacing.

## Project Structure

### Documentation (this feature)

```text
specs/006-sdd-pipeline-dashboard/
├── plan.md              ← this file
├── spec.md              ← feature specification
├── research.md          ← Phase 0 output (all decisions resolved)
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output (9 validation scenarios)
├── contracts/
│   └── sdd-dashboard-props-v1.md   ← Phase 1 output (component interface contract)
└── tasks.md             ← Phase 2 output (/speckit-tasks — not created here)
```

### Source Code

```text
frontend/src/
├── components/
│   ├── SddDashboard.jsx          ← NEW: unified dashboard (PhaseRail + DetailStrip + DecisionBar)
│   ├── SddDashboard.css          ← NEW: BEM styles for all dashboard sub-surfaces
│   ├── SddDashboard.test.jsx     ← NEW: Vitest unit tests (mocked, no real WS)
│   ├── ActionPromptStrip.jsx     ← UNCHANGED
│   ├── ActionPromptStrip.css     ← UNCHANGED
│   ├── ActionPromptStrip.test.jsx← UNCHANGED
│   ├── PhaseDecisionCard.jsx     ← DELETED (replaced by DecisionBar inside SddDashboard)
│   ├── PhaseDecisionCard.css     ← DELETED
│   ├── PhaseDecisionCard.test.jsx← DELETED
│   ├── SddPipelinePanel.jsx      ← DELETED (replaced by SddDashboard)
│   ├── SddPipelinePanel.css      ← DELETED
│   └── SddPipelinePanel.test.jsx ← DELETED
├── hooks/
│   ├── useSddGate.js             ← MODIFIED: add featureName state + phaseSummaries ref
│   └── useSddGate.test.js        ← MODIFIED: add tests for featureName and phaseSummaries
└── App.jsx                       ← MODIFIED: replace two component renders with one SddDashboard
```

**Structure Decision**: All `SddDashboard` sub-components (`DashboardHeader`, `PhaseRail`, `PhaseCell`, `PhaseDetailStrip`, `DecisionBar`, `ClarifyModal`) are local functions inside `SddDashboard.jsx` — each is ≤ 40 lines, shares the same CSS namespace, and has no independent test surface. `ClarifyModal` is a named export to allow isolated Vitest testing of the Confirm-disabled / Confirm-enabled logic.

## Technical Decisions (from research)

### Decision 1 — Feature Name Source

**Chosen**: Extract `feature` from the existing `SDD_PHASE_STATUS` WebSocket event (`sddPhaseStatusEnvelope.Feature` already populated at `filepath.Base(state.FeatureDir)`). `useSddGate` gains a `featureName` useState string updated on each `SDD_PHASE_STATUS` event.

**Rationale**: The field already exists in the backend payload (`cmd/forge/sdd_wiring.go` line 314). No backend change needed. **Alternatives rejected**: new `SDD_FEATURE_BIND` event (redundant); derive from sessionId (not the feature name).

### Decision 2 — Phase Summary Accumulation

**Chosen**: `useSddGate` gains a `phaseSummaries` `useRef` (not `useState`) populated each time a `SDD_PHASE_GATE` event arrives. `phaseSummaries.current[phase] = card.summary`. Exposed as `phaseSummaries` in the hook return (the ref object, not `.current` — callers use `phaseSummaries.current[phase]`).

**Rationale**: Summaries only change at gate time (not at every status tick), so a ref avoids unnecessary re-renders. Summaries survive gate closure so the detail strip shows correct data for any completed phase. **Alternatives rejected**: add summaries to `SDD_PHASE_STATUS` broadcast (increases payload on every tick); new `/api/sdd/phase-summary` endpoint (spec forbids new endpoints); read from history on demand (disk I/O on click, couples display to persistence).

### Decision 3 — Sub-Component Locality

**Chosen**: All sub-components are local functions in `SddDashboard.jsx`. `ClarifyModal` is a named export.

**Rationale**: Each sub-component is ≤ 40 lines, shares the same CSS namespace, and has no test surface independent of the dashboard. **Alternative rejected**: one file per sub-component (5 extra files, no benefit).

### Decision 4 — Clarify Modal

**Chosen**: Native HTML `<dialog>` element with `dialog.showModal()` / `dialog.close()` managed via `useEffect` keyed on `isClarifyOpen`.

**Rationale**: Chromium (Electron) supports `<dialog>` fully. Provides a free focus trap, `Escape` dismissal, and top-layer rendering — no JavaScript focus management or z-index juggling needed. **Alternative rejected**: custom `position: fixed` backdrop (rebuilds what `<dialog>` provides natively; Article VII prohibits it without justification).

### Decision 5 — Layout Stability

**Chosen**: Dashboard outer container fixed height via CSS. `PhaseDetailStrip` positioned `absolute; bottom: 100%` on the rail wrapper — floats upward above the terminal without causing reflow. `DecisionBar` is inside the fixed container (adds ~44px when gate open).

**Rationale**: SC-004 requires no terminal reflow when the detail strip appears. Absolute positioning achieves this by taking the strip out of flow. A small height increase for the decision bar (gate-open only) is acceptable and is not a reflow of the terminal pane.

## Complexity Tracking

No constitution violations.
