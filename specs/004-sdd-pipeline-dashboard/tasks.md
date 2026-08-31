# Tasks: SDD Pipeline Dashboard

**Input**: Design documents from `specs/004-sdd-pipeline-dashboard/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Delivery order** (per plan.md): US2 (non-blocking card) → US1 (status panel) → US3 (artifact preview)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependency)
- **[Story]**: Which user story from spec.md ([US1]=status panel, [US2]=non-blocking card, [US3]=artifact preview)

---

## Phase 1: Setup

**Purpose**: Create the feature branch and confirm the working baseline.

- [ ] T001 Create feature branch `feature/004-sdd-pipeline-dashboard` from main and verify clean build (`go build ./cmd/forge/...` + `npm run build` in `frontend/`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Two shared type additions that both US1 and US3 depend on. Must complete before either story begins.

**⚠️ CRITICAL**: T002 and T003 must be complete before any US1 or US3 work starts.

- [ ] T002 [P] Add `PhaseDisplayStatus` type and `PhaseStatusEntry` struct to `internal/sdd/types.go` (see data-model.md — `PhaseDisplayStatus` enum: pending/active/awaiting-decision/complete/rejected; `PhaseStatusEntry` fields: Phase, Order, DisplayStatus, ArtifactPath, DecidedAt)
- [ ] T003 [P] Export `PhaseTable() []Phase` function from `internal/sdd/phases.go` returning a copy of `phaseTable` — needed by `buildPhaseStatuses` in `sdd_wiring.go` for US1

**Checkpoint**: `internal/sdd/types.go` and `internal/sdd/phases.go` compile; `go vet ./internal/sdd/...` passes.

---

## Phase 3: US2 — Non-Blocking Decision Card (Priority: P2) 🚑 Ship First

**Goal**: Convert the full-screen modal overlay to a right-side drawer inside `terminal-pane-content`, leaving the terminal fully scrollable and interactive while a gate decision is pending.

**Independent Test**: Open a gate card, scroll the terminal scrollback, type a character in the terminal — all work without interference. Escape/✕ still closes the card. No backend changes.

### Implementation for US2

- [ ] T004 [US2] Replace `.phase-decision-card-overlay` (full-screen, `position: fixed; inset: 0; background: rgba`) with `.phase-decision-card-drawer` (flex child, `flex-shrink: 0; width: 380px; display: flex; flex-direction: column; border-left: 1px solid #2a2a2a; overflow-y: auto`) in `frontend/src/components/PhaseDecisionCard.css` — remove overlay backdrop entirely; remove `border-radius` from `.phase-decision-card`
- [ ] T005 [US2] Update root JSX element in `frontend/src/components/PhaseDecisionCard.jsx`: change `<div className="phase-decision-card-overlay">` to `<div className="phase-decision-card-drawer">` (1-line change; all inner content unchanged) (depends T004)
- [ ] T006 [US2] In `frontend/src/App.jsx`: (a) move the `<PhaseDecisionCard …/>` mount from outside `terminal-pane` to inside `div.terminal-pane-content` as a right-side flex sibling to `div.terminal-container`; (b) add `display: flex; flex-direction: row` to `.terminal-pane-content` in the project's global CSS (`frontend/src/index.css` or `App.css`) so the terminal and drawer share a row (depends T005)
- [ ] T007 [US2] Write Cypress regression + non-blocking test in `cypress/e2e/sdd-phase-gate.cy.js`: add `"non-blocking: terminal scrollable while card is open"` — open gate card, assert terminal scroll position changes on scroll action, assert keystroke reaches PTY buffer (`window.term.buffer.active.getLine(n).translateToString(true)`) rather than being captured by the card

**Checkpoint**: Existing Cypress `sdd-phase-gate.cy.js` (3 tests) still pass. New scroll test passes. Card appears as right-side drawer without backdrop.

---

## Phase 4: US1 — Pipeline Status Panel (Priority: P1)

**Goal**: Persistent collapsible bottom panel showing all five SDD phases with live status; updates within 2 seconds of a phase completing via WebSocket; recovers on page reload via `GET /api/sdd/status`.

**Independent Test**: After bind + `/speckit-specify`, bottom panel shows Specify=complete, remaining=pending, within 2 seconds. Panel collapses to header bar on toggle. Page reload shows same state.

