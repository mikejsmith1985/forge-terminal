---
description: "Task list for feature 012 — Repeatable SDD: deterministic resume + enforced TDD & Playwright UX"
---

# Tasks: Repeatable SDD — Deterministic Resume + Enforced TDD & Playwright UX Validation

**Input**: Design documents from `specs/012-tdd-sdd-enforcement/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R7), data-model.md, contracts/ (deterministic-resume, verification-gates), quickstart.md

**Tests**: REQUIRED and written-first. This feature's purpose is to enforce TDD, so every behavior-changing task is preceded by a failing test (Red) that passes only after implementation (Green) — Constitution Article V. The feature must be dogfooded against the gates it introduces.

**Organization**: By user story. US1 (resume) is independent and is the MVP. US2/US3/US4 share the verification substrate built in Phase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 for story phases only

## Path Conventions

Go backend at repo root (`cmd/forge/`, `internal/`); React frontend at `frontend/src/`; Playwright e2e at `tests/e2e/`. Paths below are exact.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a green baseline and create empty skeletons so later tasks only add behavior.

- [ ] T001 Confirm a green baseline on `feature/012-tdd-sdd-enforcement`: run `go test ./...`, `cd frontend && npx vitest run`, and `npx playwright --version`; record that all pass before any change.
- [ ] T002 [P] Create skeleton `cmd/forge/sdd_resume.go` with a one-line file-purpose comment and package declaration only (no logic).
- [ ] T003 [P] Create skeleton `cmd/forge/sdd_verification.go` with a one-line file-purpose comment and package declaration only (no logic).
- [ ] T004 [P] Create skeleton `tests/e2e/sdd-tdd-enforcement.spec.js` with `test.describe` blocks and `test.fixme` placeholders for resume / TDD gate / UX gate.

---

## Phase 2: Foundational (Verification Substrate)

**Purpose**: The shared verification core needed by US2, US3, and US4. (US1 is independent and may proceed in parallel with this phase — see Dependencies.)

**⚠️ CRITICAL**: US2/US3/US4 cannot begin until this phase is complete.

- [ ] T005 Define `BehaviorClassification`, `PhaseVerificationRecord`, and `GateDecision` types per data-model.md in `cmd/forge/sdd_verification.go`.
- [ ] T006 [P] Write FAILING unit test for `ClassifyBehavior` covering code-only, docs-only, test-only, UI, and ambiguous file sets (ambiguous ⇒ behaviorChanging) in `internal/sdd/detector_test.go`.
- [ ] T007 Implement `ClassifyBehavior(touchedFiles)` in `internal/sdd/detector.go` so T006 passes (file-path heuristic per research R4; fail-safe default).
- [ ] T008 Implement a pure `evaluateGate(record) GateDecision` in `cmd/forge/sdd_verification.go` handling only `exempt` and default-`pass` for now (deterministic; rules added in US2/US3).
- [ ] T009 Intercept the completion seam in `cmd/forge/handlers_sdd.go` (`applySddPhaseEvent` "complete"): assemble a `PhaseVerificationRecord` from the report-card diff + `ClassifyBehavior`, call `evaluateGate`, and only call `HandlePhaseComplete()` on `pass`/`exempt`; keep behavior green (no rules block yet).

**Checkpoint**: Classifier + deterministic gate scaffold in place; pipeline still passes everything (no regressions).

---

## Phase 3: User Story 1 — Deterministic Resume (Priority: P1) 🎯 MVP

**Goal**: Worktrees never nest; a reopened session re-attaches to the exact directory it left, or falls back to the main checkout with one message.

**Independent Test**: Provision a worktree twice → siblings not nested; restart → same dir; delete worktree → main checkout + one message. Maps to contract `deterministic-resume.md` C1–C5, SC-001/002/008.

### Tests for User Story 1 (write first, must FAIL)

- [ ] T010 [P] [US1] Write FAILING unit test for `git.MainCheckout` (fake runner returns ordered `worktree list --porcelain`; called from a linked worktree it still returns the main root) in `internal/git/worktree_test.go`.
- [ ] T011 [P] [US1] Write FAILING unit test for `assertNoNesting` (rejects any path already under `.forge/worktrees/`) in `cmd/forge/sdd_worktree_test.go`.
- [ ] T012 [P] [US1] Write FAILING integration test (build tag `integration`) provisioning a worktree twice against a real temp repo and asserting exactly one `.forge/worktrees/` level (siblings, never nested) in `cmd/forge/sdd_worktree_integration_test.go`.
- [ ] T013 [P] [US1] Write FAILING Playwright test: after restart the tab re-attaches to the same worktree dir; with the worktree deleted it lands on the main checkout with one fallback message — reading `window.term.buffer.active`, not the DOM — in `tests/e2e/sdd-tdd-enforcement.spec.js`.

### Implementation for User Story 1

- [ ] T014 [US1] Implement `MainCheckout(dir)` returning the first `git worktree list --porcelain` entry in `internal/git/worktree.go` (passes T010; research R1).
- [ ] T015 [US1] In `cmd/forge/sdd_worktree.go`, anchor `sddWorktreesRoot` via `MainCheckout` instead of `Toplevel`, and add `assertNoNesting` in `resolveSddWorkspace`/`provisionWorktreeForSession` (passes T011/T012; contract C1–C3).
- [ ] T016 [US1] Implement deterministic re-attach in `cmd/forge/sdd_resume.go`: record `boundDir`, validate against the live worktree list, fall back to `MainCheckout` with a single message when the recorded worktree is gone (passes T013; contract C5, FR-004).
- [ ] T017 [US1] Wire re-attach into `handleSddBind` in `cmd/forge/sdd_wiring.go` so a pure resume re-attaches and NEVER invokes provisioning (contract C4/C5, FR-005).

**Checkpoint**: US1 fully functional — the captured nesting bug is fixed and resume is deterministic. Shippable as MVP.

---

## Phase 4: User Story 2 — TDD Red→Green Gate (Priority: P1)

**Goal**: A behavior-changing phase cannot complete without a test observed failing then passing.

**Independent Test**: Behavior phase with no Red ⇒ block; Green-without-Red ⇒ block; Red-then-Green ⇒ pass; docs-only ⇒ exempt. Maps to contract `verification-gates.md` C2, SC-003.

### Tests for User Story 2 (write first, must FAIL)

- [ ] T018 [P] [US2] Write FAILING unit tests in `cmd/forge/sdd_verification_test.go` for the TDD rule: (a) behaviorChanging + no Red ⇒ block, (b) Green-without-prior-Red ⇒ block, (c) Red-then-Green ⇒ pass, (d) docs-only + exemptReason ⇒ exempt.

### Implementation for User Story 2

- [ ] T019 [US2] Implement a workflow-ledger reader in `cmd/forge/sdd_verification.go` that reads `.forge/workflow-ticket.json` and recognizes a `test-failed-first` (Red) observation alongside `tests-passed` (Green) (research R5).
- [ ] T020 [US2] Add the TDD rule to `evaluateGate` in `cmd/forge/sdd_verification.go`: `behaviorChanging && !exempt` requires `redObserved < greenObserved`, else `block` (passes T018; contract C2).
- [ ] T021 [US2] Surface Red/Green timestamps and exemption reason in the report card in `cmd/forge/sdd_report_card.go` (FR-010).

**Checkpoint**: US1 + US2 both work independently; behavior changes now require real Red→Green evidence.

---

## Phase 5: User Story 3 — Playwright UX Validation Gate (Priority: P1)

**Goal**: User-facing changes pass only on a real-UI Playwright result; grep/curl/200/compiles are rejected; tooling failure fails closed.

**Independent Test**: curl/200-only evidence ⇒ block; passing buffer-reading Playwright ⇒ pass; Playwright cannot launch ⇒ block. Maps to contract `verification-gates.md` C3, SC-004/005, FR-016.

### Tests for User Story 3 (write first, must FAIL)

- [ ] T022 [P] [US3] Write FAILING unit tests in `cmd/forge/sdd_verification_test.go`: userFacing with only curl/200 evidence ⇒ block; `uxResult.ran == false` ⇒ block (fail closed); `ran && passed` ⇒ pass.
- [ ] T023 [P] [US3] Write FAILING Playwright test in `tests/e2e/sdd-tdd-enforcement.spec.js`: a user-facing phase blocks without UX evidence and passes with a UX test that drives the UI and asserts on `window.term.buffer.active`.

### Implementation for User Story 3

- [ ] T024 [US3] Implement the UX-evidence reader in `cmd/forge/sdd_verification.go`: consume a Playwright result, reject non-UX evidence (text-search/HTTP/status/log/compile) per FR-013 (passes T022 partial).
- [ ] T025 [US3] Add the UX rule to `evaluateGate`: `userFacing` requires `ran && passed`; fail closed when `ran == false` (passes T022; contract C3, FR-016).
- [ ] T026 [US3] Extend `scripts/sdd-gate-check.ps1` to report a verification-blocked phase (fail-closed PreToolUse signal; never auto-pass).
- [ ] T027 [US3] Surface the UX result in `cmd/forge/sdd_report_card.go`, carry it through `frontend/src/hooks/useSddGate.js`, and render it in `frontend/src/components/SddDashboard.jsx` (FR-015).

**Checkpoint**: US1 + US2 + US3 work independently; user-facing changes require real UI proof.

---

## Phase 6: User Story 4 — Honest Failure & Determinism (Priority: P2)

**Goal**: A failed/un-run check never yields a complete phase; the same record always yields the same decision; any bypass is audited.

**Independent Test**: Forced failing check ⇒ phase stays open with output shown; same record evaluated twice ⇒ identical decision; bypass ⇒ pass + logged. Maps to contract C4/C5/C6, SC-006/007, FR-017–020.

### Tests for User Story 4 (write first, must FAIL)

- [ ] T028 [P] [US4] Write FAILING unit tests in `cmd/forge/sdd_verification_test.go`: a failed required check never yields `pass`/complete; identical `PhaseVerificationRecord` ⇒ identical `GateDecision` across repeated evaluation (determinism).
- [ ] T029 [P] [US4] Write FAILING unit test in `cmd/forge/sdd_verification_test.go`: an audited bypass (`FORGE_BYPASS` + reason) converts a `block` to `pass` and records the reason.

### Implementation for User Story 4

- [ ] T030 [US4] Ensure the `block` path in `cmd/forge/handlers_sdd.go` keeps the phase active and surfaces the actual failing output — no auto-advance (passes T028; FR-017/018).
- [ ] T031 [US4] Implement the audited bypass in `cmd/forge/sdd_verification.go`: read `FORGE_BYPASS`/`FORGE_BYPASS_REASON`, convert block→pass, append to `.forge/bypasses.log`, mark the record bypassed (passes T029; FR-020, contract C6).
- [ ] T032 [US4] Render the verification verdict (pass / blocked-needs-test / blocked-needs-UX / exempt / bypassed) in `frontend/src/components/SddDashboard.jsx` (Article XI: concise, within the existing card).
- [ ] T033 [P] [US4] Add a frontend unit test for the verification indicator in `frontend/src/components/SddDashboard.test.jsx`.

**Checkpoint**: All four stories independently functional; the pipeline is deterministic and honest.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Update `CHANGELOG.md` with the resume/nesting fix and the TDD + Playwright UX enforcement gates.
- [ ] T035 Run all six `quickstart.md` scenarios end-to-end via `./run-dev-clean.ps1` and record outcomes.
- [ ] T036 [P] Dogfood verification: confirm this feature's own commits carry `test-failed-first` → `tests-passed` ledger evidence (the gates pass on their own implementation).
- [ ] T037 Full suite green: `go test ./...`, `go test -tags=integration ./...`, `cd frontend && npx vitest run`, `npx playwright test tests/e2e/sdd-tdd-enforcement.spec.js`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **blocks US2, US3, US4**. Does **not** block US1.
- **US1 (Phase 3, P1)**: depends only on Setup — independent of Phase 2; can run in parallel with Foundational.
- **US2 (Phase 4, P1)** and **US3 (Phase 5, P1)**: depend on Foundational; independent of each other (both add rules to `evaluateGate` but in separate, ordered tasks — sequence T020 before T025 if worked by one developer to avoid edit overlap).
- **US4 (Phase 6, P2)**: depends on US2 + US3 (it asserts over the full rule set).
- **Polish (Phase 7)**: depends on all desired stories.

### Within Each Story

- The failing test(s) MUST be written and observed failing before the implementation task (this feature enforces exactly that).
- Types/readers before rules; rules before surfacing; backend before frontend wiring.

### Parallel Opportunities

- Setup: T002, T003, T004 in parallel.
- Foundational: T006 (test) parallel to nothing blocking; T005 before T008/T009.
- US1 tests T010/T011/T012/T013 all [P] (distinct files). Implementation T014→T015 ordered (same file area), T016/T017 follow.
- US1 can be developed entirely in parallel with Phase 2 by a second developer.
- US2 tests (T018) and US3 tests (T022/T023) can be written in parallel once Phase 2 is done.

---

## Parallel Example: User Story 1 tests

```text
# Write all four failing US1 tests together (distinct files):
Task: "FAILING unit test for git.MainCheckout in internal/git/worktree_test.go"          (T010)
Task: "FAILING unit test for assertNoNesting in cmd/forge/sdd_worktree_test.go"          (T011)
Task: "FAILING integration test no-nesting in cmd/forge/sdd_worktree_integration_test.go" (T012)
Task: "FAILING Playwright resume test in tests/e2e/sdd-tdd-enforcement.spec.js"           (T013)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 3 US1 (resume + no-nesting) → 3. **STOP and VALIDATE** against quickstart Scenario 1 & 2 → 4. Ship. This alone fixes the captured bug and restores reliable resume.

### Incremental Delivery

1. Setup → US1 (MVP, fixes resume) → ship.
2. Foundational → US2 (TDD gate) → ship.
3. US3 (Playwright UX gate) → ship.
4. US4 (honest failure + determinism) → ship.
Each increment adds enforcement without breaking the prior.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- Every behavior task is gated by its own failing test first (dogfooding Article V).
- Gates fail **closed**: a check that cannot run blocks; it never auto-passes.
- Never wildcard-kill processes during restart/cleanup tests — target specific PIDs (Article II).
- Commit after each task or logical group; record `test-failed-first`/`tests-passed` in the ledger as you go.
