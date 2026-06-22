---
description: "Task list for Automated Worktrees for Concurrent Same-Repo Pipelines"
---

# Tasks: Automated Worktrees for Concurrent Same-Repo Pipelines

**Input**: Design documents from `specs/011-worktree-concurrency/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R7), data-model.md, contracts/ (provisioning, lifecycle)

**Tests**: REQUIRED — Constitution Article V mandates Red→Green→Refactor (failing test before implementation). Unit tests mock the git runner and run <10 ms; integration tests use a real `git worktree` against a temp repo; UX uses Playwright via `run-dev-clean.ps1`.

**Organization**: Tasks are grouped by user story. US1 (P1) is the MVP; US2/US3 build on it but each is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 for user-story phases only

## Path Conventions

Web/desktop split: Go backend in `cmd/forge/`, `internal/git/`, `internal/terminal/`; React frontend in `frontend/src/`; Playwright in `tests/e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The mockable git seam and test scaffolding everything else builds on.

- [X] T001 Create `internal/git` package with a mockable command runner (a `Runner` interface plus a real `execRunner` over `exec.Command("git", …)`, modeled on `internal/tutor/changes.go` and `cmd/forge/sdd_report_card.go`) in `internal/git/runner.go`, with a file-purpose comment per Article IV.
- [X] T002 [P] Add a temp-git-repo test helper (init a repo with one commit, return its path) in `internal/git/worktree_integration_test.go` (co-located under the `integration` build tag) for the integration tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The thin `git worktree` wrapper. Every user story depends on it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Write FAILING unit tests (mocked runner) for the worktree wrapper API in `internal/git/worktree_test.go`: `GitCommonDir`, `Toplevel`, `WorktreeAdd`, `WorktreeList` (parses `--porcelain`), `WorktreeRemove`, `BranchMerged`, `IsClean`, `BranchRename`. Assert command strings and parsed results. (Red)
- [X] T004 Implement `internal/git/worktree.go` to green: `GitCommonDir`/`Toplevel` (`rev-parse --git-common-dir` / `--show-toplevel`), `WorktreeAdd(path, branch, base)` (`worktree add <path> -b <branch> <base>`), `WorktreeList` (`worktree list --porcelain` parse), `WorktreeRemove`, `BranchMerged(branch, base)` (`branch --merged <base>`, output-driven — strips `*`/`+` markers), `IsClean(dir)` (`status --porcelain` empty), `BranchRename`, `BranchDelete`, `IsGitRepo`, `CurrentBranch`. Each exported func carries a doc comment; functions <40 lines. (Green)
- [X] T005 [P] Write integration test (real git, build tag `integration`) in `internal/git/worktree_integration_test.go`: add → list → remove against the temp repo; merged/clean predicates; assert on-disk worktree state. (Caught the `+`-marker worktree-branch parsing bug.)

**Checkpoint**: Git wrapper proven against both a mock and a real repo — user stories can begin.

---

## Phase 3: User Story 1 - Start a second pipeline in the same repo without collision (Priority: P1) 🎯 MVP

**Goal**: A second tab on the same repo is automatically given an isolated worktree, its shell retargeted into it, and its pipeline scoped there — with zero manual steps and the first pipeline untouched.

**Independent Test**: Bind session A (main checkout), then session B on the same repo; assert a worktree exists under `.forge/worktrees/` on its own branch, B's `pipeline.repoRoot` is that path, and A's pipeline state/`.specify/feature.json`/main working tree are unchanged.

### Tests for User Story 1 (write FIRST, ensure they FAIL) ⚠️

- [X] T006 [P] [US1] Unit test for concurrency detection + provisioning decision (mocked git) in `cmd/forge/sdd_worktree_test.go`: same `gitCommonDir` ⇒ 2nd session isolated, 1st stays main (FR-001/FR-005); non-git dir ⇒ no isolation (FR-014); a failing `WorktreeAdd` degrades safely (FR-014); branch reconciliation + token sanitization. (Green)
- [X] T007 [P] [US1] Integration test (real git, temp repo) for provisioning in `cmd/forge/sdd_worktree_integration_test.go`: concurrent bind ⇒ `.forge/worktrees/<id>/` exists on its own branch, the main checkout stays clean (FR-002/FR-008/FR-016). (Green)

### Implementation for User Story 1

