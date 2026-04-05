# Changelog — ToolBox

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Forge Vault frontend**: Full-screen secret manager overlay (`VaultPanel.jsx`) with two-column layout — sidebar entry list with auto-inject pill toggles and delete confirmation, plus an Add Secret form with show/hide password, auto-derived environment variable names, and encrypted-at-rest security UX. Backed by `useVault.js` hook (mirrors `useTutorSession` pattern) with `vaultFetch` helper, optimistic updates, and 5-second timed error clearing.

### Fixed
- **Code Tutor explanation stuck on loading**: The `callLLM` function in the tutor backend passed an invalid `-s` flag to the Copilot CLI, causing all model attempts to fail immediately. The frontend swallowed the error and left the panel permanently showing a loading spinner with no way to recover.
- **Code Tutor explanation error recovery**: When explanation generation fails, the wizard panel now shows the actual error message and a **Retry** button instead of an infinite loading spinner.
- **Code Tutor panel too narrow to read**: The Code Tutor panel was a fixed 500px side drawer. Expanded to full-screen (100vw × 100vh) so content is actually readable. Increased body font size (12px → 15px), section headers (12px → 14px), and diff view (11px → 13px).
- **Enterprise Workflow Card refresh button did nothing visible**: `handleRefresh` captured a stale `status?.configured` closure value — after `checkStatus()` ran, the old value was still used to decide whether to run `scanCompliance`. Rewritten as `async/await` that awaits `checkStatus` and uses the fresh return value. Added `isRefreshing` state with spinning animation on the refresh icon so the button gives visual feedback.
- **Workflow scaffold path contamination**: When PowerShell's process path leaked into the cwd detection (producing strings like `C:\...\powershell.exePS C:\ProjectsWin\Waypoint`), the scaffold cascaded into dozens of `mkdir` failures. Fixed in two layers: (1) `sanitizePath` in the frontend now detects `.exe` in the path and extracts the real path from after the executable segment; (2) `ScaffoldProject` in the backend now validates that the resolved path exists as a directory before touching any files.

---

## [v5.2.2] - 2026-04-05

### Fixed
- **Number keys dropping ~10% of keypresses**: Keyboard handler was inside a `useEffect` that re-registered the `window.keydown` listener on every state change to `tabs`, `activeTabId`, `commands`, etc. The gap between `removeEventListener` and `addEventListener` (~1-5ms) caused keys pressed during re-registration to be silently dropped. **Fix**: Moved handler into a `useRef` that is updated every render; the listener is registered ONCE on mount and never re-registered. Also switched from `parseInt(e.key)` to `e.code` for reliable digit detection across OS/browser combos.
- **Tab creation race condition**: `createTabAction` checked MAX_TABS using a potentially stale `stateRef` snapshot. Two rapid clicks could both pass the check and over-create. **Fix**: Moved the authoritative MAX_TABS guard inside the `setState` updater function where `prev` is always fresh.
- **Duplicate PTY processes on concurrent WebSocket upgrades**: Two simultaneous connections for the same sessionID could both create new PTY processes, orphaning one. **Fix**: Added per-sessionID creation mutex (`sessionCreateLocks`) in handler.go. After acquiring the lock, re-checks for a live session before creating a new one.
- **Zombie hub cleanup**: When session creation failed, the hub remained in `h.hubs` with no session attached, causing future connections to see a blank screen. **Fix**: Fresh hubs with no remaining clients are now deleted from the map on session creation failure.
- **Release script binary conflict**: `go build -o bin/fterm.exe` failed if a stale binary existed from a prior release. **Fix**: Release script now removes existing binaries before each build target.
- **Release commit blocked by pre-commit hook**: Version bump commit changed source files but not CHANGELOG, triggering the CHANGELOG gate. **Fix**: Release script now renames `[Unreleased]` → `[TAG] - DATE` and inserts a fresh empty `[Unreleased]` section as part of the version bump commit. CHANGELOG is always staged alongside version files.

### Added
- **Release preflight gate**: New final enforcement layer in the release pipeline that catches everything git hooks and AI skills may have missed during development. Runs 10 checks (CHANGELOG, branch naming, not-on-main, conventional commits, git hooks, workflow config, Go build, Go tests, frontend tests). When blocking checks fail, generates a ready-to-paste **fix prompt** the user can send to an AI agent to resolve all issues.
  - `ScanReleasePreflight()` in `internal/workflow/release_preflight.go`
  - `GET /api/workflow/release-preflight?path=<dir>&version=<ver>` API endpoint
  - Integrated into `scripts/local-release.ps1` as a pre-build gate

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