### Backend for US1

- [ ] T008 [P] [US1] Add to `cmd/forge/sdd_wiring.go`: `sddPhaseStatusEnvelope` struct `{Type, SessionID, Feature string; Phases []sdd.PhaseStatusEntry}`; `buildPhaseStatuses(pipeline *sddPipeline) []sdd.PhaseStatusEntry` (iterates `sdd.PhaseTable()`, cross-references decision history from `loadHistory`, maps each phase to its `PhaseDisplayStatus` based on `PipelineState`); `broadcastPhaseStatus(sessionID string)` (looks up pipeline, calls `buildPhaseStatuses`, broadcasts `SDD_PHASE_STATUS` envelope via `termHandler.BroadcastJSONToSession`)
- [ ] T009 [P] [US1] Add `handleSddStatus(w http.ResponseWriter, r *http.Request)` to `cmd/forge/handlers_sdd.go`: reads `?sessionId` query param; calls `sddPipelineFor`; if no pipeline returns `{sessionId, feature:"", phases:[]}` (200, not 404); if pipeline exists returns full `sddPhaseStatusEnvelope` body as JSON (without the `type` field)
- [ ] T010 [US1] Wire `broadcastPhaseStatus` as a completion subscriber in `startSddPipeline()` in `cmd/forge/sdd_wiring.go` (subscribe a `CompletionHandler` that calls `broadcastPhaseStatus(sessionID)` each time a phase completes); also call `broadcastPhaseStatus(request.SessionID)` from `handleSddDecision` in `cmd/forge/handlers_sdd.go` after a successful decision is applied (depends T008, T009)
- [ ] T011 [US1] Register `GET /api/sdd/status` route in `cmd/forge/main.go` pointing to `handleSddStatus` (depends T009)

### Frontend for US1

- [ ] T012 [P] [US1] Extend `frontend/src/hooks/useSddGate.js`: add `const SDD_PHASE_STATUS_TYPE = 'SDD_PHASE_STATUS'`; add `const [phaseStatuses, setPhaseStatuses] = useState([])`; in `handleWsMessage` add branch for `SDD_PHASE_STATUS_TYPE` that sets `phaseStatuses(parsed.phases ?? [])`; add `fetchInitialStatus` `useEffect` on mount that `GET /api/sdd/status?sessionId=...` and sets `phaseStatuses` on success (best-effort, catch swallowed); export `phaseStatuses` from the hook return value
- [ ] T013 [P] [US1] Create `frontend/src/components/SddPipelinePanel.jsx`: props `{ phases, isVisible }`; renders a collapsible bottom bar; collapsed state = single 32px header row showing phase count and awaiting-decision badge; expanded state = one row per phase (phase name, status icon, artifact path); status icons: `·` pending, `◌` active, `⏳` awaiting-decision, `✓` complete, `✗` rejected; persists collapsed state in `localStorage('sdd_panel_collapsed')`; shows badge on toggle button when a phase is `awaiting-decision` while collapsed
- [ ] T014 [P] [US1] Create `frontend/src/components/SddPipelinePanel.css`: bottom panel layout (fixed height 120px expanded / 32px collapsed, full width of `terminal-pane`); transition for collapse/expand; badge dot style; row styles for each display status (colour-coded); `border-top: 1px solid #2a2a2a`
- [ ] T015 [US1] In `frontend/src/App.jsx`: import `SddPipelinePanel`; render it as a flex child of `div.terminal-pane` BELOW `div.terminal-pane-content` (column flex order); pass `phases={sddGate.phaseStatuses}` and `isVisible={sddGate.phaseStatuses.length > 0}` (depends T012, T013, T014)

### Tests for US1

