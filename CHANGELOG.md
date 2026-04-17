# Changelog — ToolBox

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Subscription-ready UI cleanup** — streamlined the interface for paid users by hiding unvetted features and focusing on core functionality:
  - **Code Tutor hidden** — panel, TabBar button, and Ctrl+Shift+T shortcut disabled (backend intact for future re-enablement)
  - **Remote Access hidden** — QR code button and modal removed from sidebar controls
  - **Web Tools → Web App Debugger** — section reduced to WebAppDebuggerCard only; removed ConnectionDiagnosticCard, FollowMeDebugger, DebugPanel, and diagnostics overlay toggle

### Fixed
- **Developer Dashboard shows 0 commits** — git log queries now use `--all` flag to count commits across all branches (not just the current branch), and `--since=midnight` for reliable timezone-aware "today" boundaries. Weekly commit chart and last-commit display also fixed with `--all`

## [6.0.0] - 2026-04-13

### Added
- **MCP Server** (`internal/mcp/`): Forge Terminal is now an MCP (Model Context Protocol) server. External AI tools — VS Code GitHub Copilot Chat, Cursor, Claude Code, EZTest — can call Forge tools directly via JSON-RPC 2.0 over Streamable HTTP at `POST /api/mcp`. Eight tools exposed: `terminal_sessions`, `terminal_execute`, `terminal_read`, `file_read`, `file_write`, `file_list`, `task_submit`, `workflow_status`. Auth via auto-generated bearer token at `~/.forge/mcp-token`. See `docs/developer/mcp-server.md`.
- **TaskBroker** (`internal/mcp/tasks.go`): In-memory channel queue that replaces the `.forge/pending-tasks/` file-drop mechanism. `task_submit` returns a UUID immediately; the agent loop reads from `broker.Incoming()` and the caller can poll status at `GET /api/mcp/tasks/{id}`.
- **MCP config in `forge.toml`** (`[mcp]` section): `enabled` flag (bool, default true) and `allowed_tools` list let operators restrict which tools are exposed without rebuilding. `enabled = false` disables the endpoint entirely.
- Enterprise workflow initialized with Forge Terminal Workflow Architect
- 6 new Go tests for session detach/reattach lifecycle (`session_reconnect_test.go`)
- **PR Review Strategy** (`internal/review/`, `cmd/forge/handlers_review.go`): Configurable PR review system with 4 strategies — Manual, Code Tutor, Quality Agent, Tutor+Agent. Quality Agent uses LLM model chain to produce structured findings (naming, complexity, tests, architecture, security) with 0–100 quality score
- **WorkflowWizard PR Review Step**: New step 3 in the 5-step Enterprise Workflow Architect wizard lets users choose their PR review strategy, configure auto-trigger, CHANGELOG gate, agent strictness, and focus areas
- **PRReviewPanel component** (`frontend/src/components/PRReviewPanel.jsx`): Full quality review results UI with score gauge, severity badges, collapsible finding cards, and filter tabs
- **usePRReview hook** (`frontend/src/hooks/usePRReview.js`): React hook for submitting diffs to `/api/review/analyze` and managing report state
- **Copilot Coding Agent Setup module** (`ModuleCopilotAgentSetup`): New workflow module that generates `.github/copilot/setup-steps.yml` — pre-installs project dependencies in the GitHub Copilot coding agent environment before it writes code or runs tests. Template is project-type-aware (Go, Node, Python, Rust, Java, .NET, generic)
- **Code Tutor notification toast action button**: File-change notification toasts now include an **"Open Tutor"** button that opens the Code Tutor panel directly. Previously the toasts appeared but had no clickable action

### Changed

