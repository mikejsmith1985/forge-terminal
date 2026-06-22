---
description: "Task list for SDD Authoritative State & Concise Phase Reports"
---

# Tasks: SDD Authoritative State & Concise Phase Reports

**Input**: Design documents from `specs/010-sdd-authoritative-state/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED. Constitution Article V mandates Red→Green→Refactor — the failing test is written before the implementation. Unit tests are 100% mocked and run <10 ms; integration tests use real infrastructure; UX tests use Playwright via `run-dev-clean.ps1`, real browser events, reading the xterm.js buffer model (Article X).

**Organization**: Grouped by user story. US1 and US2 are both P1; US1 is the MVP (single-session correctness), US2 layers concurrency scoping on the same identity foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3 — only on user-story tasks

---

## Phase 1: Setup (De-risk)

**Purpose**: Resolve the one unknown that everything depends on before writing code.

- [x] T001 Verify and document session-identity equality: confirm the `id` passed to `NewTerminalSession(id)` in `internal/terminal/session.go` is byte-identical to the frontend `activeTabId` used for `/api/sdd/bind` and WebSocket filtering in `frontend/src/App.jsx`; record the finding (and any required mapping) as an addendum in `specs/010-sdd-authoritative-state/research.md`. BLOCKS all identity work. **DONE (2026-06-22): identical end-to-end (both = `tab.id`); no mapping needed — see research.md R3a.**

**Checkpoint**: We know exactly which value to inject as `FORGE_SESSION_ID`.

---

## Phase 2: Foundational — Per-Tab Identity (Blocking Prerequisite) ⚠️

**Purpose**: A reliable per-tab `FORGE_SESSION_ID`. NO user story can be correctly scoped until this works (FR-003). Highest risk — proven out first per the plan's risk-first sequencing.

- [x] T002 Write FAILING unit test asserting a spawned session's environment contains `FORGE_SESSION_ID` equal to the session id, in `internal/terminal/session_test.go`. **DONE (red): extracted pure `forgeSessionEnv(baseEnv, sessionID)` seam + 3 tests; `TestForgeSessionEnvInjectsSessionID` fails as intended against the T002 stub.**
- [x] T003 Thread the session `id` into the Windows PTY path: extend `startPTYWithShell` signature to accept `sessionID` in `internal/terminal/pty_windows.go` (and keep the Unix path in `internal/terminal/pty_unix.go` consistent). **DONE: both signatures take `sessionID`; caller in `session.go` passes `id`; both platforms compile.**
- [x] T004 Inject `FORGE_SESSION_ID` in `internal/terminal/session.go`: append to `cmd.Env` on Unix; pass the id to `startPTYWithShell` on Windows. **DONE: `forgeSessionEnv` body implemented + wired into the env build (replaced the duplicated inline block); unit tests green.**
- [x] T005 Write `$env:FORGE_SESSION_ID='<id>'` into each ConPTY in `internal/terminal/pty_windows.go`, alongside the existing per-tab `FORGE_INSTANCE_PID`/`FORGE_INSTANCE_PORT` writes (reuse the proven mechanism; do NOT use process-wide `os.Setenv`). **DONE: written per shell type (PowerShell/bash/cmd), guarded by non-empty id; no `os.Setenv`.**
- [x] T006 Integration test: spawn a real session and assert a child process reads the correct, distinct `FORGE_SESSION_ID`, in `internal/terminal/session_test.go`. **DONE: real two-ConPTY test (`session_identity_integration_windows_test.go`, Windows-tagged) — each child reports its own id, neither leaks the other's. PASS in 1.14s.**

**Checkpoint**: Each tab carries its own identity; two tabs read two distinct values. Make T002/T006 green before proceeding.

---

## Phase 3: User Story 1 — Phase Bar Always Shows the True Phase (Priority: P1) 🎯 MVP

**Goal**: State is driven by authoritative `phase-event` signals, not inference; the bar is correct within a single session.

**Independent Test**: Run a phase command; the bar shows `running` immediately and `awaiting-decision` ≤2 s after completion, without the terminal falling quiet, and does not flip on repeated artifact edits.

### Tests for User Story 1 (write first, must FAIL)

- [x] T007 [P] [US1] Unit test: orchestrator transitions are driven by `PhaseEvent{started|complete}` and NOT by file-watcher events, in `internal/sdd/orchestrator_test.go`. **COVERED: the orchestrator is unchanged in US1 (dedup is wiring-level); the "watcher stands down" mechanism is proven by the existing `TestMarkPhaseRunning_IdempotentWhenAlreadyRunning`, and the event→state driving is proven by T008.**
- [x] T008 [P] [US1] Integration test: `POST /api/sdd/phase-event` (started then complete) drives `MarkPhaseRunning`/`HandlePhaseComplete` and broadcasts `SDD_PHASE_STATUS`/`SDD_PHASE_GATE`, in `cmd/forge/handlers_sdd_phaseevent_test.go`. **DONE: 5 tests green (started→running, complete→gate+decisions, duplicate-complete no-op, unknown-session ignored, 400 validation).**
- [ ] T009 [P] [US1] e2e: bar advances on the authoritative signal and does not flip on repeated edits, in `tests/e2e/sdd-authoritative-state.spec.js`. **PENDING — needs the running app + T014/T015 wired.**

### Implementation for User Story 1

- [x] T010 [US1] Add `PhaseEvent` type and `PhaseBaseline` field to `PipelineState` in `internal/sdd/types.go` (per data-model.md). **DONE (adapted): `PhaseEvent` is the wire request `sddPhaseEventRequest` in `handlers_sdd.go` (kept the HTTP shape out of the domain package). `PhaseBaseline` deferred to US3/T027 where git capture lives — recorded as a deviation.**
- [x] T011 [US1] Implement `handleSddPhaseEvent` in `cmd/forge/handlers_sdd.go` per `contracts/phase-event-endpoint.md` (started → MarkPhaseRunning; complete → HandlePhaseComplete; ignore unbound sessionId; 400/409 validation). **DONE incl. `activeSddFeatureDir` (reads `.specify/feature.json` authoritatively).**
- [x] T012 [US1] Register `POST /api/sdd/phase-event` route in `cmd/forge/main.go`. **DONE.**
- [x] T013 [US1] In `cmd/forge/sdd_wiring.go`, drive the orchestrator from the phase-event and DEMOTE the file-watcher (`detector.go`) and quiet-detection to fallback-only (FR-001b, FR-002). **DONE: the watcher's settle goroutine now stands down if the authoritative signal already opened the gate; the endpoint stands down if the watcher beat it. Orchestrator untouched (existing tests intact).**
- [x] T014 [US1] Update `scripts/sdd-gate-check.ps1` to also POST `phase-event{event:"started"}` for the matched `speckit-*` phase (authoritative start). **DONE: skill→phase map; emits started after the gate-check passes; best-effort (never blocks). PS1 parses clean. Live verification needs a running backend + agent.**
- [ ] T015 [US1] Add a mandatory final step to each speckit phase-command skill (the global skill definitions / their repo source) that POSTs `phase-event{event:"complete", decisions:[...]}` scoped by `$env:FORGE_SESSION_ID` (FR-001b, FR-007a) — including the artifact-less Validate/Implement phases. The emit step MUST be additive: assert the skill's existing behaviour (artifact production, completion report) is unaffected (FR-010). **PENDING — edits global skill files outside the repo.**
- [x] T016 [US1] Confirm disk reconciliation (the sole shipped fallback) still converges a missed `complete` in `internal/sdd/orchestrator.go` (FR-002); add a unit test for the missed-signal path. (The Stop hook is explicitly out of scope — disk reconciliation alone satisfies FR-002.) **COVERED: existing `TestReconcileFromDisk_AdvancesPastExistingArtifacts` / `_StopsAtFirstMissingArtifact` already prove convergence from disk with no completion event.**

**Checkpoint**: Single-session bar is authoritative and correct — MVP demonstrable. STOP and validate.

---

## Phase 4: User Story 2 — Concurrent Pipelines Never Conflate (Priority: P1)

**Goal**: Gate-check and broadcasts are scoped to one session; concurrent pipelines never interfere.

**Independent Test**: Two tabs in two repos at different phases; each bar shows only its own phase; a gate open in tab A does not block a `speckit-*` skill in tab B.

### Tests for User Story 2 (write first, must FAIL)

- [x] T017 [P] [US2] Unit test: `handleSddGateCheck` returns ONLY the requested session's gate state and never ranges over other pipelines, in `cmd/forge/handlers_sdd_test.go`. **DONE: `TestHandleSddGateCheck_ScopedToRequestingSession` + `_MissingSessionIdIsClosed`; existing gate-check tests updated to be session-aware (the contract changed).**
- [ ] T018 [P] [US2] e2e: two tabs / two repos — no state bleed-through; gate in A does not block B; approve in A advances only A, in `tests/e2e/sdd-authoritative-state.spec.js`. **PENDING — needs the running app.**

### Implementation for User Story 2

- [x] T019 [US2] Rewrite `handleSddGateCheck` in `cmd/forge/handlers_sdd.go` to accept `?sessionId=` and look up only `sddPipelineFor(sessionId)` — remove the `sddPipelines.Range` global scan (FR-005), per `contracts/gate-check-endpoint.md`. **DONE: global `Range` removed; scoped lookup; missing/unknown session → closed.**
- [x] T020 [US2] Update `scripts/sdd-gate-check.ps1` to read `$env:FORGE_SESSION_ID`, send `?sessionId=<id>`, and `exit 0` when it is empty (unbound tab = SDD inactive, FR-011a). **DONE (same rewrite as T014).**
- [x] T021 [US2] Verify and harden client-side `sessionId` filtering of `SDD_PHASE_STATUS`/`SDD_PHASE_GATE` in `frontend/src/hooks/useSddGate.js` (drop mismatched-session messages). **VERIFIED — already correct: both message types filter on `parsed.sessionId !== activeSessionId` and all state resets on tab switch. No change needed (FR-006).**
- [x] T022 [US2] Audit every SDD broadcast in `cmd/forge/sdd_wiring.go` to confirm each is delivered via `BroadcastJSONToSession(sessionId, …)` and never globally (FR-006). **VERIFIED — both `broadcastPhaseStatus` and `newSddBroadcaster` use `BroadcastJSONToSession`; no global broadcast exists. No change needed.**

**Checkpoint**: US1 + US2 both pass; concurrency is conflation-free.

---

## Phase 5: User Story 3 — Concise Phase Report Instead of a Wall of Text (Priority: P2)

**Goal**: A scannable report card (files +/- counts, scope, decisions) replaces the verbose gate document; full output is opt-in.

**Independent Test**: Complete a phase; the card shows grouped bullets ≤100 words; a no-op phase says "No files changed"; "View full output" opens the verbose artifact on demand.

### Tests for User Story 3 (write first, must FAIL)

- [ ] T023 [P] [US3] Unit test: report-card builder produces files/scope/decisions, enforces the ≤100-word essential target, and handles the empty-files and magnitude-unavailable branches, in `internal/sdd/report_card_test.go`.
- [ ] T024 [P] [US3] Integration test: `git stash create` baseline + `git diff --numstat` yields only the phase-window file changes (FR-014), in `internal/sdd/report_card_test.go` (or `cmd/forge/handlers_sdd_phaseevent_test.go`).
- [ ] T025 [P] [US3] e2e: grouped-bullet card render, "No files changed" case, "View full output" opt-in, and the "unbound — SDD inactive" indicator, in `tests/e2e/sdd-authoritative-state.spec.js`.

### Implementation for User Story 3

- [ ] T026 [P] [US3] Add `PhaseReportCard` and `FileChange` types in `internal/sdd/types.go` (per data-model.md).
- [ ] T027 [US3] Capture the git baseline (`git stash create`, or `HEAD` when clean) at the `phase-event{started}` in `cmd/forge/sdd_wiring.go` and store it on `PipelineState.PhaseBaseline`.
- [ ] T028 [US3] Build the report card by diffing `--numstat` against `PhaseBaseline` on `complete` in `cmd/forge/sdd_wiring.go` (FR-013 magnitude-unavailable fallback; FR-014 window scoping).
- [ ] T029 [US3] Attach the `PhaseReportCard` to the `SDD_PHASE_GATE` envelope in `cmd/forge/sdd_wiring.go`.
- [ ] T030 [US3] Render the grouped-bullet card (files / scope / decisions, truncate long file lists) and the "View full output" opt-in action in `frontend/src/components/SddDashboard.jsx` (FR-007, FR-008, FR-009).
- [ ] T031 [US3] Add the "unbound — SDD inactive" indicator in `frontend/src/components/SddDashboard.jsx` / `frontend/src/components/ActionPromptStrip.jsx` (FR-011a).

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T032 [P] Resilience test + fix: after a backend restart, `handleSddStatus` restores each session's gate for its own identity with zero cross-session leakage (FR-012, SC-007), in `cmd/forge/handlers_sdd_test.go`.
- [ ] T033 [P] Idempotent double-`complete` guard (no duplicate gate / no double-injection) in `internal/sdd/orchestrator.go` with a unit test.
- [ ] T034 Update `scripts/install-sdd-hook.ps1` if the hook script's arguments changed, and reinstall the global hook; verify `isSddHookInstalled` still detects it.
- [ ] T035 [P] Update `CHANGELOG.md` describing the authoritative-state + concise-report-card behaviour change (Article VI).
- [ ] T036 Run all `quickstart.md` scenarios via `run-dev-clean.ps1` and capture xterm.js-buffer evidence (Article X).
- [ ] T037 [P] Code-quality pass across touched files: one-line purpose comments, doc comments on exported funcs, functions <40 lines, `is/has/can/should/was` booleans, no magic numbers (Article IV).

---

## Dependencies & Execution Order

- **Setup (T001)**: first — de-risks identity. Blocks Phase 2.
- **Foundational (T002–T006)**: depends on T001. BLOCKS all user stories (identity is required to scope every signal).
- **US1 (T007–T016)**: after Foundational. The MVP.
- **US2 (T017–T022)**: after Foundational; pairs with US1's `phase-event` but the scoped gate-check is independently testable. Its e2e (T018) needs US1's signals to drive state.
- **US3 (T023–T031)**: after US1 (the report card is built when a `complete` event fires).
- **Polish (T032–T037)**: after the targeted user stories are complete.

### Within each story

- Tests (Red) before implementation (Green) — Article V.
- Types before handlers; handlers before wiring; backend before frontend render.

### Parallel Opportunities

- Foundational unit/integration tests (T002) before its impl; impl tasks T003–T005 touch related files — sequence T003→T004→T005, then T006.
- US1 tests T007/T008/T009 in parallel (different files).
- US2 tests T017/T018 in parallel.
- US3 tests T023/T024/T025 and type task T026 in parallel.
- Polish T032/T033/T035/T037 in parallel (different files).

---

## Parallel Example: User Story 1 tests

```text
# Launch the three US1 tests together (different files, all must fail first):
Task: "Unit test orchestrator driven by PhaseEvent in internal/sdd/orchestrator_test.go"
Task: "Integration test POST /api/sdd/phase-event in cmd/forge/handlers_sdd_phaseevent_test.go"
Task: "e2e bar-advances-on-signal in tests/e2e/sdd-authoritative-state.spec.js"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup (T001) — know the identity value.
2. Phase 2 Foundational (T002–T006) — reliable per-tab `FORGE_SESSION_ID`. **If this can't be made reliable, stop and reassess — it's the linchpin.**
3. Phase 3 US1 (T007–T016) — authoritative single-session correctness.
4. **STOP and VALIDATE**: the bar shows the truth in one session. Demo.

### Incremental Delivery

US1 (MVP, correct bar) → US2 (concurrency, no conflation) → US3 (concise report card) → Polish (resilience, CHANGELOG, quickstart proof). Each increment is independently testable and adds value without breaking the previous.

---

## Notes

- The risk is front-loaded on purpose: T002–T006 (Windows ConPTY identity) is the single most likely thing to fight back. Proving it on day one is how this avoids becoming the 11th failed attempt.
- T015 touches the global speckit skill definitions (outside `cmd/forge`), not repo Go code — call it out in the PR so the hook + skill changes ship together with `install-sdd-hook.ps1`.
- Commit after each task or logical group; never commit to `main` (Article III).
