# Contract: Recovery-First Binding

A *behavioral* contract over existing internal seams (`handleSddBind`, `resolveSddWorkspace`,
`startSddPipeline`) plus the new `WorktreeBindingRecord` store. It defines what a tab bind MUST
and MUST NOT do. Verified by Go unit/integration tests and the Playwright recovery spec.

## C1 — A bind never provisions a worktree

**Given** any tab binds (`POST /api/sdd/bind {sessionId, repoRoot}`)
**When** `resolveSddWorkspace` resolves the workspace
**Then** it MUST NOT call `provisionWorktreeForSession` or `WorktreeAdd`, regardless of how many
other pipelines run in the same repo.
*(FR-001, FR-003. The concurrency→provision branch is removed.)*

## C2 — Default attach is the recovered directory, else the main checkout

**Given** a bind for `sessionId`
**When** the workspace resolves
**Then** the effective directory is, in priority order:
1. the `WorktreeBindingRecord.worktreePath` for `sessionId` **if** it is a valid git worktree
   (recovery), else
2. the directory the session is already sitting in **if** it is a valid forge worktree
   (re-attach, specs/012 behavior retained), else
3. the repository main checkout (`MainCheckout`, fallback to `repoRoot`).
*(FR-002, FR-004, FR-005.)*

## C3 — A missing recorded worktree falls back to main checkout with one message

**Given** a `WorktreeBindingRecord` exists for `sessionId` but its `worktreePath` is gone or not
a valid worktree
**When** the bind resolves
**Then** the record is evicted, the session attaches to the main checkout, and exactly one clear
message is surfaced ("the worktree for this tab no longer exists…"). No new or nested directory
is created and no unrelated feature is attached.
*(FR-005.)*

## C4 — Recovery requires no manual cd

**Given** a recovered or re-attached session
**When** the bind completes
**Then** Resume/Continue operate against the resolved directory with no manual `cd`; if the
session is already in that directory, the shell is NOT retargeted.
*(FR-006.)*

## C5 — N binds → zero directories (the headline guarantee)

**Given** a repo with one active pipeline
**When** N additional tabs bind to the same repo
**Then** the count of directories under the repo (including `.forge/worktrees/`) is unchanged and
all N+1 tabs report the main checkout (or their own recovered worktree).
*(FR-001, SC-001. Proven by the Playwright directory-count test, demonstrated Red→Green.)*

## C6 — The binding store is the recovery authority

**Given** an isolated worktree was created for `sessionId`
**When** the app restarts (the in-memory `sddPipelines` map is empty)
**Then** the `WorktreeBindingRecord` on disk still maps `sessionId → worktreePath`, so the next
bind re-attaches deterministically — recovery does NOT depend on the frontend re-reporting the
worktree cwd.
*(FR-002, FR-004, SC-002.)*