- [ ] T016 [P] [US1] Write unit tests for `buildPhaseStatuses` in `cmd/forge/sdd_wiring_test.go`: test with no history (all pending), test with two phases complete (correct statuses), test with one phase rejected (pipeline stopped)
- [ ] T017 [P] [US1] Write unit tests for `handleSddStatus` in `cmd/forge/handlers_sdd_test.go`: test with no pipeline bound (returns empty phases), test with active pipeline (returns phases array with correct statuses)
- [ ] T018 [P] [US1] Write unit tests for `SddPipelinePanel` in `frontend/src/components/SddPipelinePanel.test.jsx`: idle state (phases=[]), 5 phases render correctly, correct status icon per `displayStatus`, collapses on toggle, badge shows when awaiting-decision while collapsed
- [ ] T019 [US1] Write Cypress US1 test block in `cypress/e2e/sdd-pipeline-dashboard.cy.js`: "status panel shows all 5 phases after bind", "panel updates within 2s of specify completion", "panel collapses to header bar", "badge appears on toggle when phase is awaiting-decision", "terminal scrollable with panel visible", "gate card visible within 3s of phase completion (`cy.get('.phase-decision-card-drawer', { timeout: 3000 })` — SC-004 regression)" (depends T015)

**Checkpoint**: `go test ./cmd/forge/... ./internal/sdd/...` all pass. `SddPipelinePanel.test.jsx` passes. Cypress US1 block passes against dev server.

---

## Phase 5: US3 — Artifact Preview in Decision Card (Priority: P3)

**Goal**: The `SDD_PHASE_GATE` WebSocket event carries the first 200 lines of the phase artifact embedded as `artifactPreview`; the decision card renders a collapsible preview section; pty-quiet phases show no preview.

**Independent Test**: At the Plan gate card, a collapsible section shows `plan.md` content. At the Validate gate, no preview section is present. Truncation notice appears when file > 200 lines.

### Backend for US3

- [ ] T020 [US3] Add to `cmd/forge/sdd_wiring.go`: `const sddArtifactMaxLines = 200`; `sddArtifactPreview` struct `{Content, FilePath string; TotalLines int; IsTruncated bool}`; `readSddArtifactPreview(absPath string, maxLines int) *sddArtifactPreview` — reads the file, splits on newlines, truncates to maxLines, sets IsTruncated/TotalLines; returns zero-value preview (Content:"") on any read error rather than nil (depends T002 — types, though not directly; same file as T008 so must come after Phase 4 backend tasks)
- [ ] T021 [US3] Extend `sddGateEnvelope` in `cmd/forge/sdd_wiring.go` with `ArtifactPreview *sddArtifactPreview \`json:"artifactPreview,omitempty"\`` field (depends T020)
- [ ] T022 [US3] In `newSddBroadcaster()` in `cmd/forge/sdd_wiring.go`: after building the base envelope, look up `sdd.PhaseByName(card.Phase)`; if `phase.ExpectedArtifact != ""`, look up pipeline via `sddPipelineFor(card.SessionID)`, build `absPath = filepath.Join(state.FeatureDir, phase.ExpectedArtifact)`, call `readSddArtifactPreview(absPath, sddArtifactMaxLines)` and attach to `envelope.ArtifactPreview` (depends T021)
- [ ] T023 [P] [US3] Write unit tests for `readSddArtifactPreview` in `cmd/forge/sdd_wiring_test.go`: test with a file under 200 lines (not truncated), over 200 lines (truncated, correct TotalLines), missing file (Content="" graceful fallback)

### Frontend for US3

- [ ] T024 [P] [US3] In `frontend/src/components/PhaseDecisionCard.jsx`: add `ArtifactPreviewSection` local function component (props: `{ content, filePath, totalLines, isTruncated }`) — renders a `<details>` element defaulting closed with a `<pre className="phase-decision-card-artifact-pre">` scrollable block for content; shows truncation notice when `isTruncated`; add `artifactPreview` prop to `PhaseDecisionCard` and render `<ArtifactPreviewSection … />` below the flags row when `artifactPreview` is present and `artifactPreview.content !== ''`; when `artifactPreview` present but `content === ''` render a `<p className="phase-decision-card-artifact-missing">Artifact not yet available</p>` fallback; nothing rendered when `artifactPreview` is null/undefined (pty-quiet phases)
- [ ] T025 [P] [US3] Add artifact preview styles to `frontend/src/components/PhaseDecisionCard.css`: `.phase-decision-card-artifact-pre` (monospace, `max-height: 280px; overflow-y: auto; font-size: 0.8em; background: #0d0d0d; padding: 10px; border-radius: 4px; white-space: pre-wrap; word-break: break-all`); `.phase-decision-card-artifact-missing` (muted fallback text style); `.phase-decision-card-artifact-summary` for the `<summary>` toggle label
- [ ] T026 [US3] In `frontend/src/App.jsx`: add `artifactPreview={sddGate.card?.artifactPreview ?? null}` prop to `<PhaseDecisionCard … />` (1-line change) (depends T024)
- [ ] T027 [US3] Write Cypress US3 test block in `cypress/e2e/sdd-pipeline-dashboard.cy.js`: "card shows artifact preview for file-detected phases (plan)", "no preview section for pty-quiet phase (validate)", "truncation notice shown when isTruncated=true", "fallback message shown when content empty", "preview defaults collapsed on card open" (depends T026)

