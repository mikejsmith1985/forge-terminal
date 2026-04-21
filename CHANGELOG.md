# Changelog — ToolBox

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **MCPSetupCard** — New command-panel sidebar card (`frontend/src/components/MCPSetupCard.jsx`) for the Adaptive Build Environments MCP feature. Shows live MCP server status (fetched from `GET /api/mcp/ui-status`), token path with copy button, per-client connection guides (Copilot CLI, VS Code, Claude Code), a Windows build issue callout, and a highlighted list of active tools with `environment_detect` and `environment_run` starred at the top.

### Fixed
- **Release script R2 upload**— `local-release.ps1` now passes `--remote` to `wrangler r2 object put` so binaries are uploaded to Cloudflare R2 rather than the local wrangler dev instance. Missing `wrangler` is now a hard error (exit 1) instead of a silent skip, preventing 404 download failures for licensed users.

## [7.5.0] - 2026-04-21

---

## [v7.5.0] - 2026-04-21

### Added
- **MCP config hot-reload** — Forge now watches `forge.toml` for changes every 5 seconds and automatically applies a new `allowed_tools` list without restarting. A `POST /api/mcp/reload` endpoint is also available for instant manual reload. Parse failures are logged and safely ignored — the previous tool list is preserved to prevent accidental permission changes.

### Fixed
- **Task status endpoint auth** — `GET /api/mcp/tasks/{id}` now requires the bearer token (previously had no auth check despite the misleading comment).

## [7.3.0] - 2026-04-21

---

## [v7.3.0] - 2026-04-21

### Fixed
- **Code Tutor toast leak** — `EnterpriseWorkflowCard` was firing blank toast notifications via a leftover file-watcher effect even though Code Tutor is disabled. The watcher start/stop lifecycle and the broken notification effect have been removed entirely; the polling loop no longer runs.
- **Code Tutor options in Workflow Wizard** — `tutor` and `tutor-and-agent` PR review strategy cards have been removed from the Enterprise Workflow Wizard. Users who had those strategies saved will be automatically migrated to `agent` on next open. Quality Agent is now the recommended strategy.

— agents can probe the host for WSL2 and Docker availability before choosing an execution strategy. Returns `wsl2_available`, `docker_available`, `docker_installed_but_not_running`, `recommended` strategy, and an `install_hint` when neither is configured.
- **`environment_run` MCP tool** — agents can run shell commands in `native`, `linux-wsl`, `linux-docker`, or `auto` environments. Solves Windows build incompatibilities (Turbopack/OpenNext chunk filename issues) without requiring GitHub Actions workflows or CI secrets. Supports configurable timeouts up to 10 minutes for long builds. Returns `exit_code`, `stdout`, `stderr`, `environment_used`, and `duration_seconds`.

## [7.2.8] - 2026-04-20

---

## [v7.2.8] - 2026-04-20

### Added
- **R2 binary upload in release pipeline** — `scripts/local-release.ps1` now uploads all platform binaries to `forge-releases` R2 bucket (key pattern: `v{version}/forge-{platform}[.exe]`) after each build, enabling the in-app auto-update download flow.
- **Monthly license subscription model** — Cloudflare Worker now sets `expiresAt` to 35 days (30 days + 5-day grace) and extends on each `invoice.payment_succeeded` event instead of hardcoded 365-day expiry. Supports monthly Stripe subscriptions.
- **O(1) subscription lookup** — Worker stores `sub:{subscriptionId}` → license key reverse mapping in KV, eliminating the O(n) full KV scan on cancellation/payment failure.
- **Subscription renewal handler** — Worker now handles `invoice.payment_succeeded` events to extend license expiry on each monthly billing cycle.

### Fixed
- **LicenseGate checkout URL** — `CHECKOUT_URL` now correctly points to `https://rootlevellabs.tech/#products` (the product page) instead of a placeholder dead link.
- **Worker secret name mismatch** — Worker was referencing `EMAIL_API_KEY` but the deployed secret is named `RESEND_API_KEY`; corrected interface and email function.
- **Worker 500 on missing secrets** — Worker now returns 503 (Service Unavailable) with a clear message when `HMAC_SECRET` or `STRIPE_WEBHOOK_SECRET` are not configured, instead of crashing with an unhandled 500.
- **HMAC_SECRET deployed** — Secret generated and uploaded to `forge-license` Cloudflare Worker; stored in Forge Vault.
- **workflow.json cosmetic fix** — Removed `"code-tutor"` from `enabledModules` in `.forge/workflow.json` (Code Tutor was already fully removed from all code).

## [7.2.7] - 2026-04-20

---

## [v7.2.7] - 2026-04-20

## [7.2.7] - 2026-04-20

### Fixed
- **App crash on launch** — Added missing `PiFingerprint` import to `IconPicker.jsx`; a `ReferenceError: PiFingerprint is not defined` was crashing the React tree and leaving a blank screen.
- **Code Tutor fully disabled** — Removed all `ModuleCodeTutor` references from `workflow_test.go` and the orphaned empty struct from `ModuleCatalog()` in `types.go`; all backend tests now pass cleanly.


