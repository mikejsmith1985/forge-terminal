# Tasks: SDD Gate Reconciliation

**Input**: Design documents from `specs/007-sdd-gate-reconciliation/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅ | quickstart.md ✅

**Tests**: Included — constitution Article V mandates Red → Green → Refactor. Test tasks precede implementation tasks in every phase.

**Organization**: Grouped by user story (US1 P1 → US2 P2 → US3 P3). US3 implementation depends on US1's `ReconcileFromDisk` being complete; US2 is fully independent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared state)
- **[Story]**: Which user story this task belongs to
- TDD rule: tasks marked `(RED)` must fail before the next implementation task runs

---

## Phase 1: Setup

**Purpose**: Create the feature branch. No new packages or migrations — all changes are modifications to existing files.

- [ ] T001 Create and switch to branch `feature/007-sdd-gate-reconciliation` from `main`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type and constant changes shared by all three user stories. US1, US2, and US3 cannot compile without these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 [P] Add `AutoApproveAfterSeconds int` field to `Phase` struct and add `clarifySkipMarker = "<!-- clarify:skip -->"` constant in `internal/sdd/phases.go`; set `AutoApproveAfterSeconds: 20` on the Clarify phase entry in the phase table
- [ ] T003 [P] Add `ShouldAutoApprove bool` and `AutoApproveAfterSeconds int` fields to the `DecisionCard` struct in `internal/sdd/types.go`

**Checkpoint**: `go build ./...` compiles clean. Foundation ready — user story phases can now begin.

---

## Phase 3: User Story 1 — Pipeline Auto-Reconciliation (Priority: P1) 🎯 MVP

**Goal**: The SDD Dashboard automatically reflects accurate pipeline state after any phase runs out of order, within one status broadcast cycle, with no user interaction.

**Independent Test**: Inject a `SDD_PHASE_STATUS` event with Clarify AWAITING but Plan/Tasks/Validate/Implement artifacts present on disk; verify dashboard shows all complete within one cycle. (Quickstart Scenarios 1, 8, 9.)

### Tests for User Story 1 — write first, verify RED before implementing

- [ ] T004 Write failing `TestReconcileFromDisk_*` unit tests in `internal/sdd/orchestrator_test.go` covering: (a) stuck-pipeline resolves to correct state, (b) idle pipeline unchanged, (c) in-progress phase not disturbed, (d) idempotency over 10 calls, (e) artifact-less phases (Validate/Implement) skipped correctly (RED)
- [ ] T005 Write failing `TestBuildPhaseStatuses_ReconciliationFires_BeforeBroadcast` integration test in `cmd/forge/sdd_wiring_test.go` asserting the broadcast reflects reconciled state when later artifacts exist on disk (RED)

### Implementation for User Story 1

- [ ] T006 [US1] Implement `ReconcileFromDisk(featureDir string)` method on `*Orchestrator` in `internal/sdd/orchestrator.go`: forward-scan phases in order, call `os.Stat(filepath.Join(featureDir, phase.ExpectedArtifact))` for each non-empty artifact, advance `CurrentPhase` while artifacts exist, stop at first missing artifact; method must be idempotent and must never rewind `CurrentPhase`
- [ ] T007 [US1] Call `pipeline.orchestrator.ReconcileFromDisk(state.FeatureDir)` at the start of `broadcastSddPhaseStatus` in `cmd/forge/sdd_wiring.go`, before the `buildPhaseStatuses` call
- [ ] T008 [US1] Run `go test ./internal/sdd/... ./cmd/forge/...` and verify T004 and T005 are now GREEN; fix any failures before proceeding

**Checkpoint**: User Story 1 is fully functional. Stuck-pipeline scenario resolves automatically. Go tests pass.

---

## Phase 4: User Story 2 — Auto-Approve Veto Window (Priority: P2)

**Goal**: When the agent outputs `<!-- clarify:skip -->`, the decision bar shows a 20-second countdown with a veto button instead of the standard gate card. If not vetoed, the pipeline auto-approves. If the Approve call fails, it retries up to 3 times then reverts to the standard gate card.

**Independent Test**: Mock a `SDD_PHASE_GATE` event with `shouldAutoApprove: true, autoApproveAfterSeconds: 3`; verify countdown appears, auto-approve fires at T+3s, and veto button cancels the countdown when clicked. (Quickstart Scenarios 3, 4, 5, 6, 7.)

### Tests for User Story 2 — write first, verify RED before implementing

- [ ] T009 [P] Write failing tests in `frontend/src/hooks/useSddGate.test.js`: (a) countdown starts when `card.shouldAutoApprove` is true; (b) countdown fires `submitDecision(Approve)` when it reaches 0; (c) veto button sets `isVetoed=true` and clears countdown; (d) non-skip gate card shows no countdown; (e) 3 failed Approve calls revert to standard gate card (RED)
- [ ] T010 [P] Write failing tests in `frontend/src/components/SddDashboard.test.jsx`: (a) countdown indicator renders when `countdownSecondsRemaining > 0`; (b) veto button renders and Approve/Reject/Clarify buttons do NOT render during countdown; (c) standard buttons render when `countdownSecondsRemaining` is null (RED)

### Implementation for User Story 2

- [ ] T011 [US2] In `cmd/forge/sdd_wiring.go`, update the `SDD_PHASE_GATE` broadcast logic: when the PTY output for the Clarify phase contains `clarifySkipMarker`, set `card.ShouldAutoApprove = true` and `card.AutoApproveAfterSeconds = phase.AutoApproveAfterSeconds` before emitting the envelope
- [ ] T012 [US2] In `frontend/src/hooks/useSddGate.js`, add state fields `countdownSecondsRemaining` (number|null, initial null) and `isVetoed` (bool, initial false); add a `useEffect` that starts a 1-second `setInterval` when `card.shouldAutoApprove && !isVetoed && countdownSecondsRemaining > 0`; at 0, call `submitDecision(ActionApprove)` via a retry wrapper (3 attempts, 1s backoff via `setTimeout`); on all-retries-fail, set `countdownSecondsRemaining = null` and `isVetoed = true`; export `countdownSecondsRemaining`, `isVetoed`, and a `vetoAutoApprove` callback
- [ ] T013 [US2] In `frontend/src/components/SddDashboard.jsx`, update the `DecisionBar` sub-component: when `countdownSecondsRemaining > 0`, render a countdown indicator (`{countdownSecondsRemaining}s`) and a single "Stop — I want to add input" button that calls `vetoAutoApprove()`; hide Approve/Reject/Clarify buttons during countdown; show them when `isVetoed` is true or `countdownSecondsRemaining` is null
- [ ] T014 [US2] Add countdown indicator and veto button styles to `frontend/src/components/SddDashboard.css`: countdown number uses `font-variant-numeric: tabular-nums` to prevent layout shift; veto button uses a neutral style distinct from Approve (green) and Reject (red)
- [ ] T015 [US2] Run `cd frontend && npx vitest run` and verify T009 and T010 are now GREEN; fix any failures before proceeding

**Checkpoint**: User Story 2 is fully functional. Auto-approve countdown works. Veto cancels. API failure reverts to standard gate card. Frontend tests pass.

---

## Phase 5: User Story 3 — Bulk Approve Semantics (Priority: P3)

**Goal**: Clicking Approve on a gate that is N phases behind the actual completion state resolves all intermediate phases in one operation, with no intermediate gate cards.

**Independent Test**: Place the orchestrator with Clarify AWAITING and Plan/Tasks/Validate/Implement artifacts present on disk; click Approve on Clarify; verify dashboard shows all-complete immediately with exactly one status broadcast and zero intermediate gate cards. (Quickstart Scenario 2.)

**⚠️ Implementation dependency**: T017 calls `ReconcileFromDisk` which is implemented in T006 (US1). T016 (the test) can be written at any time after T003.

### Tests for User Story 3 — write first, verify RED before implementing

- [ ] T016 [US3] Write failing `TestOrchestrator_SubmitDecision_BulkApprove_*` tests in `internal/sdd/orchestrator_test.go`: (a) Approve on a gate 4 phases behind reality resolves all in one call; (b) Approve does not advance past the artifact frontier; (c) Approve on a gate with no subsequent completed phases advances by exactly one (normal case unbroken) (RED)

### Implementation for User Story 3

- [ ] T017 [US3] In `internal/sdd/orchestrator.go`, modify `SubmitDecision(ActionApprove)`: after the existing `CurrentPhase` advance logic, call `o.ReconcileFromDisk(o.state.FeatureDir)` synchronously before returning; this jump-to-frontier is silent — no gate cards emitted, single broadcast on the caller's side (depends on T006)
- [ ] T018 [US3] Run `go test ./internal/sdd/...` and verify T016 is now GREEN; run `go test ./cmd/forge/...` to confirm no regressions; fix any failures before proceeding

**Checkpoint**: All three user stories are fully functional and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, final verification, and Playwright UX validation.

- [ ] T019 [P] Update `CHANGELOG.md` under `[Unreleased]`: add three entries (reconciliation, auto-approve veto window, bulk Approve semantics) with user-facing descriptions
- [ ] T020 [P] Run full Go test suite `go test ./...` and confirm all tests pass with zero failures or races
- [ ] T021 [P] Run full frontend test suite `cd frontend && npx vitest run` and confirm all tests pass
- [ ] T022 Run all 9 quickstart validation scenarios from `specs/007-sdd-gate-reconciliation/quickstart.md` via Playwright against `run-dev-clean.ps1`; confirm each scenario produces the expected outcome

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1; T002 and T003 can run in parallel
- **US1 (Phase 3)**: Depends on Phase 2 — T004/T005 (tests) can start immediately after Phase 2; T006/T007 (impl) after tests are RED
- **US2 (Phase 4)**: Depends on Phase 2 only — fully independent of US1 and US3; T009/T010 (tests) can run in parallel with US1
- **US3 (Phase 5)**: Test (T016) can start after Phase 2; implementation (T017) depends on T006 (US1 `ReconcileFromDisk`)
- **Polish (Phase 6)**: Depends on all three user story phases complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only
- **US2 (P2)**: Depends on Phase 2 only — independent of US1 and US3
- **US3 (P3)**: Test independent; implementation depends on US1 (T006)

### Within Each User Story

- Tests MUST be written first and verified RED before implementation begins (Article V)
- Go changes before frontend changes within each story (backend is the source of truth for gate events)
- Each story ends with a verify task confirming tests are GREEN

### Parallel Opportunities

- T002 and T003 (foundational type changes) can run in parallel — different files
- T004/T005 (US1 tests) can run in parallel after Phase 2 — different files
- T009/T010 (US2 tests) can run in parallel with T004/T005 — different language layer entirely
- T016 (US3 test) can run in parallel with US1/US2 implementation tasks
- T019/T020/T021 (polish) can run in parallel — different concerns

---

## Parallel Example: Foundational Phase

```text
Run simultaneously after T001:
  T002 — internal/sdd/phases.go (Go)
  T003 — internal/sdd/types.go (Go)
