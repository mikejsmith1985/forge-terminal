# Tasks: SDD Pipeline Dashboard

**Input**: Design documents from `specs/006-sdd-pipeline-dashboard/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Included per constitution Article V (Red → Green → Refactor). Each story's failing test tasks precede their implementation tasks.

**Organization**: Grouped by user story so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup

**Purpose**: Branch + delete replaced files once the new component skeleton is wired in App.jsx.

- [ ] T001 Create and checkout branch `feature/006-sdd-pipeline-dashboard` from `main`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Hook updates and new component skeleton. ALL must complete before any user story phase.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [ ] T002 [P] Write failing tests for `featureName` extraction and `phaseSummaries` accumulation in `frontend/src/hooks/useSddGate.test.js` (tests must FAIL at this point)
- [ ] T003 Add `featureName` useState to `frontend/src/hooks/useSddGate.js`: extract `event.feature` from `SDD_PHASE_STATUS` events; reset to `""` when `activeSessionId` changes; add to hook return (depends on T002)
- [ ] T004 Add `phaseSummaries` useRef to `frontend/src/hooks/useSddGate.js`: store `card.summary` at `phaseSummaries.current[card.phase]` on each `SDD_PHASE_GATE` event; expose ref object in hook return (depends on T003)
- [ ] T005 Verify T002 tests pass after T003–T004: run `cd frontend && npx vitest run useSddGate` — 0 failures
- [ ] T006 [P] Create `frontend/src/components/SddDashboard.jsx` skeleton: default export function returning `null`; named export `ClarifyModal` returning `null`; JSDoc props comment per `contracts/sdd-dashboard-props-v1.md`
- [ ] T007 [P] Create `frontend/src/components/SddDashboard.css`: BEM root rule `.sdd-dashboard {}` only — no styles yet
- [ ] T008 [P] Create `frontend/src/components/SddDashboard.test.jsx`: one smoke test ("renders without crashing") — must PASS immediately against the skeleton
- [ ] T009 Update `frontend/src/App.jsx`: remove `import PhaseDecisionCard` and `import SddPipelinePanel`; add `import SddDashboard from './components/SddDashboard'`; replace the `<PhaseDecisionCard .../>` and `<SddPipelinePanel .../>` renders with a single `<SddDashboard phases={sddGate.phaseStatuses} featureName={sddGate.featureName} phaseSummaries={sddGate.phaseSummaries} isCardOpen={sddGate.isCardOpen} card={sddGate.card} decisionError={sddGate.decisionError} isSubmitting={sddGate.isSubmitting} onAction={(action, clarifyText) => sddGate.submitDecision(action, clarifyText)} onDismiss={sddGate.dismiss} onFileOpen={handleFileOpen} />` per contracts/sdd-dashboard-props-v1.md
- [ ] T010 [P] Delete `frontend/src/components/SddPipelinePanel.jsx`, `SddPipelinePanel.css`, `SddPipelinePanel.test.jsx` (depends on T009)
- [ ] T011 [P] Delete `frontend/src/components/PhaseDecisionCard.jsx`, `PhaseDecisionCard.css`, `PhaseDecisionCard.test.jsx` (depends on T009)
- [ ] T012 Verify build is clean after deletions: `go build ./cmd/forge/` and `cd frontend && npx vitest run` — 0 failures

**Checkpoint**: Hook has `featureName` + `phaseSummaries`. App.jsx renders `<SddDashboard>`. Old components deleted. Build passes. All user story phases can now begin.

---

## Phase 3: User Story 1 — Glanceable Phase Rail (Priority: P1) 🎯 MVP

**Goal**: All 6 phase cells visible in a horizontal rail at all times; correct icons, labels, and run-count badges; idle state when no pipeline is bound.

**Independent Test**: Open Forge Terminal and send a mock `SDD_PHASE_STATUS` event. Without any clicks, a developer can read the phase state of all 6 phases in under 5 seconds. (quickstart.md Scenarios 1–2)

### Tests for User Story 1

> **Write FIRST — must FAIL before implementation (T013–T014)**

- [ ] T013 [P] [US1] Write failing Vitest tests for `DashboardHeader` in `frontend/src/components/SddDashboard.test.jsx`: renders feature name; renders pipeline-level status badge; shows "No active feature" when `featureName` is empty
- [ ] T014 [P] [US1] Write failing Vitest tests for `PhaseRail` and `PhaseCell` in `frontend/src/components/SddDashboard.test.jsx`: 6 cells in DOM; correct icon per `displayStatus`; correct status label per `displayStatus`; `×N` badge appears only when `runCount >= 2`; idle row shown when `phases.length === 0`

### Implementation for User Story 1

- [ ] T015 [P] [US1] Define named constants in `frontend/src/components/SddDashboard.jsx`: `STATUS_ICON` map (6 values + unknown fallback `?`), `STATUS_LABEL` map (`'pending' → 'Pending'`, `'active' → 'Running…'`, `'awaiting-decision' → 'Awaiting'`, `'iterating' → 'Awaiting'`, `'rejected' → 'Rejected'`, `'complete' → 'Done'`), `KNOWN_STATUSES` array
- [ ] T016 [P] [US1] Implement `DashboardHeader` local function in `frontend/src/components/SddDashboard.jsx`: renders feature name span + pipeline-level status badge span (derive badge label from `phases` array: all-complete → "Complete", any-awaiting/iterating → "Awaiting", any-rejected → "Rejected", any-active → "Running", else "Idle")
- [ ] T017 [US1] Implement `PhaseCell` local function in `frontend/src/components/SddDashboard.jsx`: renders `<div className="sdd-dashboard__cell sdd-dashboard__cell--{status}">` with icon `<span>`, name `<span>`, status label `<span>`, and `×N` badge `<span>` (only when `runCount >= 2`); unknown status falls back to `--unknown` class and `?` icon
- [ ] T018 [US1] Implement `PhaseRail` local function in `frontend/src/components/SddDashboard.jsx`: renders `<div className="sdd-dashboard__rail">` containing a `PhaseCell` for each entry in `phases`; when `phases.length === 0` renders idle row with "No active feature — run /speckit-specify to start"
- [ ] T019 [US1] Wire `DashboardHeader` and `PhaseRail` into `SddDashboard` default export: `<div className="sdd-dashboard"> <DashboardHeader ... /> <div className="sdd-dashboard__rail-wrapper"> <PhaseRail ... /> </div> </div>`
- [ ] T020 [US1] Add BEM CSS in `frontend/src/components/SddDashboard.css`: `.sdd-dashboard` (fixed bottom, flex-column); `.sdd-dashboard__header` (flex row, feature name, badge); `.sdd-dashboard__rail` (flex row, equal-width cells); `.sdd-dashboard__cell` + all `--{status}` colour modifiers; `--active` and `--iterating` spin animation (reuse `@keyframes sdd-spin` pattern from deleted `SddPipelinePanel.css`); `.sdd-dashboard__run-badge`; `.sdd-dashboard__idle-row`
- [ ] T021 [US1] Verify US1 tests pass: run `cd frontend && npx vitest run SddDashboard` — all T013–T014 tests green

**Checkpoint**: Dashboard header and 6-cell phase rail render correctly for all display states. US1 is independently functional and testable.

---

## Phase 4: User Story 2 — Inline Decision Bar (Priority: P2)

**Goal**: Approve/Reject/Clarify controls appear inline in the dashboard when a gate is open; no overlay; Clarify opens a native dialog; errors shown inline. (quickstart.md Scenarios 3–5, 8)

**Independent Test**: Trigger a gate event. Decision buttons appear in the dashboard. Approve advances the pipeline without any modal appearing over the terminal.

### Tests for User Story 2

> **Write FIRST — must FAIL before implementation (T022–T023)**

- [ ] T022 [P] [US2] Write failing Vitest tests for `DecisionBar` in `frontend/src/components/SddDashboard.test.jsx`: buttons absent when `isCardOpen=false`; Approve/Reject buttons call `onAction` with correct action; Approve and Reject disabled while `isSubmitting=true`; `decisionError` message visible when set
- [ ] T023 [P] [US2] Write failing Vitest tests for `ClarifyModal` named export in `frontend/src/components/SddDashboard.test.jsx`: Confirm button disabled when textarea empty or whitespace-only; Confirm enabled when steer has content; `onConfirm` called with trimmed text; `onCancel` called when Cancel clicked

### Implementation for User Story 2

- [ ] T024 [P] [US2] Implement `ClarifyModal` named export in `frontend/src/components/SddDashboard.jsx`: `useRef(null)` for the `<dialog>` element; `useEffect` calls `dialog.showModal()` when `isOpen=true` and `dialog.close()` when `isOpen=false`; textarea with `value`/`onChange`; Confirm button `disabled={steer.trim().length === 0}`; onConfirm fires `props.onConfirm(steer.trim())`; Escape key fires `onCancel` (native dialog behaviour)
- [ ] T025 [US2] Implement `DecisionBar` local function in `frontend/src/components/SddDashboard.jsx`: renders `<div className="sdd-dashboard__decision-bar">` with Approve, Reject, and Clarify buttons; Approve/Reject call `onAction(action)` directly; Clarify calls `setIsClarifyOpen(true)` (no direct `onAction` call); all buttons `disabled={isSubmitting}`; renders `decisionError` in an error `<div>` when truthy
- [ ] T026 [US2] Add `isClarifyOpen` useState (false) to `SddDashboard` default export; mount `<ClarifyModal isOpen={isClarifyOpen} onConfirm={(steer) => { onAction('clarify', steer); setIsClarifyOpen(false) }} onCancel={() => setIsClarifyOpen(false)} />`; mount `<DecisionBar>` conditional on `isCardOpen` passing all required props
- [ ] T027 [US2] Add BEM CSS in `frontend/src/components/SddDashboard.css`: `.sdd-dashboard__decision-bar` (flex row, button spacing); `.sdd-dashboard__decision-btn` + `--approve` (green), `--reject` (red), `--clarify` (amber) modifiers; `.sdd-dashboard__decision-error` (inline error text, red); `.sdd-dashboard__clarify-dialog` + `::backdrop` (native dialog styles, textarea, Confirm/Cancel buttons)
- [ ] T028 [US2] Verify US2 tests pass: run `cd frontend && npx vitest run SddDashboard` — all T022–T023 tests green

**Checkpoint**: Inline decision controls work for all three actions. Clarify modal opens and submits correctly. Error messages display without closing the gate. US2 independently testable alongside US1.

---

## Phase 5: User Story 3 — Phase Detail Strip (Priority: P3)

**Goal**: Clicking a completed phase cell opens a detail strip below the rail (above the terminal) showing headline, file chips, and flags. "View artifact →" opens the file in Monaco. Only one strip open at a time. (quickstart.md Scenarios 6–7)

**Independent Test**: Complete the Plan phase. Click the Plan cell. A summary strip appears showing plan.md chip and a headline. Click "View artifact →" — Monaco opens plan.md. Click Plan again — strip collapses.

### Tests for User Story 3

> **Write FIRST — must FAIL before implementation (T029–T030)**

- [ ] T029 [P] [US3] Write failing Vitest tests for `PhaseDetailStrip` in `frontend/src/components/SddDashboard.test.jsx`: headline text rendered; each `producedItem` appears as a chip; flag badges rendered with correct severity; "No flags" shown when flags empty; "No artifacts produced" shown when `producedItems` empty; "View artifact →" button present when `artifactPath` non-empty; clicking "View artifact →" calls `onFileOpen` with correct `{path, name}`
- [ ] T030 [P] [US3] Write failing Vitest tests for `selectedPhase` toggle in `frontend/src/components/SddDashboard.test.jsx`: clicking a complete cell opens its strip; clicking same cell closes it; clicking a different complete cell switches strip to new phase; pending/running/rejected cells are not clickable (no strip opens); only one strip visible at a time

### Implementation for User Story 3

- [ ] T031 [P] [US3] Implement `PhaseDetailStrip` local function in `frontend/src/components/SddDashboard.jsx`: receives `{summary, artifactPath, onFileOpen}`; renders headline `<p>`, `producedItems` as `<span className="sdd-dashboard__detail-chip">` elements (or "No artifacts produced" if empty), flag `<span className="sdd-dashboard__detail-flag sdd-dashboard__detail-flag--{severity}">` elements (or "No flags" if empty), and "View artifact →" `<button>` that calls `onFileOpen({ path: artifactPath, name: baseName(artifactPath) })` when `artifactPath` is non-empty
- [ ] T032 [US3] Add `selectedPhase` useState (null) to `SddDashboard` default export; add click handler to `PhaseCell`: if `displayStatus === 'complete'`, clicking toggles `selectedPhase` (same phase → null, different phase → new phase name); non-complete cells are not interactive (no onClick, `cursor: default`)
- [ ] T033 [US3] Mount `<PhaseDetailStrip>` inside `sdd-dashboard__rail-wrapper` conditional on `selectedPhase !== null`; pass `summary={phaseSummaries.current?.[selectedPhase] ?? null}`, `artifactPath` from the matching `phases` entry, and `onFileOpen`
- [ ] T034 [US3] Add BEM CSS in `frontend/src/components/SddDashboard.css`: `.sdd-dashboard__rail-wrapper` (`position: relative`); `.sdd-dashboard__detail-strip` (`position: absolute; bottom: 100%; left: 0; right: 0; z-index: 10`; background, border-top, padding); `.sdd-dashboard__detail-chip` (inline-block, border, rounded); `.sdd-dashboard__detail-flag` + `--info`, `--warn`, `--block` colour modifiers; `.sdd-dashboard__detail-artifact-link` (button-as-link style)
- [ ] T035 [US3] Verify US3 tests pass: run `cd frontend && npx vitest run SddDashboard` — all T029–T030 tests green

**Checkpoint**: Phase detail strip opens/closes/switches correctly. Artifact link fires `handleFileOpen`. Strip floats above terminal without causing layout reflow.

---

## Phase 6: User Story 4 — Always-On Action Prompt (Priority: P4)

**Goal**: `ActionPromptStrip` renders exactly one sentence at all times beneath the phase rail, reflecting the current pipeline state. (quickstart.md Scenario 9)

**Independent Test**: Watch the dashboard through a pipeline state change — prompt updates without interaction within one refresh cycle.

### Tests for User Story 4

> **Write FIRST — must FAIL before implementation (T036)**

- [ ] T036 [P] [US4] Write failing Vitest tests in `frontend/src/components/SddDashboard.test.jsx`: `ActionPromptStrip` is present in the DOM in all dashboard states (idle, running, awaiting, complete); prompt text updates when `phases` prop changes; never absent

### Implementation for User Story 4

- [ ] T037 [US4] Mount `<ActionPromptStrip phases={phases} isCardOpen={isCardOpen} />` in `SddDashboard` default export between the `sdd-dashboard__rail-wrapper` and the optional `DecisionBar`
- [ ] T038 [US4] Verify US4 test passes: run `cd frontend && npx vitest run SddDashboard` — T036 test green

**Checkpoint**: All four user stories are independently functional. Full dashboard is complete.

---

## Final Phase: Polish & Delivery

**Purpose**: Validation, CHANGELOG, and PR.

- [ ] T039 [P] Update `CHANGELOG.md`: add entry under `[Unreleased] → Added` — "SDD Pipeline Dashboard (spec-006): replaced `SddPipelinePanel` and `PhaseDecisionCard` with a single always-visible `SddDashboard`; inline phase rail, per-phase detail strip, inline decision bar, native Clarify dialog; `useSddGate` gains `featureName` and `phaseSummaries`"
- [ ] T040 [P] Run full Vitest suite: `cd frontend && npx vitest run` — confirm 0 failures across all test files
- [ ] T041 [P] Run Go build: `go build ./cmd/forge/` — confirm clean
- [ ] T042 Run Playwright UX validation against `run-dev-clean.ps1` covering quickstart.md Scenarios 1–9 (idle state, 6-cell rail, gate open, approve, clarify modal, detail strip, run-count badge, decision error, pipeline complete)
- [ ] T043 Record workflow gates via `workflow_gate_record`: `branch-created` (T001), `tests-written` (T013–T014, T022–T023, T029–T030, T036), `tests-passed` (T021, T028, T035, T038, T040)
- [ ] T044 Run `workflow_preflight_check` — confirm `{"ok": true}`; commit all staged changes; open PR against `main`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
  - T002 can run before T003/T004 (test-first)
  - T006–T008 can run in parallel with T002–T005 (different files)
  - T009 (App.jsx) depends on T006 (SddDashboard skeleton created)
  - T010–T011 (deletes) depend on T009 (App.jsx no longer references old components)
- **Phases 3–6 (User Stories)**: All depend on Phase 2 completion; can proceed in P1→P2→P3→P4 order
- **Final Phase**: Depends on all desired user story phases complete

### User Story Dependencies

| Story | Depends On | Can Parallelize With |
|---|---|---|
| US1 (P1) | Phase 2 done | — |
| US2 (P2) | Phase 2 done | US1 (different sub-components) |
| US3 (P3) | Phase 2 done; US1 done (needs `selectedPhase` state in SddDashboard) | — |
| US4 (P4) | Phase 2 done | US1, US2 |

### Within Each User Story

1. Write failing tests (marked [P] where test tasks touch different describe blocks)
2. Implement constants/utilities
3. Implement local sub-component function
4. Mount sub-component in `SddDashboard` default export
5. Add CSS
6. Verify tests pass

---

## Parallel Opportunities

```
# Phase 2 parallel group (different files):
T002  useSddGate.test.js — write failing tests
T006  SddDashboard.jsx skeleton
T007  SddDashboard.css empty
T008  SddDashboard.test.jsx smoke test