---

## [v7.2.6] - 2026-04-20

## [7.2.5] - 2026-04-20

---

## [v7.2.5] - 2026-04-20

## [7.2.5] - 2026-04-20

---

## [v7.2.5] - 2026-04-20

### Added
- **License system** — AES-256-GCM encrypted local cache with DPAPI key wrapping (Windows) or 0600 file permissions (Unix). Machine fingerprinting via `MachineID()`/`MachineName()`. 72-hour grace period on network failure; 60-minute background heartbeat. Full test suite: 22 tests across cache crypto, HTTP client, machine ID, and decision-tree logic.
- **License API handlers** — `/api/license/status`, `/api/license/activate`, `/api/license/deactivate` endpoints. `LicenseMiddleware` returns 402 Payment Required when no valid license is present.
- **Cloudflare Worker backend** — Stripe webhook receiver, per-machine KV activation store, R2 signed download URL generation. Deployed at `license.rootlevellabs.tech`.
- **LicenseGate component** — React activation UI that gates the terminal behind a license key form.
- **MCP stdio proxy** — `mcp-forge-vault/index.js` rewritten as a transparent stdio→HTTP bridge to Forge's built-in MCP server (`/api/mcp`). Reads `~/.forge/mcp-token` at startup, probes localhost for the Forge port, and dynamically proxies all built-in tools (`terminal_execute`, `terminal_read`, `file_read`, `file_write`, `file_list`, `workflow_status`, `task_submit`) to Claude Code. Registered in `.mcp.json`.
- **CORS expansion** — `rootlevellabs.tech` and all subdomains are now always-allowed origins.

## [7.2.4] - 2026-04-19

---

## [v7.2.4] - 2026-04-19

## [7.2.4] - 2026-04-19

### Fixed
- **"GitHub API returned status 403" when clicking Update Now** — `handleUpdateApply` called `CheckForUpdate()` a second time on every "Update Now" click, burning a second GitHub API request and failing with 403 when the unauthenticated rate limit (60 req/hour) was reached. Fixed by caching the last successful check result (5-minute TTL) and reusing it in the apply handler. The check handler also returns the cached result on rapid re-checks for the same reason.

## [7.2.3] - 2026-04-19

---

## [v7.2.3] - 2026-04-19

## [7.2.3] - 2026-04-19

### Fixed
- **Command card emoji top-aligned** — Icon block was pinned to the top of the card because the card flex container used `align-items: flex-start`. Changed to `align-items: center` so the emoji is vertically centered relative to the title and buttons.

## [7.2.2] - 2026-04-19

---

## [v7.2.2] - 2026-04-19

## [7.2.2] - 2026-04-19

### Fixed
- **Update modal shows "You're up to date!" and "Available Update" simultaneously** — `hasUpdate` was derived solely from the background-check prop (`updateInfo`), while the "Check Now" result was stored in separate `freshUpdateInfo` state. After a manual check the two sections rendered from different sources, producing contradictory UI. Fixed by introducing `effectiveUpdateInfo = freshUpdateInfo ?? updateInfo` so the fresh check overrides the background result and both sections stay in sync.

## [7.2.1] - 2026-04-18

---

## [v7.2.1] - 2026-04-18

## [7.2.1] - 2026-04-18

### Fixed
- **"Cannot Reach the Forge Server" dialog on every launch** — The connection diagnostic wizard was auto-triggered on every version upgrade because `TOUR_VERSION` changed with each release. The wizard would fetch `/api/diagnostics/internal` 1.5 seconds after load — before the backend was fully initialized — producing a false "server unreachable" error for all users. Fixed: wizard no longer auto-triggers on version changes or first run; it only appears when a terminal explicitly fails to spawn (close code 4005).

## [7.2.0] - 2026-04-18

---

## [v7.2.0] - 2026-04-18

## [7.2.0] - 2026-04-18

### Fixed
- **Keyboard input after update** — Terminal no longer requires a browser refresh to accept keyboard input after installing an update. Added `term.focus()` call in the WebSocket `onopen` handler so focus is restored immediately on connect and reconnect.
- **Files tab crash** — `LensFilePicker.jsx` `humanizeTime()` referenced undefined variable `d` instead of `parsedDate`, causing a render exception whenever a file older than 7 days appeared in the file list. Fixed the variable reference.
- **Workflow preset checkmark vanishes** — The "Selected" checkmark on Enterprise Standard and Lean Startup presets disappeared immediately after clicking. Root cause: the project-detection `useEffect` called `updateConfig()` after preset selection, which internally calls `setSelectedPreset(null)`. Fixed by adding a `!selectedPreset` guard to the effect so it skips auto-population when a preset is already chosen.

