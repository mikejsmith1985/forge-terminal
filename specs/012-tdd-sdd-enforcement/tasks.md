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

**Purpose**: Establish a green baseline, reconcile the cross-feature collision with 011, and create empty skeletons so later tasks only add behavior.

- [X] T038 Reconcile the 011 ↔ 012 collision on `cmd/forge/sdd_worktree.go`: **DECIDED** — 012's main-checkout anchoring + no-nesting fix lands first (it is the bug fix and is self-contained); feature 011's opt-in/default-to-main redesign rebases onto it. The anchoring change is additive (re-attach branch + helpers) and does not alter 011's concurrency-trigger semantics, minimizing the rebase surface. (Resolves analysis finding X1.)
- [X] T001 Confirmed green baseline: `go build ./cmd/forge/` clean, `go test ./...` 0 failures before changes.
- [~] T002 Skeleton `cmd/forge/sdd_resume.go` — **consolidated into `sdd_worktree.go`**: the re-attach logic is ~30 lines tightly coupled to `resolveSddWorkspace`; a separate file would be artificial separation (Article IV cohesion). No separate file created.
- [ ] T003 [P] Create skeleton `cmd/forge/sdd_verification.go` with a one-line file-purpose comment and package declaration only (no logic).
- [X] T004 Created `tests/e2e/sdd-tdd-enforcement.spec.js` with the US1 resume/no-nesting buffer-read tests (Article X); US2/US3 gate specs to be appended in those phases.

---

## Phase 2: Foundational (Verification Substrate)

**Purpose**: The shared verification core needed by US2, US3, and US4. (US1 is independent and may proceed in parallel with this phase — see Dependencies.)

**⚠️ CRITICAL**: US2/US3/US4 cannot begin until this phase is complete.

- [X] T005 Defined `gateDecision`, `phaseVerificationRecord`, `uxEvidence` and reused `sdd.BehaviorClassification` per data-model in `cmd/forge/sdd_verification.go`.
- [X] T006 [US-shared] FAILING-then-passing `TestClassifyBehavior` in `internal/sdd/detector_test.go` covering code-only, docs-only, test-only, frontend-UI, backend-alters-output ⇒ userFacing, ambiguous ⇒ both axes, and docs/refactor ⇒ classifier-set exemption.
- [X] T007 Implemented `ClassifyBehavior` in `internal/sdd/detector.go`: `userFacing` covers frontend AND backend user-visible-output paths; both axes fail safe; classifier is the sole author of `exemptReason`.
- [X] T008 Implemented pure `evaluateGate(record) gateDecision` in `cmd/forge/sdd_verification.go` (deterministic; exempt + bypass + TDD rule).
- [X] T009 Intercepted BOTH completion paths via `gatedHandlePhaseComplete` (in `handlers_sdd.go` and the `sdd_wiring.go` watcher fallback): assembles the record, calls `evaluateGate`, completes only on pass/exempt; transparent for empty-diff (no regressions).

**Checkpoint**: ✅ Classifier + deterministic gate in the live path; full suite + integration GREEN (gate transparent when there is nothing to verify).

---

## Phase 3: User Story 1 — Deterministic Resume (Priority: P1) 🎯 MVP

**Goal**: Worktrees never nest; a reopened session re-attaches to the exact directory it left, or falls back to the main checkout with one message.

**Independent Test**: Provision a worktree twice → siblings not nested; restart → same dir; delete worktree → main checkout + one message. Maps to contract `deterministic-resume.md` C1–C5, SC-001/002/008.

### Tests for User Story 1 (write first, must FAIL)

- [X] T010 [US1] FAILING-then-passing unit test `TestMainCheckout` (queried from inside a linked worktree it returns the main root; empty list → "") in `internal/git/worktree_test.go`.
- [X] T011 [US1] FAILING-then-passing unit tests `TestAssertNoNesting` + `TestResolveWorkspace_ReattachesExistingWorktree` in `cmd/forge/sdd_worktree_test.go`.
- [X] T012 [US1] FAILING-then-passing integration test `TestNoNesting_RealGit` (build tag `integration`): real git, MainCheckout stable across query dirs, re-bind re-attaches with no new/nested worktree, in `cmd/forge/sdd_worktree_integration_test.go`.
- [X] T013 [US1] Playwright `sdd-tdd-enforcement.spec.js`: asserts the rendered buffer never shows two `.forge/worktrees/` segments (SC-002) and resolves a cwd within budget — reading `window.term.buffer.active` (Article X). **Requires the live dev harness to execute; not run in this session.**

### Implementation for User Story 1

