# Implementation Plan: Automated Worktrees for Concurrent Same-Repo Pipelines

**Branch**: `011-worktree-concurrency` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-worktree-concurrency/spec.md`

## Summary

Let a developer run two or more SDD pipelines in the **same repository at once** without the pipelines corrupting each other. The fix reuses git's own isolation primitive — a **git worktree** — rather than building a custom isolation layer. When a second terminal session binds to a repository that already has an active pipeline (lazy detection at the existing `POST /api/sdd/bind` seam), the backend provisions a worktree under `.forge/worktrees/`, retargets that session's shell into it via the proven per-PTY `cd` injection, and points the session's `pipeline.repoRoot` at the worktree path. Because every specs/010 subsystem (artifact watcher, `captureWorkTree` baseline, `activeSddFeatureDir`) is already `repoRoot`-parameterized, isolation falls out for free: each worktree has its own working tree, its own `.specify/feature.json`, and its own change-detection window. Worktrees auto-clean only when provably safe (branch merged + tree clean) on tab close and a startup sweep; anything unmerged is kept with a warning. `git worktree list` is the durable registry, so worktrees survive restarts.

## Technical Context

**Language/Version**: Go (backend: `cmd/forge`, `internal/terminal`, `internal/sdd`, `internal/git` or reuse existing); JavaScript/React (frontend: `frontend/src`).

**Primary Dependencies**: existing only — the `git` CLI (worktree/branch/merge-base plumbing), the in-repo SDD orchestrator and per-session pipeline model (specs/010), the ConPTY/Unix PTY working-dir injection (`startPTYWithShell`), the macro-write + PTY-quiet path (`injectSddCommand`/`waitForPTYQuiet`), the artifact watcher (`tutor.Watcher`), and the React tab/dashboard components. No new runtime libraries (Framework-First, Article VII).

**Storage**: git itself is the durable worktree registry (`git worktree list --porcelain`); in-memory `sync.Map` for the session↔worktree binding (rebuilt on bind/restart, mirroring `sddPipelines`). No new persisted store.

**Testing**: Go unit (mocked git runner, <10 ms) + Go integration (real `git worktree` against a temp repo) + Playwright UX via `run-dev-clean.ps1` reading the xterm.js buffer model.

**Target Platform**: Windows 11 desktop (primary; ConPTY `cd` injection); Unix path kept correct (`cmd.Dir` / `cd`).

**Project Type**: Desktop application (Go backend + React frontend in a web/Electron shell).

**Performance Goals**: a concurrent isolated pipeline is ready to use ≤5 s after the tab opens (SC-004 — worktree add + branch + `cd` injection within that budget).

**Constraints**: localhost-only, no new auth; retrofit-in-place (extend the per-session pipeline model, do not fork it, FR-015); the worktree directory must stay out of the user's git status (FR-016 — `.forge/` is already gitignored, `.gitignore:55`); never destroy unmerged work (FR-012); never wildcard-kill processes (Article II).

**Scale/Scope**: a handful of concurrent worktrees per repo (one per extra tab); small data volumes; single local developer.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| I — Prime Directive (BEST route) | Reuses git worktree (the durable, correct isolation primitive) instead of a bespoke state-partition hack; retrofits the tested per-session model. | PASS |
| II — Process Protection | No process kills introduced; worktree removal targets specific paths/branches, never wildcard process termination. | PASS (enforced in tasks) |
| III — Branching | Worktrees check out `feature/<spec-dir-name>` branches and reintegrate via PR; this feature itself is on `feature/011-worktree-concurrency`. | PASS |
| IV — Code Quality | Self-documenting names, file purpose comments, functions <40 lines, guard clauses; a thin `git` wrapper with doc comments. | PASS (enforced in tasks) |
| V — Testing (three-layer) | Unit mocked git <10 ms; integration real `git worktree` on a temp repo; UX Playwright via `run-dev-clean.ps1`; Red→Green→Refactor. | PASS |
| VI — Documentation | CHANGELOG.md updated in the PR; no auxiliary status docs (this `specs/011/` tree is the exempt pipeline artifact). | PASS |
| VII — Framework-First | Git worktree provides isolation; ConPTY injection provides shell retargeting; the existing watcher/report/orchestrator provide state. Only the orchestration glue is new — justification in research.md (R1). | PASS |
| VIII — Release | Local pipeline only (`scripts/local-release.ps1`); never GitHub Actions. | PASS |
| IX — Vault Zero-Knowledge | No secrets involved. | N/A |
| X — Verification & Proof | UX proof reads the xterm.js buffer model; integration tests assert real worktree existence/branch/merge state on disk. | PASS |
| XI — Output/Dashboard Restraint | Reuses the single sanctioned report-card surface plus a small per-tab binding indicator; no new dashboard files; no phase-name narration. | PASS |

**No violations** → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/011-worktree-concurrency/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R7
├── data-model.md        # Phase 1 — entities & state transitions
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   ├── worktree-provisioning.md   # bind-time concurrency detection + provisioning contract
│   └── worktree-lifecycle.md      # cleanup, restart discovery, and status surface contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root) — touch points

```text
cmd/forge/
├── sdd_worktree.go      # NEW — concurrency detection + provisioning + cleanup orchestration
│                        #   (provisionWorktreeIfConcurrent, retargetSessionShell, safeCleanupWorktree,
│                        #    sweepWorktreesOnStartup); the only substantial new file
├── sdd_wiring.go        # handleSddBind: detect same-repo concurrency, provision + bind repoRoot=worktree;
│                        #   add worktree path to sddPipeline; cleanup hook on session close
├── handlers_sdd.go      # expose per-tab binding (worktree path + branch) in status envelope (FR-007)
└── main.go              # (no new public route; provisioning is internal to bind)