# Phase 3 parallel group:
T013  test DashboardHeader
T014  test PhaseRail/PhaseCell
T015  define STATUS_ICON / STATUS_LABEL constants
T016  implement DashboardHeader

# Phase 4 parallel group:
T022  test DecisionBar
T023  test ClarifyModal
T024  implement ClarifyModal

# Phase 5 parallel group:
T029  test PhaseDetailStrip
T030  test selectedPhase toggle
T031  implement PhaseDetailStrip

# Final phase parallel group:
T039  CHANGELOG
T040  Vitest suite
T041  Go build
```

---

## Implementation Strategy

### MVP First (US1 only — Phase 1 + 2 + 3)

1. Complete Phase 1 (branch) + Phase 2 (foundational hook changes, skeleton, App.jsx wiring)
2. Complete Phase 3 (US1 — 6-cell phase rail with icons, labels, badges, idle state)
3. **STOP and VALIDATE**: All 6 phases visible; idle state works; run Playwright Scenarios 1–2
4. Dashboard is already better than the previous collapsible bar at this point

### Full Delivery (All Stories)

5. Add US2 (Phase 4) — inline decision bar; validate Scenarios 3–5, 8
6. Add US3 (Phase 5) — phase detail strip + artifact link; validate Scenarios 6–7
7. Add US4 (Phase 6) — action prompt; validate Scenario 9
8. Polish phase → PR

---

## Notes

- All `[P]` tasks touch different files and have no incomplete-task dependencies
- Constitution Article V (TDD): all test tasks precede their implementation tasks within each story
- `ClarifyModal` is a named export specifically so T023/T024 can be tested in isolation from `SddDashboard`
- Deleting old components (T010–T011) must happen AFTER App.jsx is updated (T009) — otherwise imports break at build time
- `phaseSummaries` is exposed as a `useRef` object (not `.current`) — accessing in components uses `phaseSummaries.current[phase]`; test this in T002
- The "View artifact →" button derives `name` from `artifactPath` using `artifactPath.split('/').pop()` — ensure this is consistent with how `handleFileOpen` uses the `name` field
