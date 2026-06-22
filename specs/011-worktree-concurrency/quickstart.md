# Quickstart & Validation: Automated Worktrees for Concurrent Same-Repo Pipelines

Evidence-based scenarios that prove the feature end-to-end. Per Article V, UX runs via `run-dev-clean.ps1` (dev server `:9999`) with real browser events; per Article X, terminal assertions read `window.term.buffer.active`, and worktree assertions read real git state on disk. Per Article II, any dev restart targets a specific PID — never a `forge*` wildcard.

## Prerequisites

- A throwaway git repo with at least one commit (the integration tests create one in a temp dir).
- Dev server from this branch: `.\scripts\run-dev-clean.ps1` (do NOT build the binary for UX tests).
- `git` on PATH.

## Layer 1 — Go unit (mocked git, <10 ms)

Run: `go -C C:\ProjectsWin\forge-terminal test ./internal/git/... ./cmd/forge/...`

Prove without touching a real repo (fake git runner):
- Concurrency detection: two bindings with the same `gitCommonDir` ⇒ the second is flagged isolated; the first stays on the main checkout (FR-001/FR-005).
- Branch reconciliation: provisional `forge/wt-…` renames to `feature/<spec-dir>` once a feature dir is known; an already-provisioned feature re-binds, no duplicate (FR-009/FR-010).
- Safe-cleanup predicate: merged+clean ⇒ remove; not-merged OR dirty ⇒ retain+warn (FR-011/FR-012).
- Degrade-safe: a failing `worktree add` leaves the other session's pipeline untouched (FR-014).

## Layer 2 — Go integration (real `git worktree`, temp repo)

Run: `go -C C:\ProjectsWin\forge-terminal test -run Worktree -tags integration ./cmd/forge/...`

Against a real temp repo:
1. **Provision**: bind session A (main), then session B on the same repo ⇒ assert `.forge/worktrees/<id>/` exists, is on its own branch, and `git status` of the main checkout is unchanged (FR-002/FR-008/FR-016).
2. **Isolation**: write a file in B's worktree ⇒ `captureWorkTree`/`diff` for A shows nothing of B's change; each `.specify/feature.json` is a distinct file (FR-003/FR-006).
3. **Safe cleanup**: merge B's branch into base, clean tree ⇒ sweep removes worktree + branch, `git worktree list` no longer lists it (FR-011). Repeat with an uncommitted file ⇒ worktree retained, warning emitted (FR-012).
4. **Restart discovery**: provision, drop the in-memory map, re-enumerate `git worktree list` ⇒ the worktree is rediscovered and re-bindable (FR-013).

## Layer 3 — Playwright UX (`run-dev-clean.ps1`, real events)

Run: `npx playwright test tests/e2e/worktree-concurrency.spec.js`

End-to-end in the real app on one repo:
1. **US1**: open tab A on a repo and start a pipeline; open tab B on the **same** repo. Assert (reading `window.term.buffer.active`) that B's shell prompt is now inside `.forge/worktrees/…`, and tab A's reported phase state is unchanged when B writes an artifact (SC-001).
2. **US2**: drive A and B each to a gate after editing distinct files; assert each report card lists exactly its own files, none of the sibling's (SC-003). A no-op phase reads "No files changed".
3. **US3**: assert each tab shows its `worktree: <branch>` binding indicator (FR-007); close B after merging ⇒ its worktree is gone; close B with unmerged work ⇒ indicator persists with a warning (SC-005).
4. **SC-007 regression**: open a single tab on a fresh repo ⇒ **no** worktree, no badge, no new prompt — single-pipeline behavior byte-for-byte unchanged.

## Success thresholds (from spec Success Criteria)

| Scenario | Threshold |
|---|---|
| Concurrent isolation (no cross-effect) | 100% (SC-001) |
| Zero manual setup commands | 0 commands (SC-002) |
| Per-pipeline report accuracy | exact file set, 100% (SC-003) |
| Ready-to-work latency | ≤5 s after tab open (SC-004) |
| No orphans; unmerged preserved+warned | 100% (SC-005) |
| Restart re-discovery | 100% (SC-006) |
| Single-pipeline unchanged | no new step/prompt/worktree (SC-007) |
