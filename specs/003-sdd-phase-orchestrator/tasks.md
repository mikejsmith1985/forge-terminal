---
description: "Task list for SDD Phase Orchestrator"
---

# Tasks: SDD Phase Orchestrator with In-Terminal HITL Decision Cards

**Input**: Design documents from `specs/003-sdd-phase-orchestrator/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED. Constitution Article V mandates TDD (Red → Green) — every story's tests are written first and must FAIL before implementation.

**Organization**: Tasks are grouped by user story (US1=P1 MVP, US2=P2, US3=P3) for independent implementation and testing.

> **Post-analyze remediation applied**: completion-detection→event is a shared seam in Foundational (I1); detection is split file-based vs PTY-quiet (U2); session binding is explicit (U3); an integration test closes the three-layer gap (C1).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: User story label (US1/US2/US3) — story phases only

## Path Conventions

Web app within the Forge monorepo: Go backend in `internal/` + `cmd/forge/`, React frontend in `frontend/src/`, UX tests in `cypress/e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create `internal/sdd/` package with `doc.go` carrying the one-line purpose comment (Article IV)
- [x] T002 [P] Add config (env `FORGE_SDD_NOTIFY_URL` default `http://localhost:7000/sdd/phase`, 5s client timeout, `~/.forge/sdd/` path) as named constants in `internal/sdd/config.go`
- [x] T003 [P] Add an `[Unreleased]` stub entry for the orchestrator in `CHANGELOG.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Define core domain types + status enums (`Phase`, `PhaseArtifact`, `PhaseSummary`, `Flag`, `DecisionCard`, `Decision`, `NotificationEvent`, `PipelineState`) per `data-model.md` in `internal/sdd/types.go`
- [x] T005 [P] Define the five-phase table (name, order, `nextCommand`, `completionSignal`, `expectedArtifact`, `isTerminal`; Validate & Implement = `pty-quiet`) per research R3 in `internal/sdd/phases.go`
- [x] T006 [P] Implement decision-history persistence (append to `~/.forge/sdd/<feature>.json`) in `internal/sdd/history.go`
- [x] T007 [P] Unit test (write FIRST, must FAIL): history round-trip + append in `internal/sdd/history_test.go`
- [x] T008 Implement the **file-based** completion detector (Specify/Clarify/Plan via `tutor.Watcher` + content-marker for Clarify; ignore non-artifact files, FR-016) in `internal/sdd/detector.go`
- [x] T009 [P] Unit test (write FIRST, must FAIL): file detector per-phase signal + non-artifact ignore using a mock watcher in `internal/sdd/detector_test.go`
- [x] T010 Implement the **PTY-quiet** completion detector for Validate/Implement (reuse `waitForPTYQuiet`) in `internal/sdd/detector_ptyquiet.go` (U2)
- [x] T011 Implement orchestrator skeleton + **shared completion seam**: `HandlePhaseComplete(phase, artifact)` records the completion and emits it to registered subscribers (no card/notify logic yet) in `internal/sdd/orchestrator.go` (I1 — both US1 and US3 subscribe here)
- [x] T012 Implement pipeline-to-session binding — frontend-driven `POST /api/sdd/bind` resolves the feature from `.specify/feature.json` and binds the session (backend has no per-session cwd; see research R9) in `cmd/forge/sdd_wiring.go` (U3)
- [x] T013 Implement the `SDD_PHASE_GATE` broadcast helper (`GateBroadcaster` interface + real impl calling the terminal hub `broadcastJSON`) in `internal/sdd/gate.go`
- [x] T014 Add `POST /api/sdd/decision` handler skeleton in `cmd/forge/handlers_sdd.go` and register via `WrapWithMiddleware` in `cmd/forge/main.go`
- [x] T015 Construct the orchestrator at startup and wire both detectors → `HandlePhaseComplete` in `cmd/forge/main.go`

**Checkpoint**: Detection (both modes), the shared completion seam, persistence, transport, binding, and the endpoint exist — stories can begin and subscribe independently.

---

## Phase 3: User Story 1 - Approve or stop at a glance (Priority: P1) 🎯 MVP

**Goal**: After a phase completes, a scannable card appears in Forge; Approve auto-advances (injects the next phase command), Reject stops.

**Independent Test**: Complete a phase → card appears with phase + summary + flags; Approve injects the next `/speckit-*` command (verified via `window.term.buffer.active`); Reject injects nothing and halts — no browser opens.

### Tests for User Story 1 (write FIRST, ensure they FAIL)

- [x] T016 [P] [US1] Unit test orchestrator `approve`→advancing and `reject`→rejected transitions (mock injector) in `internal/sdd/orchestrator_test.go`
- [x] T017 [P] [US1] Unit test deterministic summarizer against golden artifacts (checklist counts, `[NEEDS CLARIFICATION]`, missing-artifact `block` flag) in `internal/sdd/summary_test.go`
- [x] T018 [P] [US1] Unit test `POST /api/sdd/decision` for approve + reject (200/409 on stale cardId) in `cmd/forge/handlers_sdd_test.go`
- [x] T019 [P] [US1] vitest: `PhaseDecisionCard` renders status/headline/flags and fires `onAction` in `frontend/src/components/PhaseDecisionCard.test.jsx`
- [x] T020 [P] [US1] vitest: `useSddGate` dispatches `SDD_PHASE_GATE` and POSTs the decision in `frontend/src/hooks/useSddGate.test.js`
- [ ] T021 [US1] Cypress UX (real events): phase completes → card → Approve injects next command, asserted via `window.term.buffer.active`, in `cypress/e2e/sdd-phase-gate.cy.js` — **written; validate by running against the dev build (`run-dev-clean -Port 9999`), per Article V UX tests are not headless**

### Implementation for User Story 1

- [x] T022 [P] [US1] Implement the deterministic summarizer (FR-017: headline + produced items + flags from artifacts; missing-artifact = block, FR-013) in `internal/sdd/summary.go`
- [x] T023 [US1] Implement `approve` (advance by injecting next phase command via the macro path) and `reject` (stop) transitions in `internal/sdd/orchestrator.go` (depends on T011, T022)
- [x] T024 [US1] Subscribe to the completion seam → build summary → broadcast `SDD_PHASE_GATE` → set the single `pendingCard` (FR-014) in `internal/sdd/orchestrator.go` (depends on T011, T013, T022)
- [x] T025 [US1] Implement handler approve/reject forwarding to the orchestrator + record to history in `cmd/forge/handlers_sdd.go` (depends on T014, T023, T006)
- [x] T026 [P] [US1] Build `PhaseDecisionCard.jsx` (status · headline · produced items · flag chips · Approve/Reject/Clarify buttons) + `PhaseDecisionCard.css` in `frontend/src/components/`
- [x] T027 [US1] Build `useSddGate.js` (subscribe to `SDD_PHASE_GATE` for the active session; POST to `/api/sdd/decision`) in `frontend/src/hooks/useSddGate.js`
- [x] T028 [US1] Mount the card beside the active terminal keyed by `activeTabId` in `frontend/src/App.jsx` (depends on T026, T027)

**Checkpoint**: MVP — cards appear and Approve/Reject work end-to-end and independently.

---

## Phase 4: User Story 2 - Steer the next phase with a clarifying prompt (Priority: P2)

**Goal**: Clarify carries a short steer into the next phase; cancelling with empty text leaves the card pending.

### Tests for User Story 2 (write FIRST, ensure they FAIL)

- [x] T029 [P] [US2] Unit test `clarify` transition (steer appended; empty text → stays pending) extending `internal/sdd/orchestrator_test.go`
- [x] T030 [P] [US2] vitest: clarify input + confirm/cancel flow extending `frontend/src/components/PhaseDecisionCard.test.jsx`

### Implementation for User Story 2

- [x] T031 [US2] Implement `clarify` transition (inject next phase command with steer; reject empty steer) in `internal/sdd/orchestrator.go` (depends on T023)
- [x] T032 [US2] Add clarify-text input + confirm/cancel to `PhaseDecisionCard.jsx` and POST the clarify action in `useSddGate.js` (depends on T026, T027)
- [x] T033 [US2] Handle clarify (400 on empty steer, FR-009 cancel path) in `cmd/forge/handlers_sdd.go` (depends on T025, T031)

**Checkpoint**: US1 + US2 both work independently.

---

## Phase 5: User Story 3 - Notify the local automation service (Priority: P3)

**Goal**: Each phase completion fires one best-effort POST to AzureWorkflowPOC; a down service never affects the card or pipeline.

### Tests for User Story 3 (write FIRST, ensure they FAIL)

- [x] T034 [P] [US3] Unit test notifier (payload per contract; non-blocking; error swallowed — FR-012) with a mock transport in `internal/sdd/notifier_test.go`

### Implementation for User Story 3

- [x] T035 [US3] Implement the best-effort notifier (goroutine POST, dedicated 5s client modeled on `notifyHTTPClient`, log failures) in `internal/sdd/notifier.go` (depends on T002)
- [x] T036 [US3] Subscribe to the completion seam → fire the `NotificationEvent` exactly once in `internal/sdd/orchestrator.go` (depends on T011, T035 — **independent of US1** via the shared seam, I1)

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T037 [P] Integration test (C1): real file reads through the summarizer + a real HTTP POST through the notifier (real local server) — closes the three-layer gap (Article V) in `internal/sdd/integration_test.go`
- [x] T038 [P] Finalize the `CHANGELOG.md` `[Unreleased]` entry (Article VI)
- [x] T039 [P] Add "why" comments + structured gate-lifecycle logging across `internal/sdd/` (Article IV)
- [ ] T040 Run `quickstart.md` V1–V7 validation via `run-dev-clean.ps1` (Article X: assert via xterm buffer model)
- [x] T041 [P] Verify green: `go build ./cmd/forge/`, `go test ./internal/sdd/...`, `cd frontend && npx vitest run`, `go vet ./internal/sdd/...`
- [x] T042 Refresh the `SPECKIT` agent-context note in `CLAUDE.md` if scope changed

---

## Dependencies & Execution Order

- **Setup → Foundational → (US1 | US2 | US3) → Polish.**
- **I1 fix**: the completion seam (T011) is Foundational; US1 (T024) and US3 (T036) both subscribe to it, so US3 no longer depends on US1.
- Within a story: tests (FAIL first) → types/table → detector/orchestrator → handler → frontend mount.

### Parallel opportunities

- Setup: T002, T003. Foundational: T005, T006(+T007), T009 parallel after T004.
- US1 tests T016–T020 all `[P]`; summarizer T022 ∥ card T026.
- After Foundational, US1 / US2 / US3 can be staffed in parallel (independent via the seam).

## Implementation Strategy

**MVP first**: Setup → Foundational → US1 → validate quickstart V1–V3 → demo. US1 alone delivers the core value (stops blind approvals).

## Notes

- Workflow gates (`branch-created` → `tests-written` → `tests-passed`) recorded during implement; the pre-commit hook blocks otherwise.
- Verify each story's tests FAIL before implementing. Never commit directly to `main` (Article III).