```

## Parallel Example: Test Writing (after Phase 2)

```text
Run simultaneously:
  T004 — internal/sdd/orchestrator_test.go (Go)
  T005 — cmd/forge/sdd_wiring_test.go (Go)
  T009 — frontend/src/hooks/useSddGate.test.js (JS)
  T010 — frontend/src/components/SddDashboard.test.jsx (JS)
  T016 — internal/sdd/orchestrator_test.go (US3 section, Go)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T002, T003)
3. Write US1 tests (T004, T005) → verify RED
4. Implement ReconcileFromDisk (T006) → call in wiring (T007)
5. Verify US1 tests GREEN (T008)
6. **STOP and VALIDATE**: Stuck-pipeline scenario resolves automatically
7. Ship as `fix/*` if the value is urgent; continue to US2/US3 otherwise

### Incremental Delivery

1. Setup + Foundational → types compile
2. US1 → auto-reconciliation live; stuck states self-heal
3. US2 → skip-Clarify no longer blocks; countdown UX live
4. US3 → single-click bulk resolution; cascading gate cards eliminated
5. Polish → all quickstart scenarios verified

### Parallel Team Strategy

After Phase 2 completes:
- Developer A: US1 (Go orchestrator + wiring)
- Developer B: US2 (Go wiring signal + React countdown)
- Developer C: US3 test (T016) then waits for Developer A's T006

---

## Notes

- `[P]` tasks = different files, no incomplete-task dependencies — safe to run concurrently
- Article V (TDD): tests MUST fail before implementation; do not skip RED verification
- Article II: no wildcard process kills — use `Stop-Process -Id <PID>` if fterm.exe must be restarted during Playwright runs
- Commit after each checkpoint with `fix: …` or `feat: …` message format
- T017 (bulk Approve) is the only cross-story implementation dependency: it requires T006 (ReconcileFromDisk) to be complete
