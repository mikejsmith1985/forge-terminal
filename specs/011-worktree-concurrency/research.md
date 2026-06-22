# Phase 0 Research: Automated Worktrees for Concurrent Same-Repo Pipelines

All Technical Context unknowns are resolved below. Each decision records the choice, rationale, and the alternatives rejected. References are to the existing codebase mapped during planning.

## R1 — Isolation primitive: git worktree (Framework-First, Article VII)

**Decision**: Use `git worktree` to give each concurrent same-repo pipeline its own working directory on its own branch, sharing the one `.git`.

**Rationale**: The root cause verified in the prior investigation is three *shared substrates*: one `.specify/feature.json` pointer, two watchers seeing one tree, and a repo-wide git diff window. A git worktree is precisely a second working tree with independent tracked-file copies and an independent branch — it eliminates all three at the filesystem level. Critically, every specs/010 subsystem already takes `repoRoot` as a parameter (`tutor.NewWatcher(repoRoot…)`, `captureWorkTree(repoRoot)`, `activeSddFeatureDir(repoRoot)` reading `<repoRoot>/.specify/feature.json`), so pointing `pipeline.repoRoot` at the worktree path isolates them with no logic rewrite.

**Alternatives considered**:
- *Separate clones per pipeline* — heavier (full object duplication), slower to provision (violates SC-004), and divergent history; rejected.
- *In-process virtual state partition* (keep one tree, namespace state in memory) — does not isolate the on-disk `.specify/feature.json` or the git diff window; this is the very approach that failed for 10+ releases; rejected.
- *Sparse/partial checkouts* — solve file-overlap but not the single-branch/single-feature-pointer conflict; rejected.

## R2 — Concurrency detection seam: bind-time, grouped by git common-dir

**Decision**: Detect concurrency in `handleSddBind` (`cmd/forge/sdd_wiring.go`). Group existing pipelines by `git rev-parse --git-common-dir`. The first session bound for a common-dir keeps the repository's main checkout (FR-005); a subsequent session for the *same* common-dir triggers worktree provisioning.

**Rationale**: The bind seam already exists and already carries `{sessionId, repoRoot}` from `App.jsx` on tab activation. Common-dir (not toplevel path) is the correct grouping key because all worktrees of a repo share one common-dir, so it reliably answers "is another pipeline already live in this logical repository?" without being fooled by path-casing or a worktree's own toplevel.

**Alternatives considered**:
- *Provision at first phase-event (`/speckit-specify` start)* — too late: specify would already be executing in the main checkout before we could retarget; rejected.
- *Provision at tab creation* — the WebSocket/tab-creation path has no knowledge of SDD concurrency; would force isolation on the single-pipeline case, violating FR-005/SC-007; rejected.
- *Group by toplevel path string* — brittle across separators/casing and confused once a worktree exists; rejected in favor of common-dir.

## R3 — Shell retargeting: PTY `cd` injection on quiet

**Decision**: After provisioning, move the session's already-running shell into the worktree by injecting a `cd <worktree>` (PowerShell `Set-Location`, bash `cd`, cmd `cd /d`) through the existing per-PTY write path, gated on PTY-quiet detection so the command lands at an idle prompt.

**Rationale**: The shell is spawned in the main checkout at session creation (`startPTYWithShell(... workingDir ...)`) and is already live by bind time; there is no post-creation cwd API. The repo already injects working-dir `cd` commands per shell (`pty_windows.go` `Set-Location`/`cd`/`cd /d`) and already has `waitForPTYQuiet` + `writeMacro` (`injectSddCommand`). Reusing that path is the proven, framework-first mechanism and keeps Windows/Unix parity.

**Alternatives considered**:
- *Respawn the shell in the worktree* — destroys the user's scrollback/session and any running process; unacceptable UX; rejected.
- *Rely on the user to cd manually* — violates FR-002 (zero manual setup); rejected.

**Note**: Once the shell cd's in, the terminal's tracked cwd updates to the worktree path, so subsequent `App.jsx` binds send the worktree path and idempotently match `pipeline.repoRoot` — the flow is self-consistent after the first retarget.

## R4 — Branch lifecycle: provisional branch → reconcile to `feature/<spec-dir-name>`

