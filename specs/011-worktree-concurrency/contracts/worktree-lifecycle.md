# Contract: Worktree Lifecycle (cleanup, restart discovery, status surface)

Covers safe-only cleanup (R5), restart re-discovery (R6), and the per-tab binding indicator (FR-007). All behavior is backend-internal plus additive status fields; no new public route.

## Cleanup triggers

Cleanup is **evaluated**, never assumed. Two triggers:

1. **Session close** — when a terminal session's WebSocket disconnects (`internal/terminal/handler.go` lifecycle), evaluate that session's worktree (if isolated).
2. **Startup sweep** — on backend start, enumerate `git worktree list --porcelain` filtered to `.forge/worktrees/` and evaluate each.

## Safe-cleanup predicate (both triggers)

A worktree is removed **only if BOTH hold** (R5, FR-011):

- **Merged**: its branch is fully contained in `baseBranch` — `git merge-base --is-ancestor <branch> <baseBranch>` succeeds (or the branch appears in `git branch --merged <baseBranch>`).
- **Clean**: `git -C <worktreePath> status --porcelain` is empty (no uncommitted/untracked changes).

| Outcome | Action |
|---|---|
| Merged AND clean | `git worktree remove <path>` → `git branch -d <branch>` → drop in-memory binding. No orphan dir or branch remains. (FR-011) |
| Not merged OR not clean | **Retain** the worktree; emit a warning surfaced to the user; keep the binding discoverable. (FR-012) |
| `baseBranch` unknown (e.g., after restart with no recorded base) | Fall back to the repo default branch for the merge check; if still indeterminate, **retain + warn** (never remove on uncertainty). |

## Restart discovery (FR-013)

- On startup, `git worktree list --porcelain` is the authoritative registry (R6). Each `.forge/worktrees/` entry is retained and becomes re-bindable when a tab next binds to that path.
- No fabricated bindings: a worktree with no live tab simply persists until a future safe sweep removes it (once merged+clean) or a tab re-adopts it.

## Status surface (FR-007)

Extend the existing SDD status/gate envelope (`handleSddStatus` / `SDD_PHASE_STATUS`) with additive fields so the frontend can show the binding:

```json
{
  "sessionId": "tab-…",
  "binding": { "isolated": true, "worktreePath": "…/.forge/worktrees/011-…", "branch": "feature/011-worktree-concurrency", "baseBranch": "main" }
}
```

- `isolated:false` (or absent `binding`) → the tab is on the main checkout; the UI shows no worktree badge (single-pipeline case unchanged, SC-007).
- `isolated:true` → the UI shows a concise `worktree: <branch>` indicator on the tab/dashboard.

## Invariants (assertable in tests)

- A worktree with uncommitted changes is **never** auto-removed (FR-012).
- After cleanup of a merged+clean worktree, neither the directory nor the branch exists, and `git worktree list` no longer lists it.
- After a simulated restart (re-enumerate), every still-present `.forge/worktrees/` worktree is reported and re-bindable (FR-013).
- The status envelope reports `isolated:false` for the first/main session and `isolated:true` with the correct branch for concurrent sessions (FR-007).