internal/git/            # NEW small package (or internal/worktree) — thin `git` wrapper
└── worktree.go          # WorktreeAdd/List/Remove, BranchMerged, IsClean, GitCommonDir, Toplevel
│                        #   modeled on the exec.Command("git", …) patterns already in the repo

internal/terminal/
├── handler.go           # surface a session-close signal (WS disconnect) to the cleanup hook
└── session.go           # reuse forgeSessionEnv / cd-injection; expose a "cd into dir" helper if needed

frontend/src/
├── App.jsx              # bind effect already sends {sessionId, repoRoot}; consume returned binding
├── hooks/useSddGate.js  # carry worktree/branch binding from status into UI state
└── components/
    ├── SddDashboard.jsx       # render "worktree: <branch>" binding indicator per tab (FR-007)
    └── TabBar.jsx             # optional: small worktree badge on the tab

scripts/                 # (none required — provisioning is backend-internal)
```

**Structure Decision**: Web/desktop split (Go backend + React frontend). Almost all change retrofits existing files; the two genuinely new units are `cmd/forge/sdd_worktree.go` (orchestration glue) and a thin `internal/git/worktree.go` wrapper. No new packages beyond the git wrapper, consistent with retrofit-in-place and Framework-First.

## Implementation Sequencing (for /speckit-tasks)

Ordered by the spec's priorities and risk:

1. **Git worktree wrapper (foundation, highest reuse)** — `internal/git/worktree.go`: add/list/remove, branch-merged, clean-check, common-dir/toplevel, all over a mockable runner. Unit-tested with a fake runner; integration-tested against a real temp repo. Everything else depends on this.
2. **Concurrency detection + provisioning (US1 / P1)** — in `handleSddBind`, group sessions by git common-dir; the first keeps the main checkout (FR-005), a second triggers `provisionWorktreeIfConcurrent`; retarget the shell via `cd` injection; bind `pipeline.repoRoot` = worktree path. This is the MVP and must prove out before the rest.
3. **Branch lifecycle (US1)** — provisional branch at provisioning → reconcile to `feature/<spec-dir-name>` when `/speckit-specify` creates the feature dir (learned via existing `activeSddFeatureDir`/phase-event). Idempotent re-bind for an already-provisioned feature (FR-009/FR-010).
4. **Per-pipeline report isolation (US2 / P2)** — verify (mostly free): `captureWorkTree(worktreePath)` already scopes the diff. Add tests proving zero cross-attribution; surface the binding indicator (FR-007).
5. **Lifecycle: cleanup + restart discovery (US3 / P3)** — safe-only cleanup on session-close and a startup sweep (`branch --merged` + `status --porcelain`); keep-and-warn on unmerged (FR-011/FR-012); rebuild bindings from `git worktree list` on restart (FR-013).
6. **Resilience & edges** — dirty primary checkout untouched (FR-008 — inherent to worktrees), provisioning failure degrades safely (FR-014), non-git dir falls back to single pipeline, concurrency cap (deferred default: no hard cap, bounded by resources — log if one is later added).

## Complexity Tracking

No constitution violations — section intentionally empty.