### Fixed
- **Tab-switch flicker (root cause fix)**: replaced the `isFitReady` state + rAF + opacity hack with a single `useLayoutEffect` that calls `fit()` synchronously after React's DOM commit but **before** the browser paints — zero extra renders, zero opacity tricks, zero timing hacks
- **Session recovery NEVER working (critical race condition)**: the disconnect handler was deleting the hub and session from the maps _before_ `detachSession()` stored them, so reconnecting clients always got a brand-new empty hub. Hub and session now stay in the maps during the grace period; only the grace-expiry callback cleans them up. Reconnecting clients find the _existing_ hub with its populated ring buffer and open journal
- **Orphaned PTY reader goroutine on reconnect**: when a client reconnects to a live session (Priority 1 path), the old handler's reader goroutine was left dangling because `readerDone` was only closed in the reattach path. Now `detachedSessions` state is cleaned up in the watcher-join path too, closing `readerDone` and stopping the orphaned goroutine
- **Suppress remaining CMD window flashes on Windows**: added `hideExecWindow()` to `internal/tutor/explainer.go` (Code Tutor CLI calls), `internal/review/agent.go` (review agent CLI calls), `internal/workflow/compliance.go` (git compliance checks), and `internal/terminal/executive_trigger.go` (tasklist/ps process detection and git branch lookup). Each package now has dedicated `proc_windows.go` / `proc_unix.go` platform files matching the pattern established in `internal/workflow/`
- **"Another device controls this terminal" phantom banner**: `SESSION_JOINED` messages include an `isActiveDevice` field from the server, but the frontend always started the passive-device banner timer regardless. Now if `msg.isActiveDevice === true` (server auto-promoted this client because no other device was active) the banner timer is cancelled and the terminal is treated as the active device — identical to receiving `CONTROL_GRANTED`
- **Dead-PTY detach cleanup bug**: `detachSession()` was calling `h.hubs.Delete()` then `h.hubs.Load()` (which always missed), silently leaking the hub. Fixed to use `h.hubs.LoadAndDelete()` in a single atomic operation
- **Scrollback replay ordering**: moved `hub.replayTo()` before `hub.add()` so the client receives all historical output before broadcast can deliver new PTY data, preventing interleaved/out-of-order output on reconnect
- **Blank popup windows on ribbon tab switch and workflow apply (Windows)**: `configureGitHooks()` in `internal/workflow/scaffold.go` was calling `exec.Command("git", "config", ...)` without `CREATE_NO_WINDOW`, creating a visible CMD flash every time workflow changes were applied. Added platform-specific `hideExecWindow()` helper (`proc_windows.go` / `proc_unix.go`) to the workflow package and applied it to the git config call
- **Blank popup windows when ForgeAssist uses Copilot/Claude CLI**: `streamViaCopilotCLI()` and `streamViaClaudeCLI()` in `handlers_chat.go` were missing `hideWindow(cmd)` calls, causing CMD window flashes on Windows whenever the chat system invoked external CLI tools
- **Blank popup window on self-restart (Windows)**: `restartSelf()` in `main.go` Windows branch was missing `hideWindow(cmd)` before starting the new process
- **Code Tutor notifications: clicking does nothing**: Three bugs combined — (1) `EnterpriseWorkflowCard` never passed `action`/`onAction` to `addToast()`, so there was no button to click; (2) the `useEffect` re-fired on every new notification, re-showing ALL previously received notifications again as duplicates; (3) no `clearWatcherNotifications()` function existed to atomically flush the queue. Fixed by: adding `clearWatcherNotifications()` to `useWorkflowSetup`, wiring `onOpenTutor` prop through `App → CommandCards → EnterpriseWorkflowCard`, and passing `{ action: 'Open Tutor', onAction: onOpenTutor }` to `addToast()`

### Removed

---

## [5.1.0] - 2026-04-04

### Fixed
- Terminal tab-switch flicker: the outer container now holds `opacity:0` from the moment a tab becomes active until xterm.js `fit()` completes, then fades in via a 60ms CSS transition — eliminates the outline artifacts that occurred when the stale-sized canvas was exposed during the 50ms re-fit window

### Added
- `AGENTS.md` at repo root: a circuit-breaker pattern that requires `skill: workflow-enforcer` as the first tool call on any code task; read automatically by Copilot CLI at session start with a per-response gate and skill invocation table

### Changed
- `workflow-enforcer` skill restructured into three phases — Phase 0 (co-skill cascade fires immediately when the skill loads), Phase 1 (active coding standards applied while writing), Phase 2 (pre-delivery checklist); transforms the skill from a post-delivery audit into a pre-flight gate
- `.github/copilot-instructions.md`: hard-stop pre-flight block prepended before all other content; section 8.8 changed from advisory SHOULD language to MUST with an ordered numbered invocation sequence
- `code-tutor-workflow` skill: post-change walkthrough changed from opt-in ("want a walkthrough?") to required — agent must explain all changes without being asked when this skill is loaded
