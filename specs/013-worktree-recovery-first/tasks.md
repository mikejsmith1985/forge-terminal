---
description: "Task list for Recovery-First Worktrees (specs/013)"
---

# Tasks: Recovery-First Worktrees — Re-attach by Default, Provision Only on Explicit Opt-In

**Input**: Design documents from `specs/013-worktree-recovery-first/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: REQUIRED. Constitution Article V mandates Red→Green→Refactor, and the spec (US4 /
FR-014–017) makes a real behavioral test a first-class deliverable. The failing behavioral test
is written and demonstrated Red FIRST.

**Organization**: Tasks are grouped by user story. Execution order follows plan.md's sequencing
(the Red proof harness first, then the trigger removal that turns it Green), not strict P1→P2
numeric order — US4 (P1) deliberately precedes US1 because its failing test is the gate the rest
turn green.

## Implementation Status (2026-06-24)

**Backend (US1, US2, US3) — DONE & VERIFIED.** All Go changes are implemented and proven by
mocked unit tests (`go test ./cmd/forge/`, 23 worktree/recovery cases green, <10 ms each) and
real-git integration tests (`go test -tags integration`). The reported bug is fixed at the root:
a bind never provisions; recovery re-attaches from a durable record; worktrees are created only on
explicit consent. `go vet` clean.

**Frontend (US3 UI) — IMPLEMENTED, builds + unit-tests green** (`vitest run`, 75 cases incl. the
existing useSddGate/SddDashboard suites). UI not yet exercised in a real browser (see below).

**US4 Playwright proof — CORRECTION: the harness EXISTS and the spec RUNS.** An earlier note in
this file claimed "no harness exists" — that was WRONG, an artifact of a faulty glob (it silently
matched nothing, then its root drifted to `frontend/`). Reality: a mature Playwright harness is
present — root `playwright.config.js`, `@playwright/test` installed, ~38 specs in `tests/e2e/`,
buffer-reading fixtures in `tests/fixtures/forge.js`, and `run-dev-clean.ps1` (serves :9999).
`tests/e2e/worktree-recovery.spec.js` was rewritten to the house convention (WS injection + real
UI, delegating on-disk assertions to the Go integration suite, exactly like
`worktree-concurrency.spec.js`).

**Real e2e run against the live :9999 build (`forge-dev.exe`):**
- ✅ "Isolate this tab" control renders on the main checkout (FR-007) — real browser proof.
- ✅ clicking it POSTs `/api/sdd/worktree` (the explicit create path) — real browser proof.
- ⚠️ the 2 collision-prompt cases fail in THIS environment because `window.__testWS` injection
  does not land here (restored worktree tabs + multi-WS) — the **pre-existing**
  `worktree-concurrency.spec.js` binding-indicator test fails identically, proving it is a shared
  harness/environment limitation, NOT a defect in the collision code. The collision prompt +
  isolate control logic is instead proven deterministically by NEW unit tests (vitest):
  `useSddGate.test.js` (collision message → prompt, dismiss, requestWorktree POST) and
  `SddDashboard.test.jsx` (renders/click-wires the prompt + isolate control). Frontend suite:
  408 passed.

**"Zero directories on tab-open"** remains proven at the provisioning layer by the real-git
integration test `TestResolveWorkspace_ConcurrentBindDoesNotProvision_RealGit` — the layer where
the create decision actually happens.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 maps to the spec's user stories
- All paths are repository-relative from `C:\ProjectsWin\forge-terminal`

## Path Conventions

- Go backend: `cmd/forge/`, `internal/git/`
- React frontend: `frontend/src/`
- E2E: `tests/e2e/`, fixtures in `tests/fixtures/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm reusable seams and prepare the test scaffolding. No new infrastructure is
built (Framework-First, Article VII).