**Checkpoint**: `go test ./cmd/forge/...` passes including T023 tests. Cypress US3 block passes against dev server.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: CHANGELOG, regression, and quickstart verification.

- [ ] T028 Update `CHANGELOG.md`: add `## [v7.17.0]` section with entries for all three user stories (non-blocking card, status panel, artifact preview) under Added
- [ ] T029 [P] Run full existing Cypress suite including `sdd-phase-gate.cy.js` (the 3 original tests + T007 regression) to confirm no regressions from layout changes
- [ ] T030 Manually walk through `specs/004-sdd-pipeline-dashboard/quickstart.md` Scenarios 1–5 against the dev server to confirm all acceptance criteria pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: T002, T003 run in parallel; must be complete before Phase 4 (US1) starts
- **Phase 3 (US2)**: Independent of Phases 2 and 4 — can be worked in parallel with Phase 2 since it touches only frontend CSS/JSX/App.jsx, not the new Go types
- **Phase 4 (US1)**: T016→T008, T017→T009, T018→T013 (Article V: tests before implementation); T012/T014 can start freely in parallel; T010 depends on T008+T009; T011 depends on T009; T015 depends on T012+T013+T014; T019 depends on T015
- **Phase 5 (US3)**: T020 must follow Phase 4 backend tasks (same sdd_wiring.go file); T023/T024/T025 can run in parallel with T020; T021 depends on T020; T022 depends on T021; T026 depends on T024; T027 depends on T026
- **Phase 6 (Polish)**: Depends on all US phases being complete

### User Story Dependencies

- **US2 (Phase 3)**: Independent — no dependency on US1 or US3
- **US1 (Phase 4)**: Depends on Foundational phase (T002/T003)
- **US3 (Phase 5)**: Depends on Phase 4 backend completing (same file, not parallel)

### Within Phase 4 — Parallel Opportunities

```
T008 (sdd_wiring.go backend) ─┐
T009 (handlers_sdd.go)       ─┤→ T010 (wire together) → T011 (route)
T012 (useSddGate.js)         ─┐
T013 (SddPipelinePanel.jsx)  ─┤→ T015 (App.jsx wire) → T019 (Cypress)
T014 (SddPipelinePanel.css)  ─┘
T016 (sdd_wiring_test.go)    [Red→Green: run T016 BEFORE T008 per Article V]
T017 (handlers_sdd_test.go)  [Red→Green: run T017 BEFORE T009 per Article V]
T018 (SddPipelinePanel.test) [Red→Green: run T018 BEFORE T013 per Article V]
```

---

## Implementation Strategy

### MVP First (US2 Only)

1. Complete T001 (branch)
2. Complete T004–T007 (US2 — non-blocking card)
3. **Stop and validate**: Cypress passes, terminal scrollable alongside card
4. Ship US2 as a standalone fix PR if urgency demands

### Incremental Delivery

1. T001 → T002/T003 (Foundational)
2. T004–T007 (US2) — can run in parallel with Foundational
3. T008–T019 (US1) — after Foundational complete
4. T020–T027 (US3) — after US1 backend done
5. T028–T030 (Polish)

---

## Notes

- [P] = different files, no blocking dependency — launch together
- Pre-commit hook requires 1:1 test files: `SddPipelinePanel.jsx` → `SddPipelinePanel.test.jsx` (T018); Go files `sdd_wiring.go`/`handlers_sdd.go` already have test files ✓; `.cy.js` files are recognized as test files by the patched hook ✓
- sdd_wiring.go is modified in both Phase 4 (US1) and Phase 5 (US3) — T020 must follow T008/T010 to avoid merge conflicts
- Verify terminal output via `window.term.buffer.active.getLine(n).translateToString(true)` per Article X — never via DOM text assertion