- [X] T014 [US1] Implemented `MainCheckout(dir)` = first `git worktree list --porcelain` entry in `internal/git/worktree.go` (research R1).
- [X] T015 [US1] In `cmd/forge/sdd_worktree.go`, anchored provisioning to `mainCheckoutOrFallback` (MainCheckout) instead of `Toplevel`, added `assertNoNesting` guard (contract C1–C3).
- [X] T016 [US1] Implemented deterministic re-attach (`reattachExistingWorktree`) in `cmd/forge/sdd_worktree.go`: a bind directory already inside `.forge/worktrees/` re-attaches with the main checkout resolved from the worktree list; provisions nothing (contract C5, FR-001/004/005).
- [X] T017 [US1] Verified `handleSddBind` (`sdd_wiring.go`) already routes the session's `currentDirectory` through `resolveSddWorkspace`; on restart the empty pipeline map lets re-attach fire. Pure resume never provisions (contract C4/C5, FR-005). No new wiring needed.

**Checkpoint**: ✅ US1 functional — captured nesting bug fixed, resume deterministic. Go unit + integration GREEN; ledger shows Red→Green. Shippable as MVP. (Playwright T013 authored; runs under the live harness.)

---

## Phase 4: User Story 2 — TDD Red→Green Gate (Priority: P1)

**Goal**: A behavior-changing phase cannot complete without a test observed failing then passing.

**Independent Test**: Behavior phase with no Red ⇒ block; Green-without-Red ⇒ block; Red-then-Green ⇒ pass; docs-only ⇒ exempt. Maps to contract `verification-gates.md` C2, SC-003.

### Tests for User Story 2 (write first, must FAIL)

- [X] T018 [US2] FAILING-then-passing `TestEvaluateGate_TDDRule` (no-Red ⇒ block, Green-without-Red ⇒ block, Red→Green ⇒ pass, docs ⇒ exempt) + `_Determinism` + `_AuditedBypass` in `cmd/forge/sdd_verification_test.go`.

### Implementation for User Story 2

- [X] T019 [US2] Implemented `readTddEvidence` in `cmd/forge/sdd_verification.go` reusing `internal/workflow.LoadTicket`; added `workflow.GateTestFailedFirst = "test-failed-first"` (Red) alongside `tests-passed` (Green) (research R5).
- [X] T020 [US2] Added the TDD rule to `evaluateGate`: `behaviorChanging && !exempt` requires `RedObserved` strictly before `GreenObserved`, else `block` (contract C2). Bypass converts block→pass (FR-020).
- [X] T021 [US2] Surfaced the verdict (decision + block/exempt reason + bypassed) as an additive `verification` field on the report card in `cmd/forge/sdd_report_card.go` (FR-010); omitempty so older clients ignore it.

**Checkpoint**: ✅ US1 + US2 work independently; behaviour changes now require real Red→Green evidence at phase completion. Ledger shows US2 Red→Green.

---

## Phase 5: User Story 3 — Playwright UX Validation Gate (Priority: P1)

**Goal**: User-facing changes pass only on a real-UI Playwright result; grep/curl/200/compiles are rejected; tooling failure fails closed.

**Independent Test**: curl/200-only evidence ⇒ block; passing buffer-reading Playwright ⇒ pass; Playwright cannot launch ⇒ block. Maps to contract `verification-gates.md` C3, SC-004/005, FR-016.

### Tests for User Story 3 (write first, must FAIL)

- [X] T022 [US3] FAILING-then-passing `TestEvaluateGate_UXRule` (no-UX ⇒ block; `ran==false` ⇒ block fail-closed; failed ⇒ block; `ran&&passed` ⇒ pass; non-user-facing ⇒ skip) in `cmd/forge/sdd_verification_test.go`.
- [~] T023 [US3] Playwright UX-gate scenario added to `tests/e2e/sdd-tdd-enforcement.spec.js` as `test.fixme` — the gate *logic* is proven by T022; the end-to-end rendered-verdict assertion requires the frontend verdict chip (US4/T032) + live harness, so it is marked pending to avoid a false pass.

### Implementation for User Story 3

- [X] T024 [US3] Implemented `readUXEvidence` in `cmd/forge/sdd_verification.go` reusing the workflow ledger (`workflow.GateUXValidated = "ux-validated"`): a recorded entry = a passing real-UI run; absence ⇒ nil. Non-UX evidence (curl/200/log) never produces the entry, so it is structurally rejected (FR-013).
- [X] T025 [US3] Added the UX rule to `evaluateGate`: `userFacing` requires `UXResult.Ran && Passed`; `nil`/`ran==false`/failed ⇒ block (fail closed, FR-016, contract C3). Wired `readUXEvidence` into `assembleVerificationRecord`.
- [~] T026 [US3] Deferred to the surfacing pass (US4): the blocked verdict is already broadcast to the dashboard via the report-card `verification` field; extending the PreToolUse `sdd-gate-check.ps1` is a secondary channel, folded into US4.
- [~] T027 [US3] Backend DONE — the UX block reason is surfaced on the report card `verification` field (decision + reason). Frontend rendering (`useSddGate.js` / `SddDashboard.jsx`) is US4/T032.

