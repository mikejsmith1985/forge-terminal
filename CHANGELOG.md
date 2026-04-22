# Changelog — ToolBox

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [7.6.7] - 2026-04-22

### Fixed
- **Stale TUI viewport after session reattach** — When reconnecting to a detached PTY (page reload, network blip), the server replays the ring buffer before sending `SESSION_REATTACHED`. For TUI apps like Copilot CLI this replay contains absolute cursor-position codes that leave the terminal visually broken (content at wrong positions, cursor floating mid-screen). The handler now writes `ESC[2J ESC[H` to clear the viewport before the "[Session Restored]" banner, then calls `fit()` so `term.onResize` sends updated dimensions to the PTY (SIGWINCH) and the running process redraws cleanly. Scrollback history is preserved.

## [7.6.6] - 2026-04-22

### Fixed
- **Terminal rendering regression fully resolved** — Reverted `ForgeTerminal.jsx` to the v7.5.0 known-good rendering code. The incremental fixes applied in v7.6.0 through v7.6.5 (double RAF, container-width gates, synchronous pre-connect fit, alt-screen theme override) introduced cumulative regressions that caused massive vertical line spacing, broken character layout, and unusable TUI rendering. This wholesale restoration of the v7.5.0 terminal component eliminates those regressions in one step. Per user directive, the mobile-responsive changes that triggered the regression cycle are rolled back at the terminal-component level.

## [7.6.5] - 2026-04-22

### Fixed
- **Terminal rendering regression fixed (double RAF)** — Terminal text and TUI applications were not rendering correctly on initial load or after resizing to smaller screens. Moving the window to a larger screen would trigger a resize event that fixed the display. Root cause: single `requestAnimationFrame` runs BEFORE browser paint, meaning CSS flex layout may not have finished calculating container dimensions when `fit()` is called. Solution: double RAF pattern ensures `fit()` runs AFTER the browser has fully painted and the container has its final size. Fixes regression introduced in v7.6.0 mobile/responsive features.
- **Terminal reattachment no longer shows stale TUI layout** — When reconnecting to a detached session (e.g., after a page reload), the server replays the PTY ring buffer before notifying the client. For TUI applications (Copilot CLI, progress bars, etc.) this replay produced a broken layout: partial text at absolute cursor positions from the previous session. The `SESSION_REATTACHED` handler now clears the viewport (`ESC[2J ESC[H`) before writing the "[Session Restored]" banner and calling `fit()`, giving the running process a clean canvas to redraw onto after SIGWINCH. Scrollback history is preserved and still accessible by scrolling up.

## [7.6.3] - 2026-04-21

---

## [v7.6.3] - 2026-04-21

### Fixed
- **Terminal no longer crashes on launch** — Fixed a runtime error ("intermediate must be in range 0x20 .. 0x2f") thrown by xterm.js when registering the alt-screen CSI handlers. The `?` character (0x3F) is a DEC private parameter prefix, not an intermediate byte; the handler registration now correctly uses `prefix: '?'` instead of `intermediates: '?'`.

## [7.6.2] - 2026-04-21

---

## [v7.6.2] - 2026-04-21

### Fixed
- **TUI apps in light-mode terminals now render correctly** — TUI applications (Copilot CLI, lazygit, vim, gh dash, etc.) that use the terminal's alternate screen buffer (`?1049h` / `?1047h` / `?47h`) now automatically switch to the dark palette for the current color theme while they are active. Previously, light-mode tabs showed the lavender/light background bleeding through between TUI UI regions, making session pickers and interactive dialogs look broken. The original theme is restored when the app exits the alternate screen.
- **Default tab theme changed to `auto-cycle-dark`** — New installations no longer alternate between dark and light mode on each new tab. Terminals default to dark-only cycling, which is compatible with all TUI applications. Users who explicitly selected `auto-cycle` keep their saved preference.
- **Removed orphaned `onInteractiveTUI` prop** — Cleaned up the no-op `handleInteractiveTUI` callback and the unrecognized prop it was passed through; TUI lifecycle is now handled entirely within `ForgeTerminal` via the alt-screen CSI handler.
- **Fixed garbled terminal output on connection and reconnection** — The PTY is now created at the correct column width on every connection. Previously, `fitAddon.fit()` was scheduled in a `requestAnimationFrame` (≈16ms delay) while `connectWebSocket()` was called immediately after — causing the WebSocket URL and the initial `resize` message to carry `cols=80` (xterm.js default) instead of the true display width. On reconnect this produced a brief `SIGWINCH(80) → SIGWINCH(real)` double-reflow that garbled the Copilot CLI scrollback. The fix calls `fit()` synchronously inside the `useEffect` (which runs post-paint, so `getBoundingClientRect()` is already accurate) before the WebSocket connects; the RAF call is kept as a second pass for any deferred layout shifts.

## [7.6.1] - 2026-04-21

---

## [v7.6.1] - 2026-04-21

## [7.6.1] - 2026-04-21

---

## [v7.6.0] - 2026-04-21

## [7.6.0] - 2026-04-21

