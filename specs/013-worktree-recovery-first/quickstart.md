# Quickstart: Validating Recovery-First Worktrees

Runnable validation that proves the feature end-to-end. All UX validation runs against the dev
harness, never a built binary (Article V). Terminal assertions read `window.term.buffer.active`,
never the DOM (Article X).

## Prerequisites

- A clean throwaway git repo for the e2e run (the Playwright fixture provisions one).
- Dev harness launched via `run-dev-clean.ps1` (the Playwright config starts it).
- Go toolchain for the unit/integration layers.

## Scenario 1 — Opening tabs creates zero directories (SC-001, primary)

1. Start the app on a git project; note the active tab is on the main checkout.
2. Record the directory set under the project, including `.forge/worktrees/`.
3. Open 3 more tabs on the **same** project via real UI actions.
4. Read each tab's working directory from the terminal buffer.

**Expected**: all 4 tabs report the main-checkout directory; the recorded directory set is
**identical** before and after (zero worktrees created).

Run: `npx playwright test tests/e2e/worktree-recovery.spec.js -g "creates no directories"`

> Red→Green proof (FR-016): run the same test against the pre-fix build (`git stash` the fix or
> check out the parent commit) and confirm it **fails** (directory count increased / a tab landed
> in `.forge/worktrees/...`). This is the evidence specs/012 lacked.

## Scenario 2 — A reopened tab recovers to its prior directory (SC-002)

1. From a tab, explicitly create an isolated worktree (Scenario 4); confirm it moves into it.
2. Restart the app (or simulate the restart the fixture supports).
3. Reopen the tab.

**Expected**: the tab re-attaches to the **same** worktree directory (read from the buffer), with
no new or nested directory. A main-checkout tab likewise returns to the main checkout.

Run: `npx playwright test tests/e2e/worktree-recovery.spec.js -g "recovers prior directory"`

## Scenario 3 — A removed worktree falls back to main checkout (FR-005)

1. Create an isolated worktree tab; merge+remove that worktree out-of-band.
2. Reopen the tab.

**Expected**: the tab attaches to the main checkout and shows exactly one message that the prior
worktree no longer exists. No nested directory; no unrelated feature attached.

## Scenario 4 — Explicit per-tab opt-in creates exactly one worktree (SC-007)

1. With two tabs on the same project (both on the main checkout per Scenario 1), invoke
   "Isolate this tab / New isolated workspace" on one.

**Expected**: exactly one worktree under `MainCheckout/.forge/worktrees/<token>` (one level),
that tab moves into it and shows the isolation indicator, the other tab is unaffected, and a
binding record is persisted.

Run: `npx playwright test tests/e2e/worktree-recovery.spec.js -g "explicit opt-in"`

## Scenario 5 — Concurrent pipeline prompts, dismiss creates nothing (FR-003)

1. Start an SDD pipeline in tab A.
2. Start a concurrent SDD pipeline in tab B on the same checkout.

**Expected**: tab B shows a collision prompt offering isolation; **dismissing** it leaves both on
the shared checkout with zero worktrees created; **confirming** it creates exactly one (Scenario 4).

## Go layers (fast, mocked + real-git)

- Unit (`cmd/forge/sdd_worktree_test.go`, `sdd_binding_store_test.go`): two binds on one repo →
  zero `WorktreeAdd` calls; binding store load/save/evict; missing-worktree fallback. `<10 ms`.
- Integration (`cmd/forge/sdd_worktree_integration_test.go`): real `git worktree` on a temp repo —
  repeated binds create zero worktrees; one explicit request creates exactly one un-nested worktree;
  recovery re-attaches from the persisted record after clearing the in-memory map.

Run: `go test ./cmd/forge/...`

## Done = green, with recorded Red (FR-017)

The feature is complete only when Scenario 1's Playwright test passes **and** its prior failing
run against the old behavior is recorded. Code inspection, compilation, or HTTP-status are NOT
acceptance.
