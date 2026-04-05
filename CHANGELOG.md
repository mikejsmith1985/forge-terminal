# Changelog — ToolBox

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [5.2.1] - 2026-04-05

### Added
- **Code Tutor Change Wizard**: When Code Tutor opens with an active session, it now auto-detects recently changed files via `git diff` and enters a focused wizard mode instead of dumping the user into a 770-file list. The wizard shows: step indicator (`Step N of M` with progress dots), the changed file with `+`/`-` diff counts, a colorized unified diff view, and an auto-generated "What changed & why" explanation — no button click required. Users can move through changed files with "Got it, next →" / "Back" / "Skip", or exit to browse mode at any time
- **`GET /api/tutor/recent-changes`**: New endpoint returns recently changed files with unified diff text. Detection priority: uncommitted changes first (`git diff HEAD`), then last commit (`git diff HEAD~1..HEAD`). Returns `ChangeSet{files, source, detectedAt}`
- **`POST /api/tutor/explain-change`**: New endpoint generates a diff-aware explanation focused on *what changed and why* rather than a generic file description. Sections: What Changed, Why It Changed, Key Concepts, Impact & Connections
- **`internal/tutor/changes.go`**: New package file implementing `DetectRecentChanges()` with git subprocess integration, per-file diff extraction (capped at 8KB), and graceful fallback when git is unavailable
- **`ExplainChange()` on `Explainer`**: New method that builds a diff-grounded prompt and caches by diff hash (not file hash), so re-explanations fire on new changes
- **Enterprise workflow initialized** with Forge Terminal Workflow Architect
- 6 new Go tests for session detach/reattach lifecycle (`session_reconnect_test.go`)
- **PR Review Strategy** (`internal/review/`, `cmd/forge/handlers_review.go`): Configurable PR review system with 4 strategies — Manual, Code Tutor, Quality Agent, Tutor+Agent. Quality Agent uses LLM model chain to produce structured findings (naming, complexity, tests, architecture, security) with 0–100 quality score
- **WorkflowWizard PR Review Step**: New step 3 in the 5-step Enterprise Workflow Architect wizard lets users choose their PR review strategy, configure auto-trigger, CHANGELOG gate, agent strictness, and focus areas
- **PRReviewPanel component** (`frontend/src/components/PRReviewPanel.jsx`): Full quality review results UI with score gauge, severity badges, collapsible finding cards, and filter tabs
- **usePRReview hook** (`frontend/src/hooks/usePRReview.js`): React hook for submitting diffs to `/api/review/analyze` and managing report state
- **Copilot Coding Agent Setup module** (`ModuleCopilotAgentSetup`): New workflow module that generates `.github/copilot/setup-steps.yml` — pre-installs project dependencies in the GitHub Copilot coding agent environment before it writes code or runs tests. Template is project-type-aware (Go, Node, Python, Rust, Java, .NET, generic)
- **Code Tutor notification toast action button**: File-change notification toasts now include an **"Open Tutor"** button that opens the Code Tutor panel directly. Previously the toasts appeared but had no clickable action
- **Runtime gate enforcement hooks**: New `commit-msg` and `pre-push` git hooks plus enhanced `pre-commit` hook — physically enforces 6 of 10 workflow gates via git hooks instead of relying on LLM compliance alone
  - **Pre-commit: main branch block** (Gate 2) — commits to `main`/`master` are rejected
  - **Pre-commit: test file gate** (Gate 4) — new source files must have corresponding test files
  - **Pre-commit: CHANGELOG violation** (Gate 7) — upgraded from warning to blocking violation
  - **Commit-msg hook** (Gate 9) — validates `type: description` format (feat, fix, chore, docs, test, refactor, perf)
  - **Pre-push hook** (Gates 5/6) — runs full Go build + test suite and frontend Vitest before allowing push
- **Compliance scanner: test coverage check** (`scanTestCoverage`): New compliance rule scans for source files missing corresponding test files
- **Compliance scanner: commit message format** (`scanCommitMessageFormat`): New compliance rule checks recent commit messages against conventional format
- 17 new Go tests for runtime gate enforcement hooks, scaffold manifest, and compliance scanner

### Changed
- **Compliance: descriptive naming in reconnect tests**: Renamed single-letter variable `h` to `handler` across all 6 test functions in `session_reconnect_test.go` to satisfy the descriptive naming compliance rule
- **Version bump**: 5.2.0 → 5.2.1 (tour version, package.json, updater)