**Checkpoint**: ✅ US1 + US2 + US3 gate logic work; user-facing changes require a recorded passing Playwright result. Full suite + integration GREEN; ledger shows US3 Red→Green. (Frontend verdict chip + E2E rendered-verdict assertion land in US4.)

---

## Phase 6: User Story 4 — Honest Failure & Determinism (Priority: P2)

**Goal**: A failed/un-run check never yields a complete phase; the same record always yields the same decision; any bypass is audited.

**Independent Test**: Forced failing check ⇒ phase stays open with output shown; same record evaluated twice ⇒ identical decision; bypass ⇒ pass + logged. Maps to contract C4/C5/C6, SC-006/007, FR-017–020.

### Tests for User Story 4 (write first, must FAIL)

- [X] T028 [US4] `TestEvaluateGate_Determinism` (identical record ⇒ identical decision across repeated evaluation) in `cmd/forge/sdd_verification_test.go` (done in US2).
- [X] T029 [US4] `TestEvaluateGate_AuditedBypass` (`FORGE_BYPASS` converts block→pass) in `cmd/forge/sdd_verification_test.go` (done in US2).

### Implementation for User Story 4

- [X] T030 [US4] The `block` path keeps the phase active: `gatedHandlePhaseComplete` returns BEFORE `HandlePhaseComplete`, so no auto-advance; the block reason is logged and surfaced. The new `TestPhaseVerificationView_SurfacesBlockReason` proves the reason is projected for the developer (FR-017/018).
- [X] T031 [US4] Audited bypass implemented in `cmd/forge/sdd_verification.go` (`readAuditedBypass` reads `FORGE_BYPASS`/`FORGE_BYPASS_REASON`; `evaluateGate` converts block→pass; record marked bypassed and surfaced) (done in US2; FR-020, contract C6).
- [X] T032 [US4] `VerificationChip` renders the verdict (blocked-with-reason / bypassed / exempt; nothing on a plain pass) in `frontend/src/components/SddDashboard.jsx`, fed by `verification` carried through `frontend/src/hooks/useSddGate.js` from the `SDD_PHASE_STATUS` envelope (`sddPhaseStatusEnvelope.Verification` via `phaseVerificationView`). CSS added (Article XI: concise, in the header).
- [X] T033 [US4] 5 vitest cases for the verdict chip in `frontend/src/components/SddDashboard.test.jsx` (block reason shown, UX reason verbatim, no chip on pass, no chip on null, bypass surfaced).

**Checkpoint**: ✅ All four stories functional. The pipeline is deterministic, honest (blocks surface their reason), and the developer SEES why a phase is stuck. Go + frontend + integration GREEN.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Update `CHANGELOG.md` with the resume/nesting fix and the TDD + Playwright UX enforcement gates.
- [ ] T035 Run all six `quickstart.md` scenarios end-to-end via `./run-dev-clean.ps1` and record outcomes.
- [ ] T036 [P] Dogfood verification: confirm this feature's own commits carry `test-failed-first` → `tests-passed` ledger evidence (the gates pass on their own implementation).
- [ ] T037 Full suite green: `go test ./...`, `go test -tags=integration ./...`, `cd frontend && npx vitest run`, `npx playwright test tests/e2e/sdd-tdd-enforcement.spec.js`.
- [ ] T039 [P] Add a lint/check that terminal-output e2e tests use the shared buffer-reading fixture (`window.term.buffer.active`) rather than DOM assertions, surfacing any bypass as a reviewable violation in `tests/e2e/` (resolves analysis finding U1, enforces FR-014's buffer-read trust boundary).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **blocks US2, US3, US4**. Does **not** block US1.
- **US1 (Phase 3, P1)**: depends only on Setup — independent of Phase 2; can run in parallel with Foundational. **T038 (011↔012 merge-order reconciliation) MUST precede T014/T015**, since both features edit `resolveSddWorkspace`.
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
- **Task count**: 39 (T001–T039). T038 (coordination, executes first in Setup) and T039 (buffer-fixture lint, Polish) were added during `/speckit-analyze` remediation to resolve findings X1 and U1.