### Changed
- **Code Tutor removed from Enterprise Workflow** — Code Tutor is no longer listed in the Enterprise Standard preset description or Quality Mode "BEST" label. Removed `code-tutor` from `DefaultConfig()` enabled modules and the frontend default config.
- **Send Feedback → email** — The feedback button now opens the user's email client pre-filled with feedback, screenshots note, and environment info addressed to `info@rootlevellabs.tech`. Removed GitHub PAT requirement entirely.
- **Command card emoji revamp** — Emoji icon blocks are now 48×48px (was 42×42px), font size 1.7rem (was 1.45rem), with an orange gradient background, subtle border glow, and hover animation for a more polished, flashier look.

### Fixed (Dashboard)
- **Developer Dashboard always shows 0 commits** — The dashboard now passes the active terminal's current directory to the backend as a `?dir=` query parameter. The backend resolves the git root from that directory, so commit counts, changed files, and the weekly chart reflect the user's actual project instead of the forge binary's working directory.

## [7.1.0] - 2026-04-18

---

## [v7.1.0] - 2026-04-18

## [7.1.1] - 2026-04-18

### Fixed
- **Tab recovery with deep directory paths** — Fixed critical session.go directory validation that only caught `os.IsNotExist` errors. Now validates ALL `os.Stat()` errors (permission denied, network unavailable, path too long, etc.) and checks `IsDir()` before passing directory to ConPTY. Tabs saved with deep paths like `C:\ProjectsWin\Waypoint\packages\forge-app` now reconnect successfully after server restart instead of showing "Cannot Reach Session" error (ConPTY ERROR_DIRECTORY spawn failure).
- **Web App Debugger "Follow Me" button restored** — Re-enabled `FollowMeDebugger` component in Debug sidebar. Was hidden with comment "HIDDEN for subscription release". Users can now click "Follow Me" to capture screen recording, keystrokes, clicks, console logs, and network requests for bug reporting and issue diagnosis.

## [7.1.0] - 2026-04-18

---

## [v7.1.0] - 2026-04-18

### Fixed
- **Dev Dashboard: commit count always 0** — Replaced `--since=midnight` (locale-dependent, fails on some Windows Git builds) with an explicit `YYYY-MM-DDT00:00:00` boundary matching the format already used by the weekly chart. Also replaced `sync.Once` caching of `gitRoot` with a mutex-guarded retry — previously a failed first detection (e.g., when double-clicking the binary from Explorer) would cache an empty root forever and return 0 commits for the entire session.

### Added
- **Guided tour re-implemented** — Populated 7-step feature tour covering Command Cards, Release Manager, Vault, Multi-Tab Themes, and the Dev Dashboard. Tour activates via **Settings → Replay Tour**. `TOUR_VERSION` bumped to `7.1.0` so existing users see the new tour on next launch. `TourOverlay` re-wired into `App.jsx`.
- **Enterprise Workflow: AI compliance disclaimer** — Added a small but honest notice at the bottom of the Enterprise Workflow card explaining that workflow rules are strong guidance, not hard enforcement, and that compliance may vary in long sessions due to how large language models manage context. Framed as an industry-wide characteristic, not a product limitation. Also added a full explanatory section to README.md under a new `## 🧭 Enterprise Workflow — Understanding AI Compliance` heading.
- **Command Cards: icon-forward layout** — Each command card now displays a large 42×42px icon block on the left with title, command text, and Paste/Run buttons in a compact column to the right. Cards are more compact — more fit on screen at once.

## [7.0.0] - 2026-04-17

---

## [v7.0.0] - 2026-04-17

### Added
- **Vault: Edit Secret** — Vault entries can now be edited in-place via a new Pencil button on each entry card. Clicking it opens a modal form pre-populated with the entry's current name, env var, and description. The secret value field starts empty — a new value is only sent if the user types one. Only changed fields are submitted to the new `PUT /api/vault/entries` backend endpoint with partial-update semantics and disk-write rollback safety. A success flash confirms the update before the form auto-closes.
- **Vault: Reveal & Copy secrets** — Each secret in the Forge Vault can now be viewed and copied directly from the Vault panel. A "Reveal" button fetches the decrypted value on demand, shows it as a masked field with an eye-toggle for plaintext, and a "Copy" button writes it to the clipboard with a 2-second "Copied!" confirmation. Values auto-hide after 30 seconds and are never cached in global state. A new audited `GET /api/vault/entries/value?id=` endpoint backs the feature; every reveal call is logged server-side.

### Changed
- **Subscription-ready UI cleanup** — streamlined the interface for paid users by hiding unvetted features and focusing on core functionality:
  - **Code Tutor hidden** — panel, TabBar button, and Ctrl+Shift+T shortcut disabled (backend intact for future re-enablement)
  - **Remote Access hidden** — QR code button and modal removed from sidebar controls
  - **Web Tools → Web App Debugger** — section reduced to WebAppDebuggerCard only; removed ConnectionDiagnosticCard, FollowMeDebugger, DebugPanel, and diagnostics overlay toggle
  - **Notifications hidden** — Settings tab, TabBar bell button, and ntfy.sh integration all disabled (backend + component intact for future re-enablement)
  - **Time Travel hidden** — sidebar Clock button, Ctrl+Shift+H shortcut, and HistorySlider panel all disabled (component intact for future re-enablement)

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