- [X] T008 [US1] Extend `sddPipeline` with the worktree binding fields (`worktreePath`, `branch`, `baseBranch`, `gitCommonDir`, `isIsolated`) in `cmd/forge/sdd_wiring.go` (data-model).
- [X] T009 [US1] Implement concurrency detection + provisioning (`resolveSddWorkspace`, `sddHasConcurrentPipeline`, `provisionWorktreeForSession`) in `cmd/forge/sdd_worktree.go`: group by `GitCommonDir`; first → main checkout (FR-005); concurrent → `WorktreeAdd` under `.forge/worktrees/<token>` on `forge/wt-<token>` from the captured base branch (R4/R7); degrade safe on failure (FR-014).
- [X] T010 [US1] Implement `retargetSessionShell` in `cmd/forge/sdd_worktree.go`: inject `cd <worktreePath>` via the existing `injectSddCommand`/`waitForPTYQuiet` path, best-effort (R3, FR-004).
- [X] T011 [US1] Wire provisioning into `handleSddBind`/`startSddPipeline` in `cmd/forge/sdd_wiring.go`: detect concurrency, provision, start the pipeline with `repoRoot = worktreePath` so the existing watcher/baseline/feature-read isolate (FR-002/FR-003).
- [X] T012 [US1] Implement branch reconciliation (`reconcileWorktreeBranch`) in `cmd/forge/sdd_worktree.go`, hooked into `handleSddPhaseEvent`: rename `forge/wt-…` → `feature/<spec-dir-name>` when the feature dir is known; isolated re-bind is idempotent (FR-009/FR-010).
- [X] T013 [US1] Return additive bind-response fields (`isolated`, `worktreePath`, `branch`) via `sddBindResponse` in `cmd/forge/sdd_wiring.go` (contract: worktree-provisioning).

**Checkpoint**: Two same-repo tabs run isolated pipelines; the MVP is functional and independently testable.

---

## Phase 4: User Story 2 - Each pipeline reports only its own work (Priority: P2)

**Goal**: Each concurrent pipeline's report card shows exactly its own files/scope/decisions, and each tab can see which worktree/branch it is bound to.

**Independent Test**: Drive two worktree-backed pipelines to a gate after editing distinct files; assert each report card lists only its own files (correct +/- counts, no overlap); a no-op phase reads "No files changed".

### Tests for User Story 2 (write FIRST) ⚠️

- [X] T014 [P] [US2] Integration test in `cmd/forge/sdd_worktree_integration_test.go` (`TestReportScoping_TwoWorktreesNoCrossAttribution`): two real worktrees with distinct edits ⇒ each `captureWorkTree`/`diffWorkTrees` returns only that worktree's files; no cross-attribution (FR-006/SC-003). (Green)
- [X] T015 [P] [US2] Unit test for the status-envelope `binding` block in `cmd/forge/sdd_worktree_test.go` (`TestHandleSddStatus_IncludesBinding`): isolated session reports `isolated:true` + branch; main session reports `isolated:false` (FR-007/SC-007). (Green)

### Implementation for User Story 2

- [X] T016 [US2] Hardened report scoping in `cmd/forge/sdd_report_card.go`: `buildSddPhaseReportCardForPipeline` documents that all git snapshots are scoped to `pipeline.repoRoot` (= worktree when isolated) and must never fall back to a main-checkout path (FR-006).
- [X] T017 [US2] Added the `binding` block (`isolated`, `worktreePath`, `branch`, `baseBranch`) via `sddBindingInfo`/`sddBindingInfoFor` to the status response (`handlers_sdd.go`) and the `SDD_PHASE_STATUS` broadcast (`sdd_wiring.go`) (FR-007).

**Checkpoint**: Reports are provably per-pipeline; the binding is observable by the frontend.

---

## Phase 5: User Story 3 - See, resume, and clean up isolated pipelines (Priority: P3)

**Goal**: Worktrees auto-clean only when provably safe (merged + clean), unmerged work is retained with a warning, worktrees survive restart, and each tab shows its binding.

**Independent Test**: Provision worktrees; merge one and leave one dirty; trigger cleanup and a simulated restart; assert merged+clean is removed, dirty is retained+warned, and surviving worktrees are rediscovered and re-bindable.

### Tests for User Story 3 (write FIRST) ⚠️

- [X] T018 [P] [US3] Unit tests for the safe-cleanup predicate (mocked git) in `cmd/forge/sdd_worktree_test.go`: merged && clean ⇒ remove + `branch -d`; not-merged OR dirty ⇒ retain + warn; non-isolated ⇒ no-op (FR-011/FR-012). (Green)
- [X] T019 [P] [US3] Integration tests in `cmd/forge/sdd_worktree_integration_test.go`: merged+clean ⇒ `safeCleanupWorktree` removes worktree+branch (gone from disk); uncommitted file ⇒ retained+warn; re-enumerate `WorktreeList` ⇒ worktree rediscovered (FR-011/FR-012/FR-013). (Green)

### Implementation for User Story 3

