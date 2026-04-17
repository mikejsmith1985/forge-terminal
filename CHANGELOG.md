# Changelog — ToolBox

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.1.11] - 2026-04-17

### Added
- **Forge Vault skill** (`.github/skills/forge-vault/SKILL.md`) — teaches Copilot agents how to use the Forge Vault API to list, retrieve, and inject secrets. Agents no longer need to guess endpoints, try to decrypt vault files, or ask the user how to access secrets.

## [6.1.10] - 2026-04-17

## [6.1.9] - 2026-04-17

### Fixed
- **Stale Forge bootstrap payloads on ALL Copilot cards are now upgraded** — the migration previously only upgraded built-in cards (IDs 6 and 7). User-created Copilot cards (e.g., "Copilot Workflow Enforced") carrying old Forge bootstrap text were silently left behind, causing agents to still receive "Begin by reading AGENTS.md" as their first instruction.

## [6.1.8] - 2026-04-17

### Fixed
- **First-time workflow bootstrap no longer blocks on missing AGENTS.md** — the Copilot macro prompt now uses numbered STEP instructions with skill invocation as the unconditional first action. When AGENTS.md is absent (normal for first-time setup), the agent proceeds instead of searching for the file or asking the user where it is.
- **v2 prompt upgrade via self-heal** — the migration engine now detects both v1 (original) and v2 (AGENTS.md-first) macro payloads and upgrades them to the v3 skill-first format.

## [6.1.7] - 2026-04-17

### Fixed
- **Stale Copilot workflow macros now self-heal** — built-in Copilot cards replace older saved macro payloads with the current bootstrap prompt, so previously saved cards always use the latest recovery-resilient instructions.
- **Unavailable companion skills no longer block workflow bootstrap** — the prompt explicitly tells the agent to silently skip any companion skills that are not found in the current environment.

## [6.1.6] - 2026-04-17

### Fixed
- **Copilot command-card zero-click macros now run again** — command cards once again forward `macro_payload` and `macro_delay` during execution, so the Copilot bootstrap prompt is injected automatically instead of forcing a manual paste.
- **Missing workflow scaffolding is handled more gracefully** — the seeded Copilot macro instructions now tell the agent to create missing `AGENTS.md` and workflow files when they are absent, rather than stopping to ask where they are.

## [6.1.5] - 2026-04-17

### Added
- **MCP Dashboard Panel enhancements** (`MCPPanel.jsx`) — the sidebar card now shows a richer connection summary, endpoint, token copy action, available tools, task queue, and one-click config snippets for six AI tools: Claude Desktop, VS Code Copilot, Cursor, Google Gemini/AI Studio, Windsurf, and Cline.
- **MCP dashboard API helpers** — `/api/mcp/status`, `/api/mcp/dashboard/tasks`, and `/api/mcp/dashboard/token` continue to power the Forge UI, with server helper methods exposing token hints and tool names for the expanded dashboard.
- **"What is MCP?" explainer** — the MCP panel now includes a collapsible plain-language guide that explains the Copilot-first workflow value of adding an MCP client and walks through the setup steps for connecting external tools.
- **MCP documentation refresh** (`docs/developer/mcp-server.md`) — the developer docs now mirror the updated panel messaging so the MCP workflow value and setup guidance stay consistent between the UI and docs.

## [6.1.4] - 2026-04-15

### Added
- **forge-debug.exe — Standalone Diagnostic Tool** — new companion binary for diagnosing terminal connection failures. Users download `forge-debug.exe` to the same folder as `fterm.exe`, run it, and it walks them through a full diagnostic workflow:
  - **Pre-launch checks** — OS version, RAM, existing fterm processes, port availability, firewall status, proxy/VPN detection, antivirus processes, ~/.forge directory health
  - **Process launcher** — starts fterm.exe as a child process, captures all stdout/stderr with timestamps, monitors lifecycle with explicit PID-based tree kill (never wildcard)
  - **Live connectivity monitor** — polls TCP port, HTTP `/api/version`, and WebSocket `/ws` handshake every 2 seconds with latency tracking and success rate stats
  - **Auto-diagnosis engine** — analyzes all collected data to flag likely root causes: port conflicts, HTTP failures, WS upgrade issues, process crashes, panic detection in output
  - **Clipboard report** — press `C` to copy a structured JSON report with human-readable summary header, full probe timeline, and process output. Report is agent-consumable for automated troubleshooting
  - Built with bubbletea TUI — interactive console UI with phase transitions (consent → pre-checks → launch → monitoring → report)

