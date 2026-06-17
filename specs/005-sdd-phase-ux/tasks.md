# Tasks: SDD Phase UX — Glanceable State + Action Guidance

**Input**: Design documents from `specs/005-sdd-phase-ux/`

**Prerequisites**: plan.md ✓ spec.md ✓ research.md ✓ data-model.md ✓ contracts/ ✓ quickstart.md ✓

**Testing**: TDD (Red → Green → Refactor per Article V). Unit tests written before implementation.
Playwright E2E in Polish phase per constitution (real browser, `run-dev-clean.ps1`, never the binary).

**Organization**: Foundational backend types first (unblock frontend). Then US1 → US2 → US3 in priority order.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: Branch isolation before any file changes.

- [x] T001 Create git branch `feature/005-sdd-phase-ux` from main

---

## Phase 2: Foundational — Backend Type Contract

**Purpose**: Extend Go types and the orchestrator run-counter. All frontend phases depend on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — the `RunCount` wire field and `iterating` display status are the shared contract.

- [x] T002 Extend `internal/sdd/types.go`: add `PhaseDisplayIterating PhaseDisplayStatus = "iterating"` constant; add `RunCount int \`json:"runCount"\`` field to `PhaseStatusEntry`
- [x] T003 Write failing unit tests in `internal/sdd/orchestrator_test.go` for run-count tracking: assert `PhaseRunCount` returns 0 before any completions; returns 1 after first `HandlePhaseComplete`; returns 2 after second call for same phase; independent per phase
- [x] T004 Add `phaseRunCounts map[PhaseName]int` field to `Orchestrator` struct in `internal/sdd/orchestrator.go`; add `PhaseRunCount(phase PhaseName) int` read method; increment counter inside `HandlePhaseComplete` under existing `mu` lock before fan-out (makes T003 green)
- [x] T005 Write failing unit tests in `cmd/forge/sdd_wiring_test.go` for `derivePhaseDisplayStatus`: assert it returns `PhaseDisplayIterating` when `phaseOrder == currentOrder`, `pipelineStatus == StatusAwaitingDecision`, and `runCount >= 2`; assert it returns `PhaseDisplayAwaitingDecision` for the same condition with `runCount == 1`
- [x] T006 Update `derivePhaseDisplayStatus` in `cmd/forge/sdd_wiring.go`: add `runCount int` parameter; insert `iterating` case in the switch before the existing `awaiting-decision` case; update `buildPhaseStatuses` to call `pipeline.orchestrator.PhaseRunCount(phase.Name)` and assign result to `PhaseStatusEntry.RunCount` (makes T005 green); confirm `go test ./...` green

**Checkpoint**: Backend emits `runCount` on every `SDD_PHASE_STATUS` event; `iterating` state derivable. Frontend work can begin.

---

## Phase 3: User Story 1 — Glanceable Phase State (Priority: P1) 🎯 MVP

**Goal**: Five visually distinct phase-state icons with CSS-animated transitions.

**Independent Test**: Run `/speckit-specify`, reject at gate, re-run. Panel shows `⏳ → ⚠ → ↻` across three frames, each with a distinct icon and colour class, with no two states sharing the same visual.

- [x] T007 [US1] Write failing Vitest tests in `frontend/src/components/SddPipelinePanel.test.jsx`: (a) assert `iterating` row renders `↻`; (b) assert each of the six displayStatus values renders the correct BEM modifier class on the row element; (c) assert transition occurs when displayStatus prop changes (class swap visible in re-render); (d) assert an unknown/unrecognised displayStatus value renders `?` icon and the `--unknown` fallback class (covers spec edge case: "panel displays `? Unknown`")
- [x] T008 [US1] Update `STATUS_ICON` map in `frontend/src/components/SddPipelinePanel.jsx`: set `pending: '◌'`, `active: '⟳'`, `awaiting-decision: '⏳'`, `complete: '✓'`, `rejected: '⚠'`, `iterating: '↻'`; confirm row `className` already includes `sdd-pipeline-panel__row--${entry.displayStatus}` (it does — no JSX change needed for the class, only the icon map and any missing CSS class handling) (makes T007 icon assertions green)
- [x] T009 [P] [US1] Update `frontend/src/components/SddPipelinePanel.css`: add `transition: color 200ms ease, background-color 200ms ease` to `.sdd-pipeline-panel__row` base rule; add `@keyframes sdd-spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }`; add/update colour classes for all six statuses — `--pending` (grey), `--active` (blue, `animation: sdd-spin 0.8s linear infinite` on the icon span), `--awaiting-decision` (amber), `--complete` (green), `--rejected` (amber, static), `--iterating` (amber, `animation: sdd-spin 0.8s linear infinite` on the icon span); both `--active` and `--iterating` spin — colour is the only differentiator