- [X] T020 [US3] Implemented `safeCleanupWorktree` in `cmd/forge/sdd_worktree.go`: `IsClean(path) && BranchMerged(branch, base)` ⇒ `WorktreeRemove` + `BranchDelete` + drop binding; else retain and return a warning (FR-011/FR-012).
- [X] T021 [US3] Implemented the **explicit** tab-close trigger as `POST /api/sdd/worktree-close` (`handleSddWorktreeClose`, registered in `main.go`) calling `cleanupSessionWorktree`. **Design change from the task:** a WebSocket disconnect is deliberately NOT used — Forge supports reconnection, so a dropped socket must never tear down a worktree a reconnecting tab still uses. The frontend calls this on real tab close (frontend wiring tracked with T023–T026); the startup sweep (T022) guarantees no permanent orphans regardless.
- [X] T022 [US3] Implemented `sweepWorktreesOnStartup`/`sweepOneWorktree` in `cmd/forge/sdd_worktree.go` (enumerate `WorktreeList`, filter to `.forge/worktrees/`, skip bound worktrees via `isWorktreeBound`, evaluate the safe predicate, FR-013); triggered on the first (main-checkout) bind per repo in `startSddPipeline` (a cold start has no repo list, so first-bind is the correct, repo-scoped trigger).
- [ ] T023 [US3] Carry the `binding` block from the status message into hook state in `frontend/src/hooks/useSddGate.js`. *(Frontend — needs dev server to verify.)*
- [ ] T024 [US3] Render a concise `worktree: <branch>` indicator (and nothing when `isolated:false`, preserving SC-007) in `frontend/src/components/SddDashboard.jsx`; call `POST /api/sdd/worktree-close` on tab close. *(Frontend.)*
- [ ] T025 [P] [US3] Frontend test for the indicator (shows branch when isolated; hidden on the main-checkout case) in `frontend/src/components/SddDashboard.test.jsx`. *(Frontend.)*
- [ ] T026 [P] [US3] Optional: small worktree badge on the tab in `frontend/src/components/TabBar.jsx`. *(Frontend.)*

**Checkpoint**: All three user stories are independently functional; lifecycle is safe and restart-durable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T027 [P] Playwright e2e in `tests/e2e/worktree-concurrency.spec.js`: US1 isolation (B's prompt inside `.forge/worktrees/…` via `window.term.buffer.active`; A unaffected), US2 per-pipeline report cards, US3 binding indicator + cleanup, and the **SC-007 regression** (single tab ⇒ no worktree/badge/prompt). Real events only (Article V/X).
- [X] T028 [P] Updated `CHANGELOG.md` under `[Unreleased]` describing automated worktrees for concurrent same-repo pipelines.
- [X] T029 Edge: non-git working directory falls back to a single pipeline (FR-014) — guard in `resolveSddWorkspace`, covered by `TestResolveWorkspace_NonGitDirIsNotIsolated`.
- [ ] T030 Edge: provisioning never disturbs a dirty primary checkout (FR-008) — partially covered (`TestResolveWorkspace_ProvisionsRealWorktree` asserts the main checkout stays clean); a pre-existing-dirty assertion is still worth adding. Concurrency cap remains deferred (default: no cap).
- [X] T031 [P] Code-quality pass across new files: file-purpose comments, doc comments on exported funcs, functions <40 lines, guard clauses, `is/has` booleans (Article IV); `gofmt` clean, `go vet` clean.
- [ ] T032 Run `quickstart.md` validation (all three layers) and record evidence; confirm SC-001…SC-007 thresholds.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **BLOCKS all user stories** (the git wrapper).
- **US1 (P3)** → depends on Foundational. The MVP.
- **US2 (P4)** → depends on Foundational; builds on US1's worktree bindings but is independently testable (report scoping + status block).
- **US3 (P5)** → depends on Foundational; consumes US1 bindings + US2 status block but each cleanup/restart/UI slice is independently testable.
- **Polish (P6)** → after the desired stories.

### Within Each User Story

- Failing tests FIRST (Red), then implementation (Green), then refactor.
- Backend binding/model before services; services before the status surface; backend status before frontend consumption.

### Parallel Opportunities

- T002 ∥ (T001 first). T005 ∥ other Phase-2 follow-ups once T004 lands.
- US1 tests T006 ∥ T007 (different files) before T008–T013.
- US2 tests T014 ∥ T015. US3 tests T018 ∥ T019; frontend T025 ∥ T026.
- Polish T027 ∥ T028 ∥ T031.
- With capacity, after Foundational: one developer per story (US1→US2→US3 share files in `sdd_worktree.go`, so coordinate that file).

---

## Parallel Example: User Story 1

```bash
# Write the failing tests together (different files):
Task: "Unit test concurrency detection in cmd/forge/sdd_worktree_test.go"        # T006
Task: "Integration test provisioning in cmd/forge/sdd_worktree_integration_test.go"  # T007
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational (git wrapper, CRITICAL) → 3. Phase 3 US1.
4. **STOP and VALIDATE**: two same-repo tabs run isolated, the first untouched (SC-001/SC-002/SC-007).
5. Demo the MVP.

### Incremental Delivery

- US1 → isolation works (MVP). US2 → trustworthy per-pipeline reports. US3 → lifecycle hygiene + restart durability + visible binding. Each ships without breaking the prior.

---

## Notes

- [P] = different files, no incomplete-task dependency. Most new backend logic lands in `cmd/forge/sdd_worktree.go`, so non-[P] tasks touching it are serialized.
- The biggest reuse win: pointing `pipeline.repoRoot` at the worktree makes the entire specs/010 machinery isolate — verify, don't rebuild (T016).
- The biggest risk: live-shell `cd` retargeting (T010) depends on PTY-quiet timing — cover it in both the integration test and the e2e.
- Article II: any dev restart during validation targets a specific PID; never a `forge*` wildcard.
- Commit after each task or logical group; update CHANGELOG in the PR (Article VI).
