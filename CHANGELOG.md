# Changelog — ToolBox

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Code Tutor launch crash** (`CodeTutorPanel.jsx`): Three module-level constants (`CATEGORY_ORDER`, `CATEGORY_META`, `STATUS_ICONS`) were referenced throughout the component but never declared, causing an immediate `ReferenceError: CATEGORY_ORDER is not defined` on every app load. Defined all three constants with values that mirror the backend's category order and file-status enums (`internal/tutor/types.go`, `internal/tutor/scanner.go`). Also fixed two related bugs where the unknown-category fallback used `'Docs'` (capitalised) instead of `'docs'`, which would have silently dropped files with unrecognised categories.

### Added
- **Code Tutor wizard UX** (`CodeTutorPanel.jsx`, `useTutorSession.js`, `internal/tutor/explainer.go`, `cmd/forge/handlers_tutor.go`): Complete redesign of the Code Tutor panel into a fullscreen centered modal with a guided wizard experience:
  1. **Fullscreen modal**: panel opens as a centered `min(980px,96vw)` × `min(88vh,920px)` overlay — terminal keeps running behind it, backdrop click to dismiss.
  2. **Wizard mode**: when auto-explain triggers, panel opens directly in wizard mode showing only the changed files as pill selectors, then immediately presents the explanation — no file tree to navigate.
  3. **Browse mode**: manually opened panel shows a 220px file list alongside the explanation area for browsing all project files.
  4. **Inline Q&A**: every explanation ends with a question input; user can ask any question about the current file. Backend routes `POST /api/tutor/explain` to `AnswerQuestion()` when a `question` field is present (never cached — questions are unique). Questions and answers replace the main explanation in-place.
  5. **Section cards**: each explanation category (Why Changed, Key Concepts, etc.) renders as a full-width card — no collapsible sections, no wall of text.
  6. **Wizard footer actions**: "Dive Deeper" re-queries LLM at `depth:deep`, "Next File" advances the wizard, "Got It / Skip" marks reviewed and advances. Changed-file pills allow jumping directly to any modified file.
  7. **Mode toggle**: header buttons let users switch between Wizard and Browse views at any time.
- **Code Tutor full automation**(`CodeTutorPanel.jsx`, `useTutorSession.js`, `App.jsx`): Code Tutor now auto-detects the active project, starts the file watcher automatically, and explains changed files without any manual interaction. Three new behaviours:
  1. **Auto-session**: when the foreground tab's working directory changes, Code Tutor creates or resumes a live-mode session for that project (400ms debounce for rapid tab switching).
  2. **Auto-explain**: when the watcher reports file changes, Code Tutor immediately calls the LLM explainer for the current file. A 15-second cooldown prevents call storms during rapid saves.
  3. **Auto-open panel**: when an auto-explanation completes, the Code Tutor panel opens automatically and shows a `📚 Code Tutor: <filename> explained` toast (4s). The panel surfaces itself only when there is something to show — not on every tab switch.
  Also: `liveMode` now defaults to `true` for new manually-created sessions, and `createSession('live')` correctly enables live mode even when resuming an existing session that had `liveMode:false`.
- **Toast confirmation when macro payload fires** (`App.jsx`): `handleExecute` now shows a `⚡ Macro injected: [card name]` success toast (3s auto-dismiss) whenever a command card with a `macro_payload` is executed. Previously there was no visual distinction between a plain card execution and one that auto-injected a follow-up prompt — users had no way to confirm the macro fired without scrolling to the top of the session.

### Fixed
- **TDZ crash on Code Tutor panel render** (`CodeTutorPanel.jsx`): `ReferenceError: Cannot access 'currentFile' before initialization` (minified as `'ee'`) occurred whenever the Code Tutor panel opened. Root cause: the "Derived data" `const` declarations (`files`, `currentFile`, `isLive`, etc.) were placed *after* a `useEffect` whose dependency array immediately evaluated `currentFile` — a JavaScript Temporal Dead Zone violation. Fixed by moving the entire derived data block to before the first `useEffect` hook.
- **Macro injection now uses quiescence detection instead of fixed delay**(`ForgeTerminal.jsx`): `scheduleMacroInjection` watches the WebSocket stream and injects the payload as soon as terminal output stops for 800ms — reliably signalling the CLI is at its input prompt. The `macro_delay` field becomes a safety-net ceiling (not a fixed wait), so injection is fast on quick machines and reliable on slow or high-latency ones. A 500ms startup floor prevents premature injection during the initial command-echo burst. Updated fallback ceilings: `copilot-workflow-enforce` → 6000ms, `copilot-fresh` / `copilot-resume` → 5000ms.
- **Macro payload injection (workflow enforcement via command cards)**: `sendCommand()` in `ForgeTerminal.jsx` now accepts `macroPayload` and `macroDelay` parameters. After a command launches, Forge automatically injects the payload text as the agent's first message after a configurable delay (default 2000ms). This is the mechanism that enforces the enterprise workflow end-to-end — the command card fires the injection, not the user.
- **Copilot (Workflow Enforced) command card** (`command-cards/copilot-workflow-enforce.json`): new card with the strongest enforcement macro — explicitly names the full skill chain (`workflow-enforcer → enterprise-workflow → code-quality → branching-strategy → code-tutor-workflow`) and instructs the agent not to write any code until all skills are loaded.
- **Updated Copilot (Fresh) and Copilot (Resume) command cards**: replaced the old comment-block payload with a real instruction prompt that directs Copilot to read `AGENTS.md` and invoke `skill: workflow-enforcer` before any code work. Macro delay increased to 2000ms for reliability.
- **Agent Enforcement Explainer in WorkflowWizard**: new `AgentEnforcementExplainer` component rendered in the Review & Apply step (both preview and success states). Shows a 5-step visual chain explaining how a single command card click triggers the full workflow enforcement cascade automatically — no manual steps required.

### Fixed
- **New tab inherits deep CWD from current tab** (`App.jsx`, `projectFolder.js`): new tabs no longer inherit the active tab's full working directory path. `handleNewTab` now uses the new `extractProjectRootPath()` utility to trim the inherited path to the project-root level (first child of the configured root folder) before passing it to `createTab`. If no root folder is configured, new tabs start at the server's default working directory. Prevents tab names like "invoke" or ".bin" caused by inheriting a deep subdirectory path.
- **AI enforcement command cards missing for existing users** (`internal/commands/migration.go`): the three AI workflow enforcement cards (🤖 Copilot Fresh ID 6, 🔄 Copilot Resume ID 7, 🛡️ Copilot Workflow Enforced ID 8) were only seeded on first run. Existing users never received them. `MigrateCommands` now auto-injects any missing enforcement cards and upgrades the stale comment-block `MacroPayload` (e.g. `# SYSTEM INJECTION`) to the real natural-language enforcement prompt — all on the next `GET /api/commands` request, with no user action required.

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