### Added
- **Forge Companion PWA** (`forge-companion/`) — Standalone mobile companion app that lets users view and interact with Forge Terminal sessions from any iOS or Android browser. No native app required. Single-file vanilla JS PWA with 4 screens: Setup, Upgrade Required, Sessions list, and Terminal view. Distributed as `forge-companion.zip` in releases.
- **Mobile Access API** (`/api/mobile/*`) — Five new HTTP endpoints with CORS headers and a dedicated scoped mobile bearer token (`~/.forge/mobile-token`). The mobile token grants terminal read/write access only — it cannot invoke MCP tools like `environment_run`. Endpoints: `GET /api/mobile/info`, `GET /api/mobile/sessions`, `POST /api/mobile/exec`, `GET /api/mobile/read`, `GET+POST /api/mobile/settings`.
- **Subscription feature flags** (`internal/license/features.go`) — Infrastructure for per-feature gating tied to license plan. `HasFeature(info, featureName)` resolves: license server → local override file → false. `SetLocalFeatureOverride()` writes `~/.forge/feature-overrides.json` for dev and admin use. First gated feature: `mobile_access`.
- **`Features []string` on `license.Info`** — Additive JSON field for the license server to return plan-tier features. When the license Worker is updated to return plan features, mobile access (and future add-ons) will gate automatically without a Forge binary update.
- **ANSI stripping server-side** — `handleMobileRead` strips VT100/ANSI escape codes before returning terminal output so the companion PWA renders plain readable text without extra libraries.
- **Deep-link QR flow** — The desktop "Connect Mobile" share URL uses the URL fragment (`#forge=URL&token=TOKEN`) so the mobile token is never logged by servers, proxies, or referrer headers. The companion reads and clears the fragment on load.

### Changed
- **Mobile access is a subscription add-on** — `/api/mobile/*` endpoints return HTTP 403 with an upgrade URL when `mobile_access` is not in the license feature set.

### Fixed
- **Tab titles no longer show filenames like `index.html`** — `extractProjectFolder` now strips a trailing document/web/image/archive file segment from the path before deriving the project name, so tools that report the file being edited rather than the CWD produce the correct project-level tab title. Language extensions (`.js`, `.ts`, `.py`, etc.) are intentionally excluded from stripping to avoid false positives on project directories like `node.js`. The fix covers all three naming strategies: `project-root`, `current-dir`, and `parent-child`.
- **Auto-detection of project root without explicit configuration** — When the user has not configured a root folder in Settings, `extractProjectFolder` now auto-detects a narrow set of known project-collection folder names (`ProjectsWin`, `repos`, `workspace`, `workspaces`) and pins the tab title to their first child, eliminating the need to manually configure the root folder in most cases.
- **Filename guards centralized** — The `isFileLikeName` helper is now exported from `projectFolder.js` and used by all callers (`ForgeTerminal.jsx` OSC handler, `useTabManager.js` session restore, `App.jsx` directory-change handler) instead of duplicating an incomplete regex in each file. The shared definition now includes HTML, CSS, JSON, YAML, images, archives, and binaries that were missing from the old inline regex.
- **Session restore no longer preserves bad file-title tabs** — If a session was saved with a filename as the tab title (e.g. `index.html` from a previous bug), session restore now re-derives the title from the saved directory path.
- **`handleDirectoryChange` will not overwrite a good title with `Terminal N`** — The fallback no longer silently renames a tab to `Terminal 1` when path parsing fails; it leaves the existing title unchanged.

## [7.5.2] - 2026-04-21

---

## [v7.5.2] - 2026-04-21

### Added
- **MCPSetupCard** — New command-panel sidebar card (`frontend/src/components/MCPSetupCard.jsx`) for the Adaptive Build Environments MCP feature. Shows live MCP server status (fetched from `GET /api/mcp/ui-status`), token path with copy button, per-client connection guides (Copilot CLI, VS Code, Claude Code), a Windows build issue callout, and a highlighted list of active tools with `environment_detect` and `environment_run` starred at the top.
- **`GET /api/mcp/ui-status` endpoint** — New Forge-auth-protected endpoint that returns `{is_enabled, active_tools, tool_count, token_path}` for the sidebar card. Unlike `/api/mcp`, this uses the standard Forge session auth so the UI never needs to handle the MCP bearer token.
- **`adaptive-build-environments` Copilot skill** — Deployed to all Forge-managed repos. Teaches agents when and how to call `environment_detect` and `environment_run` when builds fail on Windows (OpenNext, Turbopack, chunk path issues). Includes the RLL/OpenNext specific diagnosis and correct command pattern.

### Fixed
- **`environment_run` no longer opens an external terminal window** — Added `CREATE_NO_WINDOW` process creation flag on Windows so `wsl.exe` and `cmd.exe` run headlessly. Since Forge is a terminal, spawning a separate console window was always wrong.
- **`terminal_execute` timeout raised 30s → 600s** — Agents can now use `terminal_execute` (which streams output live in the active Forge tab) for long-running builds, not just quick commands.
- **`adaptive-build-environments` skill updated** — Agents now prefer `terminal_sessions` + `terminal_execute` (PTY-first, user sees live output) over `environment_run` for builds. Skill redeployed to 13 sibling repos.
- **Removed "Another device controls this terminal" mobile handoff banner** — The purple overlay and "Take Control" button no longer appear under any circumstances. The banner was designed for an unfinished mobile-link feature but incorrectly fired whenever a second browser tab opened the same Forge instance. Removed all related state (`isActiveDevice`, `bannerTimerRef`, `keyboardHeightOffset`), the `CONTROL_TRANSFERRED`/`CONTROL_GRANTED` WebSocket message handlers, and the `visualViewport` keyboard-height listener from `ForgeTerminal.jsx`. The underlying Go handoff logic in `hub.go` is preserved for future use.
- **Release script R2 upload**

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