- [x] T009b [P] [US1] Implement FR-010 idle indicator in `frontend/src/components/SddPipelinePanel.jsx`: when `phases` is empty (no feature bound), instead of returning `null`, render a single compact row showing "No active feature — run /speckit-specify to start" with a `◌` icon and class `sdd-pipeline-panel--idle`; write the corresponding failing Vitest test in `SddPipelinePanel.test.jsx` first (assert idle row renders when `phases=[]` and `isVisible=true`)

**Checkpoint**: Panel shows six visually distinct icons with animated transitions; shows compact idle state when no feature is bound. US1 independently testable.

---

## Phase 4: User Story 2 — Single-Sentence Action Prompt (Priority: P2)

**Goal**: `ActionPromptStrip` component that always shows exactly one sentence in the panel footer and the gate card footer.

**Independent Test**: At every observable pipeline state (idle, running, gate open first-run, gate open re-run, rejected, complete), the designated prompt strip shows exactly one sentence and no other instructional text appears in the panel or card.

- [x] T010 [US2] Write failing Vitest unit tests for `deriveActionPrompt` in `frontend/src/components/ActionPromptStrip.test.jsx`: one test case per prompt variant from data-model.md prompt table (7 variants); assert exact string match for each; assert output is always ≤ 100 characters; assert result is a single sentence (no period mid-string)
- [x] T011 [P] [US2] Create `frontend/src/components/ActionPromptStrip.jsx`: define named string constants for all 8 prompt variants at file top (7 from data-model.md + 1 unknown-state: `"Unexpected pipeline state. Check the terminal."`); implement `deriveActionPrompt(phases, isCardOpen)` pure function using priority-ordered conditions from data-model.md, with unknown-state as the final fallback when no condition matches; export `ActionPromptStrip({ phases, isCardOpen })` React component that renders the derived string in a `<p>` with class `action-prompt-strip` (makes T010 green)
- [x] T012 [P] [US2] Create `frontend/src/components/ActionPromptStrip.css`: `.action-prompt-strip` — `font-weight: bold`, single line, visually distinct from panel content (e.g. top border, contrasting background); ensure it fits within the panel footer without wrapping at standard desktop widths
- [x] T013 [US2] Write failing Vitest test in `frontend/src/components/PhaseDecisionCard.test.jsx` asserting: when `phases` prop contains an `iterating` entry and `isOpen` is true, the card footer renders an element with class `action-prompt-strip` containing the iterating-specific sentence
- [x] T014 [US2] Mount `<ActionPromptStrip phases={phases} isCardOpen={true} />` in the footer area of `frontend/src/components/PhaseDecisionCard.jsx`; add `phases` prop to `PhaseDecisionCard` signature with default `phases = []` so existing test renders without the prop remain valid; update `App.jsx` to pass `phaseStatuses` as `phases` to `PhaseDecisionCard` (makes T013 green)
- [x] T015 [US2] Write failing Vitest test in `frontend/src/components/SddPipelinePanel.test.jsx` asserting: when panel is expanded and phases contains a `rejected` entry, the panel footer renders `action-prompt-strip` with the retry sentence
- [x] T016 [US2] Mount `<ActionPromptStrip phases={phases} isCardOpen={false} />` in the expanded panel footer of `frontend/src/components/SddPipelinePanel.jsx`; import `ActionPromptStrip`; position strip below the phase rows inside the expanded section (makes T015 green)

**Checkpoint**: Panel footer + card footer both show exactly one action sentence at all pipeline states. US2 independently testable.

---

## Phase 5: User Story 3 — Iteration Counter (Priority: P3)

**Goal**: `×N` counter appears on phase rows when a phase has completed ≥ 2 times.

**Independent Test**: Reject Specify twice, approve on third attempt. Specify row shows `✓ ×3`. A phase approved on first attempt shows `✓` with no counter. Counter is absent for any `runCount` of 0 or 1.

- [x] T017 [US3] Write failing Vitest tests in `frontend/src/components/SddPipelinePanel.test.jsx`: assert phase row with `runCount: 0` renders no counter; `runCount: 1` renders no counter; `runCount: 2` renders `×2` suffix; `runCount: 3` renders `×3` suffix; counter is visually separated from the icon+label (e.g. a `<span>` with distinct class `sdd-pipeline-panel__run-count`)
- [x] T018 [US3] Update phase row rendering in `frontend/src/components/SddPipelinePanel.jsx`: after the phase name `<span>`, add `{entry.runCount >= 2 && <span className="sdd-pipeline-panel__run-count">×{entry.runCount}</span>}`; remove the `artifactPath` display from the row (it adds noise, no longer needed per spec FR-006) (makes T017 green)
- [x] T019 [P] [US3] Update `frontend/src/components/SddPipelinePanel.css`: add `.sdd-pipeline-panel__run-count` — `font-size: 0.75em`, muted colour (grey), `margin-left: 0.4em`; ensures counter does not dominate the row