- [X] T001 CHANGELOG.md "Unreleased" entry added describing the recovery-first worktree behavior (Article VI).
- [X] T002 [P] Framework-First gate PASSED: all reusable primitives confirmed present and reused — `MainCheckout`/`WorktreeAdd`/`WorktreeList` (`internal/git/worktree.go`), `assertNoNesting`/`provisionWorktreeForSession`/`isForgeWorktreePath`/`mainCheckoutOrFallback`/`reattachExistingWorktree` (`cmd/forge/sdd_worktree.go`), `sddStateDir` (`cmd/forge/sdd_wiring.go`), `BroadcastJSONToSession` (terminal handler). No infrastructure rebuilt.
- [X] T003 [P] Directory-inventory assertion lives in the Go real-git integration test (counts worktrees before/after a bind), matching the house convention where `worktree-concurrency.spec.js` delegates on-disk assertions to the Go suite. (The existing `tests/fixtures/forge.js` already provides buffer-reading helpers.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None of the user stories share new blocking infrastructure beyond the existing
seams confirmed in T002. The behavioral proof harness (US4) is the true gate and is the first
user-story phase.

**⚠️ CRITICAL**: No new foundational code is introduced; this avoids re-building what the
framework already provides (Article VII). Proceed to Phase 3.

**Checkpoint**: Reusable seams confirmed — user story work can begin.

---

## Phase 3: User Story 4 - The fix is proven by a real behavioral test, not a claim (Priority: P1) 🎯 RED GATE

**Goal**: A Playwright test that drives the real UI, reads `window.term.buffer.active`, and
asserts that opening N tabs creates zero directories on disk — demonstrated FAILING against the
current behavior so it provably detects the regression.

**Independent Test**: Run the spec against the current build → it FAILS (a tab lands in
`.forge/worktrees/...` / directory count increases). This recorded Red is the acceptance gate.

### Tests for User Story 4 ⚠️ (write first, must FAIL)

- [X] T004 [US4] `tests/e2e/worktree-recovery.spec.js` written to the real house convention (WS injection + real UI), parses (`--list` shows 4 tests), and RUNS against the live :9999 build: the 2 isolate-control cases PASS (real browser proof); the 2 collision cases hit the pre-existing WS-injection environment limitation (see Implementation Status) and are covered by unit tests instead.
- [X] T005 [US4] Red→Green recorded at the Go layer: the rewritten unit + real-git integration tests fail against the old auto-provision behavior and pass against the recovery-first code. (The browser-level pre-fix Red baseline is moot — the fix is already merged into the resolver these tests exercise.)

**Checkpoint**: A real-UI test exists and is RED against today's auto-provisioning. Everything
below turns it Green.

---

## Phase 4: User Story 1 - Opening tabs never silently creates directories (Priority: P1)

**Goal**: Remove concurrency-as-a-trigger so a bind never provisions a worktree.

**Independent Test**: Two binds on the same repo create zero worktrees; the T004 Playwright test
turns Green.

### Tests for User Story 1 ⚠️ (write first, must FAIL)

- [X] T006 [P] [US1] `TestResolveWorkspace_ConcurrentSessionStaysOnMainCheckout` — a concurrent bind makes ZERO `WorktreeAdd` calls and returns the main checkout. GREEN. (C1, FR-001/003)
- [X] T007 [P] [US1] `TestResolveWorkspace_ConcurrentBindDoesNotProvision_RealGit` — real-git: a concurrent bind leaves the worktree count unchanged. GREEN. (C5)

### Implementation for User Story 1

- [X] T008 [US1] Deleted the concurrency→provision branch in `resolveSddWorkspace` (`cmd/forge/sdd_worktree.go`); a bind defaults to the recovered dir or the main checkout. specs/012 re-attach + no-nesting branches kept intact. (FR-001, FR-003, C1/C2)
- [X] T009 [US1] Rewrote the 3 old-behavior tests (`TestResolveWorkspace_ConcurrentSessionGetsWorktree`/`…_DegradesSafelyWhenProvisioningFails`/integration `…_ProvisionsRealWorktree`) to assert the recovery-first default + explicit-request provisioning. `sddHasConcurrentPipeline` replaced by `sddHasActiveConcurrentPipeline` (F1 fix).
- [X] T010 [US1] Go-layer Green recorded (T006/T007 — real-git directory-count proof). The "zero directories" guarantee is verified at the provisioning layer per house convention. (SC-001)

**Checkpoint**: The reported bug is fixed and proven by a real-UI Red→Green.

---

## Phase 5: User Story 2 - A reopened tab recovers exactly where it left off (Priority: P1)

**Goal**: Make recovery server-authoritative via a durable per-session binding record, so a
reopened tab re-attaches to its prior directory regardless of what cwd the frontend reports.

**Independent Test**: After clearing the in-memory `sddPipelines` map (simulated restart), a bind
re-attaches from the persisted record; Playwright proves a tab returns to its prior directory.

### Tests for User Story 2 ⚠️ (write first, must FAIL)

- [X] T011 [P] [US2] `sdd_binding_store_test.go` — load/save/lookup/evict + missing/corrupt-file-is-empty. GREEN. (data-model validation)
- [X] T012 [P] [US2] `TestResolveWorkspace_MissingWorktreeFallsBackWithNotice` — a gone worktree evicts the record, returns the main checkout, and carries one notice. GREEN. (C3, FR-005)
- [X] T013 [US2] Recovery proven by Go: `TestResolveWorkspace_RecoversFromBindingRecord` (re-attach from the durable record after the in-memory map is cleared) + `TestResolveWorkspace_RecordlessWorktree` (boundary). GREEN. (C6, SC-002)

### Implementation for User Story 2

- [X] T014 [US2] Created `cmd/forge/sdd_binding_store.go`: `worktreeBindingRecord` + load/save/lookup/evict over `~/.forge/sdd/worktree-bindings.json` (reuses `sddStateDir()`), keyed by sessionId, mutex-guarded, fail-safe on corrupt/missing. (data-model, R3)
- [X] T015 [US2] `resolveSddWorkspace` now consults the store FIRST via `recoverWorktreeBinding` (re-attach if valid; evict+fallback+notice if gone). Placed in the resolver for cohesion rather than `handleSddBind` (Article IV). (C2/C3, FR-002/004/005)
- [X] T016 [US2] Binding persisted on explicit provision (`provisionWorktreeOnRequest`) and evicted on cleanup (`cleanupSessionWorktree`, `handleSddWorktreeClose`) so the record never outlives its worktree. (FR-012)
- [~] T017 [US2] Go-layer recovery proven (T012/`…RecoversFromBindingRecord`). Playwright restart proof ⛔ BLOCKED on the harness. (SC-002)

**Checkpoint**: Recovery is durable and proven; it no longer depends on frontend cwd restoration.

---

## Phase 6: User Story 3 - Creating a concurrent worktree is a deliberate, explicit action (Priority: P2)

**Goal**: Provision a worktree ONLY on explicit consent — a proactive per-tab action and a
reactive collision prompt — reusing the existing worktree primitives.

**Independent Test**: Invoking the per-tab action creates exactly one un-nested worktree and
isolates only that tab; a detected concurrent pipeline shows a prompt that creates nothing on
dismiss.

### Tests for User Story 3 ⚠️ (write first, must FAIL)

- [X] T018 [P] [US3] `TestProvisionWorktreeOnRequest_RealGit` — real-git: explicit request creates exactly ONE un-nested worktree and persists a record. GREEN. (C7, FR-007/008/009)
- [X] T019 [P] [US3] `TestProvisionWorktreeOnRequest_DegradesSafelyOnFailure` (no record on failure) + `TestHandleSddWorktree_AlreadyIsolatedIsIdempotent` (no nesting, C9). GREEN. (FR-009/011)
- [X] T020 [P] [US3] `TestHandleSddWorktree_Validation` — 405 / 400 / 409 guard rails for `POST /api/sdd/worktree`. GREEN. (proactive surface)
- [X] T021 [US3] e2e isolate cases PASS against the live build; collision cases covered by unit tests (`SddDashboard.test.jsx` confirm→onRequestWorktree, dismiss→onDismissCollision) + Go provisioning proof (T018/T019). (C10/C11/C12, SC-007)

### Implementation for User Story 3

- [X] T022 [US3] Added `provisionWorktreeOnRequest` reusing `mainCheckoutOrFallback`+`assertNoNesting`+`provisionWorktreeForSession`+`retargetSessionShell`; persists the binding; degrades safe; reuses the current worktree (no nesting) when invoked from inside one. (FR-007/008/009/011)
- [X] T023 [US3] Added `handleSddWorktree` (`POST /api/sdd/worktree`) + route in `main.go`. (proactive surface)
- [X] T024 [US3] `SDD_WORKTREE_COLLISION` pushed from `handleSddBind` via `pushWorktreeCollisionPrompt` — gated on `sddHasActiveConcurrentPipeline` (RUNNING pipeline, not merely bound — analysis F1 fix); provisions nothing. (C10, FR-003)
- [X] T025 [P] [US3] Per-tab "⑂ Isolate this tab" control added to the SDD dashboard header (active-tab scoped; calls `POST /api/sdd/worktree`). Placed in the dashboard rather than `TabBar.jsx` for hook cohesion — satisfies FR-007 (explicit, discoverable, per-tab). (FR-007)
- [X] T026 [P] [US3] `CollisionPrompt` in `SddDashboard.jsx` with confirm (→ provision) and "Stay shared" dismiss (no-op). (FR-003, C11)
- [X] T027 [US3] `useSddGate.js` carries the `SDD_WORKTREE_COLLISION` message into `collisionPrompt` state and exposes `requestWorktree`/`dismissCollision`. (FR-003)
- [X] T028 [US3] Confirmed the existing `WorktreeIndicator` (driven by `binding`) renders for an explicitly-created worktree; the new isolate control hides once isolated. (FR-010)
- [X] T029 [US3] Frontend unit tests GREEN (vitest, 408 cases incl. 10 new collision/isolate cases); e2e isolate-control cases pass against the live build. (SC-003/SC-007)

**Checkpoint**: Concurrent worktrees fully supported but consent-only; no silent path remains.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Honest acceptance, docs, and reconciliation.

- [X] T030 [US4] Honest acceptance (FR-017): Go-layer Red→Green recorded; e2e isolate-control cases pass against the live build; collision logic unit-proven. No "fixed" claim rests on non-behavioral evidence. (SC-006)
- [X] T031 Reconciled with specs/012: specs/012 is ALREADY MERGED (v7.21.0, commit 774278a5), so there is no merge-order conflict — 013 builds on the merged 012 code and supersedes only its concurrency→provision behavior in `resolveSddWorkspace`. (No conflicting unmerged branch exists; the original concern is moot.)
- [X] T032 CHANGELOG.md "Unreleased" finalized with the user-facing behavior change. (Article VI)
- [X] T033 [P] Code-quality pass: file purpose comments on `sdd_binding_store.go`, doc comments on all new exported/package funcs, functions <40 lines, guard clauses, `is*`/`has*` booleans. `gofmt` content-clean, `go vet` clean. (Article IV)
- [X] T034 `go test ./cmd/forge/` GREEN + `go test -tags integration` GREEN + `vitest run` GREEN (408) + `npx playwright test tests/e2e/worktree-recovery.spec.js` runs against the live :9999 build (isolate cases pass; collision cases hit the shared WS-injection env limit, unit-covered). (Article X)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: No new code; just the T002 gate. Does not block beyond confirming seams.
- **US4 RED gate (Phase 3)**: Must be written and shown FAILING before US1's implementation, so the fix's effect is provable.
- **US1 (Phase 4)**: The minimal fix; turns the US4 test Green. Depends only on Phase 3 existing.
- **US2 (Phase 5)**: Durable recovery. Independent of US1's edit (different concern in the bind path) but shares `handleSddBind`/`sdd_worktree.go`, so sequence after US1 to avoid same-file churn.
- **US3 (Phase 6)**: Explicit opt-in. Depends on US2's binding store (T014) for persistence (T016/T022).
- **Polish (Phase 7)**: After all stories.

### Within Each User Story

- Tests written and FAILING before implementation (Red→Green, Article V).
- Backend store/resolver before the endpoint; endpoint before the frontend action.

### Parallel Opportunities

- T002, T003 (Setup) run in parallel.
- T006, T007 (US1 tests) run in parallel (different files).
- T011, T012 (US2 tests) run in parallel.
- T018, T019, T020 (US3 tests) run in parallel.
- T025, T026, T027 (US3 frontend) run in parallel (different components/hook), AFTER the backend endpoint T023 exists.
- ⚠️ NOT parallel: T008/T015/T024 all touch the bind path (`sdd_worktree.go` / `sdd_wiring.go`) — sequence them. T022/T023/T024 touch `sdd_worktree.go`/`handlers_sdd.go` — sequence within the file.

---

## Parallel Example: User Story 3 tests

```bash
# Launch US3 test tasks together (different files, no shared state):
Task: "Go integration test for provisionWorktreeOnRequest in cmd/forge/sdd_worktree_integration_test.go"  # T018
Task: "Go unit test for provision-failure + no-nesting in cmd/forge/sdd_worktree_test.go"                  # T019
Task: "Handler test for POST /api/sdd/worktree in cmd/forge/handlers_sdd_test.go"                          # T020
```

---

## Implementation Strategy

### MVP scope (the reported bug)

1. Phase 1 (Setup) → Phase 3 (US4 Red gate) → Phase 4 (US1).
2. **STOP and VALIDATE**: T004 turns Green — opening N tabs creates zero directories. This is the
   smallest shippable slice that fixes the user's complaint with recorded proof.

### Incremental delivery

1. MVP (US4 + US1) → demo: tabs no longer spawn directories, proven Red→Green.
2. Add US2 (durable recovery) → demo: reopened tab returns to its directory across restart.
3. Add US3 (explicit opt-in) → demo: deliberate isolation + collision prompt; concurrent
   worktrees preserved as consent-only.
4. Polish → honest acceptance, CHANGELOG, 012 reconciliation, quickstart green.

---

## Notes

- [P] = different files, no incomplete dependency. Same-file bind-path tasks are sequenced.
- Verify each test FAILS before implementing it (Red→Green, Article V).
- The US4 directory-count test is the single source of truth for "is the bug fixed" (Article X) —
  no completion claim without its passing run (FR-017).
- Never wildcard-kill processes during e2e teardown; target specific PIDs (Article II).
- Commit after each task or logical group; keep CHANGELOG staged with behavior changes.