## [6.1.3] - 2026-04-15

### Added
- **Code Tutor disable toggle** — persistent UI control to completely turn off the Code Tutor feature. Power button in the panel header disables the feature; dimmed BookX icon in the TabBar re-enables it. State persists to `~/.forge/tutor/config.json` via new `/api/tutor/status` endpoint. Keyboard shortcut (Ctrl+Shift+T) is also suppressed when disabled.

## [6.1.2] - 2026-04-14

### Fixed
- **Tab title shows wrong project** — tab names now update whenever the detected project root changes, not just on first detection. A tab locked as "toolbox" will correctly update to "forge-terminal" when you open that project. Manual renames (double-click) are always preserved and never auto-overwritten (`isManuallyRenamed` flag). Previous sessions that were over-locked on restore are now unlocked for auto-detection on reload.
- **Paste latency (30+ seconds)** — Ctrl+V now pastes text instantly. The previous implementation always called `navigator.clipboard.read()` first, which on Windows/Chrome can block for 30+ seconds waiting for clipboard permission. The paste handler now uses the synchronous `e.clipboardData` fast-path for plain text (zero async overhead). Media paste (images/video) still routes through the full async pipeline unchanged.

### Added
- **Forge Vault** — AES-256-GCM encrypted secret storage (`~/.forge/vault/vault.enc`). Master key is protected by Windows DPAPI on Windows; file-permission-based (0600) on other platforms. Secrets (API keys, tokens) can auto-inject as environment variables into new PTY sessions. Full REST API at `/api/vault/*`.
  - `internal/vault/` — core vault package: `Open`, `AddEntry`, `RemoveEntry`, `SetAutoInject`, `GetEntryValue`, `GetAutoInjectEnv`, `BuildInjectionScript`
  - `cmd/forge/handlers_vault.go` — HTTP handlers: status, list, add, delete, toggle auto-inject, inject now, reveal value
  - `frontend/src/components/VaultPanel.jsx` + `VaultPanel.css` — compact modal panel for managing secrets; supports API token and username/password credential types
  - `frontend/src/hooks/useVault.js` — React hook for vault state management
  - 🔐 toolbar button in App.jsx opens the vault panel
  - `internal/storage/paths.go` — added `GetVaultDir()` helper

## [6.1.1] - 2026-04-14

### Fixed
- **Tab title shows wrong project** — tab names now update whenever the detected project root changes, not just on first detection. A tab locked as "toolbox" will correctly update to "forge-terminal" when you open that project. Manual renames (double-click) are always preserved and never auto-overwritten (`isManuallyRenamed` flag). Previous sessions that were over-locked on restore are now unlocked for auto-detection on reload.
- **Paste latency (30+ seconds)** — Ctrl+V now pastes text instantly. The previous implementation always called `navigator.clipboard.read()` first, which on Windows/Chrome can block for 30+ seconds waiting for clipboard permission. The paste handler now uses the synchronous `e.clipboardData` fast-path for plain text (zero async overhead). Media paste (images/video) still routes through the full async pipeline unchanged.

## [6.1.0] - 2026-04-14

### Added
- **MCP Dashboard Panel** — new sidebar card in the "Cards" view that exposes the MCP server's full status at a glance. Shows connection endpoint, protocol version, masked auth token with one-click copy, registered tools list, and live task queue with status badges. Includes **Quick Connect** tab with ready-to-paste config snippets for Claude Desktop, VS Code Copilot, and Cursor — just copy, paste, and add your token
- **Backend endpoints for MCP dashboard** — `GET /api/mcp/status` (server info + tool list), `GET /api/mcp/dashboard/tasks` (full task queue), `GET /api/mcp/dashboard/token` (secure token retrieval for clipboard)

### Fixed
- **Tab titles now lock after first detection** — tab names are set once from the initial working directory and never auto-updated when you `cd`. Only manual rename (double-click) changes a locked title. Fixes chronic issue where tab names would follow subdirectory navigation and eventually display garbled command fragments
- **New tab creation failing ("directory name is invalid")** — inherited working directory is now validated before passing to PTY; paths containing semicolons, pipes, or other command fragments are rejected. Also hardened `sanitizePath` to strip semicolons and `||` operators that could leak from terminal prompt detection

### Removed
- **Guided tour removed** — the first-run/new-release tour overlay has been fully removed (useGuidedTour hook, TourOverlay component, tourSteps config, WelcomeModal, and "Replay Tour" button in Settings)

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