**Decision**: At provisioning, create the worktree on a deterministic **provisional** branch derived from the session (e.g., `forge/wt-<short-session-id>`), because the feature name is not yet known at bind time. When `/speckit-specify` later creates `specs/NNN-<name>` in the worktree (observed via the existing `activeSddFeatureDir` read / phase-event), rename the branch to `feature/NNN-<name>` (the Clarifications decision). An already-provisioned feature re-binds to the existing worktree instead of creating a duplicate (FR-009).

**Rationale**: Provisioning must precede `/speckit-specify` (so specify runs in the worktree), but the spec-dir name only exists *after* specify. A provisional branch bridges the gap deterministically; the rename is a local, safe operation on a branch only this worktree holds. The final name honours the `feature/<spec-dir-name>` convention and slots into GitHub Flow (Article III).

**Alternatives considered**:
- *Detached HEAD until specify* — worktrees on detached HEAD complicate later branch creation and status; a named provisional branch is cleaner; rejected.
- *Prompt for the branch name* — rejected in Clarifications (Q3) in favour of auto-derivation.

## R5 — Cleanup: safe-only, on session-close and startup sweep

**Decision**: Evaluate cleanup when a session closes (WebSocket disconnect) and during a startup sweep. Remove the worktree (`git worktree remove` + delete the branch) **only when provably safe**: the branch is fully merged into its base (`git branch --merged <base>` contains it, or `git merge-base --is-ancestor`) **and** the working tree is clean (`git status --porcelain` empty). Otherwise retain it and emit a warning (FR-012).

**Rationale**: Q4 decided safe-only auto-cleanup. The two checks together guarantee the only thing ever auto-removed is work that has already landed, so cleanup can never lose data, while merged worktrees never accumulate. `git status --porcelain` is already used in `handlers_dashboard.go`; `branch --merged`/`merge-base` are standard.

**Alternatives considered**:
- *Eager removal on close unless dirty* — risks deleting committed-but-unmerged branch work; rejected.
- *Manual-only cleanup* — accumulates clutter, fails FR-011; rejected.

## R6 — Registry & restart discovery: `git worktree list` is the source of truth

**Decision**: Treat `git worktree list --porcelain` (filtered to paths under `.forge/worktrees/`) as the authoritative registry. On startup, enumerate it to re-discover existing worktrees; the in-memory session↔worktree map (mirroring `sddPipelines`) is rebuilt as tabs re-bind to those paths.

**Rationale**: Git already persists worktree metadata durably and atomically; a parallel hand-maintained registry would risk drift (the classic inferred-vs-reported bug). FR-013 (re-discover after restart) is satisfied by reading git's own record. The worktree path encodes the feature, so a re-discovered worktree is re-bindable when a tab reconnects to it.

**Alternatives considered**:
- *Custom JSON registry under `.forge/`* — duplicates git's truth and can desync; rejected (only a tiny in-memory map is kept, derived from git).

## R7 — Location & git-status invisibility: `.forge/worktrees/<id>/`

**Decision**: Provision worktrees under `<mainRepoRoot>/.forge/worktrees/<feature-or-provisional-id>/`. No `.gitignore` edit is required — `.forge/` is already ignored (`.gitignore:55`) and already created on demand by existing code (`internal/workflow/ticket.go`).

**Rationale**: One known, enumerable, already-ignored location satisfies FR-016 (never appears in the user's git status) and FR-013 (single path to scan) at zero extra cost. Keeping worktrees under the repo means they travel and clean up with it.

**Alternatives considered**:
- *Sibling directory* (`../repo-worktrees/`) — pristine repo dir but discovery must track an external path and cleanup can orphan across moves; rejected.
- *User Forge state dir* (`~/.forge/worktrees/<hash>/`) — centralized but decouples worktrees from the repo they belong to, complicating per-repo enumeration; rejected.

## Open / deferred (non-blocking)

- **Concurrency cap** (spec "Outstanding"): default to *no hard cap, bounded by resources*. If a cap proves necessary, add it with a `log()` of the rejection rather than silently failing. Not required for any user story.
- **Base-branch determination for merge checks**: default base = the branch the main checkout was on at provisioning time (captured then), falling back to the repo's default branch. Finalized in data-model state transitions.