**Checkpoint**: All three user stories implemented and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E proof, regression sweep, CHANGELOG.

- [x] T020 [P] Write Playwright E2E test file `tests/e2e/sdd-phase-ux.spec.js` covering Scenarios A (six distinct icons, including `⟳ Running` intermediate state), B (single action sentence), and C (iteration counter) from `specs/005-sdd-phase-ux/quickstart.md`; use `page.keyboard` / `locator.click()` real events only; assert icon text and CSS class via `locator.getAttribute`; assert no second sentence in prompt strip via text content length check
- [x] T021 Run full test suite: `go test ./...` (all Go unit tests green); `npx vitest run` (all React unit tests green); `npx playwright test e2e/sdd-phase-ux.spec.js --headed` against `run-dev-clean.ps1` dev server
- [x] T022 Update `CHANGELOG.md`: add entry for the next release describing the five-state panel icons, `×N` iteration counter, and single-sentence action prompt strip; reference spec `005-sdd-phase-ux`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user story phases
- **Phase 3 (US1)**: Depends on Phase 2 completion; T008 depends on T007 (test-first)
- **Phase 4 (US2)**: Depends on Phase 2 completion; T011/T012 can run in parallel after T010; T014 depends on T011; T016 depends on T011
- **Phase 5 (US3)**: Depends on Phase 2 completion; T018 depends on T017
- **Phase 6 (Polish)**: Depends on all US phases complete

### Within-Phase Dependencies

```
Phase 2:  T002 → T003 → T004 → T005 → T006
Phase 3:  T007 → T008, T009 [P with T008]
Phase 4:  T010 → T011 [P] + T012 [P] → T013 → T014 → T015 → T016
Phase 5:  T017 → T018, T019 [P with T018]
Phase 6:  T020 [P] + T021 + T022
```

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 2. No dependency on US2 or US3.
- **US2 (P2)**: Depends on Phase 2 + T011 (ActionPromptStrip must exist before mounting). No dependency on US1 or US3.
- **US3 (P3)**: Depends on Phase 2 only (reads `runCount` from existing payload). No dependency on US1 or US2.

---

## Parallel Opportunities

```
# Phase 2 internal: sequential (each task extends the previous)
T002 → T003 → T004 → T005 → T006

# Phase 3: T009 (CSS) can run in parallel with T008 (JSX) — different files
T007 → [T008 ∥ T009]

# Phase 4: after T010 passes, T011 and T012 are different files
T010 → [T011 ∥ T012] → T013 → T014 → T015 → T016

# Phase 5: T019 (CSS) runs in parallel with T018 (JSX)
T017 → [T018 ∥ T019]

# Phase 6: T020 (E2E test) is independent of T022 (CHANGELOG)
[T020 ∥ T022] → T021 (run suite last)
```

---

## Implementation Strategy

### MVP (US1 only — 9 tasks)

1. Complete Phase 1 (T001)
2. Complete Phase 2 (T002–T006) — backend contract
3. Complete Phase 3 (T007–T009b) — six distinct icons + idle state
4. **STOP and VALIDATE**: run Vitest, open dev UI, reject a phase and confirm `⚠` → `↻` transition; confirm idle row when no feature is bound

### Incremental Delivery

1. MVP → five icons working (US1 ✓)
2. Add ActionPromptStrip (US2) → prompt always shows one sentence
3. Add iteration counter (US3) → `×N` counter on re-runs
4. Polish → E2E test + CHANGELOG

---

## Notes

- `[P]` = safe to parallelize (different files, no incomplete dependency)
- `[Story]` label traces each task back to the spec user story
- Article V: every implementation task has a preceding failing test task
- The pre-commit hook requires a test file per source file — `ActionPromptStrip.test.jsx` (T010) and `sdd_wiring_test.go` (T005) satisfy this for the new and modified files respectively
- `derivePhaseDisplayStatus` is in `package main` (`cmd/forge/sdd_wiring.go`); its test file is `cmd/forge/sdd_wiring_test.go` in the same package
- `artifactPath` column removed from panel rows (T018) — FR-006 forbids prose/detail in the panel; file path was display noise