### Fixed
- **Code Tutor Change Wizard — "View Changes" watcher notification**: Clicking "View Changes" now re-fetches git changes and enters the Change Wizard, instead of incorrectly jumping to learning-path index 0
- **Macro injection for command cards**: `handleExecute` now sends `macro_payload` to the terminal after `(cmd.delay + macro_delay)` ms. Previously the `macro_payload` and `macro_delay` fields were saved in card data but never used — clicking Run never injected the macro
- **New tab blocked when session load fails**: `useTabManager` now sets `sessionLoadFailed=true` when `/api/sessions` is unavailable, allowing the App render guard to unblock terminal rendering. Previously the guard `!sessionLoaded` permanently froze the UI (showing "Loading...") if the backend was temporarily down at startup
- **Tab-switch flicker (root cause fix)**: Replaced the `isFitReady` state + rAF + opacity hack with a single `useLayoutEffect` that calls `fit()` synchronously after React's DOM commit but before the browser paints — zero extra renders, zero opacity tricks, zero timing hacks
- **Session recovery never working (critical race condition)**: The disconnect handler was deleting the hub and session from the maps before `detachSession()` stored them, so reconnecting clients always got a brand-new empty hub. Hub and session now stay in the maps during the grace period; only the grace-expiry callback cleans them up
- **Orphaned PTY reader goroutine on reconnect**: When a client reconnects to a live session, the old handler's reader goroutine was left dangling. Now `detachedSessions` state is cleaned up in the watcher-join path too, closing `readerDone` and stopping the orphaned goroutine
- **Suppress CMD window flashes on Windows**: Added `hideExecWindow()` to Code Tutor CLI calls, review agent CLI calls, workflow compliance checks, and terminal executive trigger. Each package now has dedicated `proc_windows.go` / `proc_unix.go` platform files
- **"Another device controls this terminal" phantom banner**: `SESSION_JOINED` messages now include `isActiveDevice` — if the server auto-promoted this client, the banner timer is cancelled and the terminal is treated as the active device immediately
- **Dead-PTY detach cleanup bug**: `detachSession()` now uses `LoadAndDelete()` in a single atomic operation instead of separate `Delete()` + `Load()` calls that were silently leaking the hub
- **Scrollback replay ordering**: Moved `hub.replayTo()` before `hub.add()` so the client receives all historical output before new PTY broadcast data, preventing interleaved output on reconnect
- **Blank popup windows on workflow apply and ribbon tab switch (Windows)**: `configureGitHooks()` was calling `exec.Command("git", "config", ...)` without `CREATE_NO_WINDOW`
- **Blank popup window when ForgeAssist uses Copilot/Claude CLI**: `streamViaCopilotCLI()` and `streamViaClaudeCLI()` in `handlers_chat.go` were missing `hideWindow(cmd)` calls
- **Blank popup window on self-restart (Windows)**: `restartSelf()` Windows branch was missing `hideWindow(cmd)` before starting the new process
- **Code Tutor notifications clicking does nothing**: Three bugs combined — `EnterpriseWorkflowCard` never passed `action`/`onAction` to `addToast()`; the `useEffect` re-fired on every new notification re-showing all duplicates; no `clearWatcherNotifications()` existed to atomically flush the queue

## [5.1.0] - 2026-04-04

### Fixed
- Terminal tab-switch flicker: the outer container now holds `opacity:0` from the moment a tab becomes active until xterm.js `fit()` completes, then fades in via a 60ms CSS transition — eliminates the outline artifacts that occurred when the stale-sized canvas was exposed during the 50ms re-fit window

### Added
- `AGENTS.md` at repo root: a circuit-breaker pattern that requires `skill: workflow-enforcer` as the first tool call on any code task; read automatically by Copilot CLI at session start with a per-response gate and skill invocation table

### Changed
- `workflow-enforcer` skill restructured into three phases — Phase 0 (co-skill cascade fires immediately when the skill loads), Phase 1 (active coding standards applied while writing), Phase 2 (pre-delivery checklist); transforms the skill from a post-delivery audit into a pre-flight gate
- `.github/copilot-instructions.md`: hard-stop pre-flight block prepended before all other content; section 8.8 changed from advisory SHOULD language to MUST with an ordered numbered invocation sequence
- `code-tutor-workflow` skill: post-change walkthrough changed from opt-in ("want a walkthrough?") to required — agent must explain all changes without being asked when this skill is loaded
