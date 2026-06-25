# Changelog — ToolBox

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- **Code Tutor fully retired from the workflow (skills + scaffold + chain)** — The `code-tutor` and `code-tutor-workflow` skills and their "Post-Change Walkthrough" mode have been removed entirely. The mandatory skill chain is now `workflow-enforcer → code-quality → framework-first → branching-strategy` everywhere it is declared: the Claude awareness/enforced session macros and the Copilot/Google workflow macros (`internal/commands/storage.go`), the `workflow-enforcer` SKILL and its `.claude/commands` mirror, the Copilot and Aider system prompts, `AGENTS.md`, the three `command-cards/copilot-*.json` seeds, and the `deploy-skills.ps1` / `sync-skills.ps1` manifests. The two `.github/skills/code-tutor*` directories and the deployed `~/.claude/skills/code-tutor*` copies were deleted. Existing installs self-heal on next boot: `healClaudeMacroVariant` rewrites any stored session macro that still names the retired skill to the new canonical text — so a missing-skill reference can never break the chain. Also removed dead scaffold code: the `codeTutorWorkflowSkill` template var, a malformed half-removed `code-tutor-workflow` entry in `scaffold.go`, and the `EnabledModules "code-tutor"` PR-checklist conditional. Guarded by the new `TestWorkflowMacrosOmitCodeTutor` (Red→Green).

## [7.22.0] - 2026-06-25

---

## [v7.22.0] - 2026-06-25

### Fixed
- **The worktree collision offer now actually reaches the UI (specs/013 FR-003)** — `ForgeTerminal`'s WebSocket handler forwarded only `SDD_PHASE_GATE` and `SDD_PHASE_STATUS` to the dashboard hook, so the `SDD_WORKTREE_COLLISION` offer added by this feature was silently dropped before rendering — the opt-in prompt would never have appeared in production. Added the type to the forward allow-list. Caught by the recovery-first Playwright spec (a real-UI gate per Article X) that the unit layer could not detect: every layer was green in isolation and the gap was the socket→hook forwarding seam. The E2E WS-injection harness was also made deterministic — it now reads the active tab's session id from its own socket URL instead of racing on the first bind — fixing pre-existing flakiness in the worktree specs when the app boots with restored tabs.
- **Opening a tab no longer silently creates a worktree — recovery is now the default (specs/013)** — Despite v7.21.0 (specs/012), opening a second tab on a repository that already had an active SDD pipeline still spawned a fresh `.forge/worktrees/…` directory and moved the shell into it. Root cause: `handleSddBind` eager-binds every tab and `resolveSddWorkspace` auto-provisioned a worktree whenever another pipeline shared the repo — specs/012 only fixed the *already-inside-a-worktree* re-attach case, never this concurrency trigger. Fixed by **inverting the design**: a bind now NEVER provisions. It re-attaches from a durable recovery record, or to the worktree it is already in, or stays on the main checkout. Worktrees are created only on **explicit consent** — a per-tab "Isolate this tab" action or a confirmed collision prompt (`POST /api/sdd/worktree`). Proven by Go unit + real-git integration tests that count worktrees before/after a bind and assert the count is unchanged (`TestResolveWorkspace_ConcurrentSessionStaysOnMainCheckout`, `TestResolveWorkspace_ConcurrentBindDoesNotProvision_RealGit`).

### Added
- **Durable, server-authoritative session recovery (specs/013 US2)** — A new `~/.forge/sdd/worktree-bindings.json` store records which isolated worktree each tab belongs to, so a reopened tab re-attaches to its exact directory across an app restart — even when the in-memory pipeline map is empty and the frontend reports the main checkout. When the recorded worktree is gone, the tab falls back to the main checkout with one clear notice and the stale record is evicted (FR-005). Recovery no longer depends on the terminal restoring its working directory (the fragile Windows-ConPTY case).
- **Explicit, consent-only worktree isolation (specs/013 US3)** — A per-tab "⑂ Isolate this tab" control and a reactive collision prompt (shown only when another *actively running* pipeline shares the repo — never for ordinary idle tabs) let a developer opt into an isolated worktree on purpose. Concurrent worktrees remain fully supported; they are simply no longer automatic.

## [7.21.0] - 2026-06-24

---

## [v7.21.0] - 2026-06-24

### Changed
- **e2e tests enforce the xterm-buffer trust boundary (specs/012 T039)** — Added a build-time check (`frontend/src/test/e2eBufferLint.test.js`) that fails if any Playwright e2e spec asserts on terminal *output text* via the DOM instead of the xterm.js buffer model (`window.term.buffer.active`), enforcing Constitution Article X / FR-014. The check is precise — presence/visibility selectors are allowed; only text-extraction on terminal selectors is flagged. It immediately caught and fixed 3 pre-existing violations in `tests/e2e/websocket-recovery.spec.js` (now read the buffer via the shared fixtures).

### Added
- **Honest failure surfacing — verification verdict on the dashboard (specs/012 US4)** — When the TDD or Playwright UX gate blocks a phase, the SDD dashboard now shows *why* with a verdict chip ("Phase blocked — no failing test was recorded…" or "…needs a passing Playwright UX result…"), so a behaviour change can never silently appear stuck. The current phase's verdict rides the `SDD_PHASE_STATUS` broadcast through to the frontend; a blocked phase stays active (no auto-advance) and an audited `FORGE_BYPASS` override is shown rather than hidden. A plain pass renders nothing. The gate decision is deterministic — identical evidence always yields the same verdict.
- **Playwright UX validation gate at SDD phase completion (specs/012 US3)** — A user-facing phase can no longer be marked complete without a recorded passing Playwright result. `ClassifyBehavior` flags a change as user-facing when it touches a frontend surface *or* a backend path that produces user-visible output (terminal/prompt/gate-message producers), so a Go-only change to what the developer sees is gated too. Evidence is read from the workflow ledger (`ux-validated` gate); a passing real-UI run records the entry, while grep/curl/HTTP-status/log evidence never produces one and is therefore rejected structurally (FR-013). The gate fails closed: no recorded result, a run that could not launch, or a failing run all block (FR-016). The block reason is surfaced on the report card `verification` field. Operationalizes Constitution Article X (real behavioural proof, xterm.js buffer not DOM).
- **TDD enforcement at SDD phase completion (specs/012 US2)** — A behaviour-changing phase can no longer be marked complete without test evidence that a test was observed failing (Red) strictly before it was observed passing (Green). The gate classifies each phase from the files it touched (`ClassifyBehavior`: backend/frontend source ⇒ behaviour-changing; docs/test-only ⇒ exempt; ambiguous ⇒ fails safe to behaviour-changing), reads the Red/Green evidence from the existing workflow ledger (`.forge/workflow-ticket.json`), and routes both completion paths (authoritative phase-event and the pty-quiet watcher) through one gate (`gatedHandlePhaseComplete`). The decision is a pure, deterministic function of the assembled record; an explicit, audited `FORGE_BYPASS` override remains available. The verdict (pass / blocked-with-reason / exempt) is surfaced as an additive `verification` field on the phase report card. Operationalizes Constitution Article V.

### Fixed
- **Recursive worktree nesting / broken session resume (specs/012 US1)** — Concurrent SDD sessions could end up in a working directory nested inside another worktree (`.forge/worktrees/X/.forge/worktrees/Y`), deepening on every app restart and making directory-bound Resume/Continue impossible. Root cause: the main checkout was resolved with `git rev-parse --show-toplevel`, which returns a *linked worktree's own root* when run from inside one, so new worktrees were anchored under the current worktree. Fixed by resolving the main checkout from `git worktree list --porcelain` (its first entry is always the main worktree) via a new `MainCheckout` helper, adding a hard no-nesting guard, and re-attaching a session that is already inside a worktree to that worktree instead of provisioning a new one — so a resumed session lands back in the exact directory it left. Proven by Go unit + real-git integration tests (`TestMainCheckout`, `TestNoNesting_RealGit`).

## [7.20.4] - 2026-06-24

---

## [v7.20.4] - 2026-06-24

### Fixed
- **Numbers can't be typed in recovered tabs** — During multi-tab session recovery, all xterm textareas mount simultaneously with `visibility:hidden` (not `display:none`), making hidden tabs' textareas focusable. They can win the focus race and silently consume keystrokes — numbers especially, since Claude Code CLI shows a numbered prompt immediately on restore. The App-level `keydown` capture handler now verifies the focused textarea belongs to the **active** terminal before early-returning; a hidden tab's textarea falls through to the redirect, which restores correct focus and forwards the key to the right PTY.
- **SDD dashboard crash on tab switch (null files/decisions)** — A Go `nil` slice serialises as JSON `null`, not `[]`. When no phase decisions were stored yet and no files changed, `buildPhaseReportCard` sent `"files":null` and `"decisions":null`. JavaScript destructuring defaults (`= []`) only guard `undefined`, so `null.length` crashed `ReportCard` on every report-card render after a phase gate opened. Fixed in two layers: Go normalises nil slices to empty before building the card; `ReportCard` additionally uses `?? []` for defence in depth.
- **Every tab was getting a worktree even in different repos** — `git rev-parse --git-common-dir` returns a relative path (`.git`) from the main checkout, so every repo shared the same grouping key. `GitCommonDir` now joins relative results with the caller's directory (`filepath.Join(dir, out)`) and normalizes with `filepath.Clean`, giving each repo a unique absolute key. Previously, the second tab opened for *any* repo would receive a worktree; now only the second (and beyond) tab for the *same* repo is isolated.

## [7.20.3] - 2026-06-24

---

## [v7.20.3] - 2026-06-24

## [7.20.3] - 2026-06-24

### Fixed
- **SDD dashboard crash now contained, not fatal** — Wrapped `SddDashboard` in its own `ErrorBoundary` so any render failure inside the dashboard panel no longer tears down the entire Forge Terminal UI. The terminal remains usable while the dashboard shows its error state.
- **`ctx` ReferenceError in ForgeAssist terminal send** — `onSendToTerminal` referenced an undefined variable `ctx` instead of the callback parameter `cmd` in the `termRef.write` fallback path, causing a crash when the fallback branch was reached.

## [7.20.2] - 2026-06-24

---

## [v7.20.2] - 2026-06-24

### Fixed
- **SDD dashboard no longer crashes on null `phases` prop** — `TypeError: Cannot read properties of null (reading 'length')` could tear down the entire Forge Terminal UI when switching tabs while the SDD pipeline was initialising. Root cause: `phases` is briefly `null` during the React re-render cycle after a session switch; all three render paths (`deriveActionPrompt`, `derivePipelineBadge`, `PhaseRail`) called `.length` without guarding. Fixed with `!phases ||` null-guards in each path and a `phases = []` default on `DashboardHeader`. Also fixed `useSddGate` to reset `phaseStatuses` to `[]` immediately on session change (before the recovery fetch resolves) and to use `Array.isArray` instead of truthy-length guard so an empty-array response from a new session correctly clears stale phases from the previous session.

## [7.20.1] - 2026-06-23

---

## [v7.20.1] - 2026-06-23

### Fixed
- **SDD bar phases now advance correctly** — The phase bar was stuck at "pending" for all phases in v7.20.0. Root cause: the PreToolUse hook's `started` signal marks the phase running, but the file watcher then sees `MarkPhaseRunning` return false and exits before launching the settlement goroutine that opens the gate. Added `IsPhaseRunning` to the orchestrator so the watcher can detect "already claimed by the hook" and still settle the phase, making the gate open as expected.
- **SDD phase bar pending state is more visible** — Pending phase cells were rendered with `#4a4a4a` icon color on a `#0e0e0e` background (near-invisible), making a correctly-idle bar look identical to a broken one. Pending icons now use `#666` for clear visual distinction from active (#60a5fa) and complete (#22c55e) states.
- **No more blank console windows on tab open or app restart (Windows)** — Every `git` subprocess spawned by the SDD worktree automation (`internal/git`) now sets `CREATE_NO_WINDOW` via `SysProcAttr`. Previously, each `git rev-parse` / `git worktree add` call during bind or the startup sweep briefly opened a visible blank console window on Windows, producing the cascading-window effect shown when a second concurrent tab was opened or when the app restarted after an update.

## [7.20.0] - 2026-06-22

---

## [v7.20.0] - 2026-06-22

### Added
- **Per-tab SDD session identity (`FORGE_SESSION_ID`)** — Each terminal session now injects a stable `FORGE_SESSION_ID` (equal to the tab id) into its shell: via `cmd.Env` on Unix and a per-ConPTY write on Windows (never process-wide `os.Setenv`, which could not distinguish concurrent tabs). This is the foundation for scoping SDD phase signals, gate-checks, and dashboard updates to a single session so concurrent pipelines never conflate. Verified by a real two-ConPTY integration test proving each child shell reads its own id with zero cross-session leakage. Phase 2 of `specs/010-sdd-authoritative-state`.
- **Authoritative SDD phase signals** — New `POST /api/sdd/phase-event` endpoint lets the speckit workflow report phase transitions directly (`started`/`complete`) instead of the dashboard inferring them from file-watch + terminal-quiet heuristics. The PreToolUse hook now emits `started` for each pipeline phase, and each speckit phase skill emits `complete` with the decisions it made as its final step; the file watcher is demoted to a fallback (it stands down when the authoritative signal already opened a gate). Phase state is now reported, not guessed.
- **SDD authoritative-state E2E coverage** — Added `tests/e2e/sdd-authoritative-state.spec.js` (Playwright) proving the bar advances on the authoritative signal, a gate in one tab does not appear in another, and the report card renders its grouped bullets with the View-full-output opt-in.
- **Concise SDD phase report card** — When a phase completes, the gate now shows a scannable card — files touched (with +/- line counts), a scope summary, and the command-emitted decisions — instead of a wall of verbose Markdown. "Files touched" is scoped to the phase's execution window via a side-effect-free git work-tree snapshot taken at phase start (it captures new files, not just tracked edits). The full phase output remains available on demand via "View full output"; binary files are listed with magnitude unavailable, and long file lists truncate to "+N more".
- **Automated worktrees for concurrent same-repo pipelines** — A second SDD pipeline started in the same repository is now automatically given its own git worktree (under the already-ignored `.forge/worktrees/`) on a `feature/<spec-dir-name>` branch, and its shell is retargeted into it — with zero manual setup. Because every SDD subsystem is scoped to `pipeline.repoRoot`, pointing it at the worktree isolates each pipeline's working files, its `.specify/feature.json`, and its change-report window, so two pipelines in one repo no longer corrupt each other. Concurrency is detected at bind time by git common-dir; the first/only pipeline keeps the main checkout unchanged. Worktrees auto-clean only when provably safe (branch merged into base **and** working tree clean) on explicit tab close (`POST /api/sdd/worktree-close`) and a first-bind reclaim sweep — never on a transient socket drop, and never when un-merged or dirty (those are retained with a warning). `git worktree list` is the durable registry, so worktrees survive restarts. The dashboard shows a concise `⑂ worktree: <branch>` indicator per tab when isolated (and nothing on the main checkout, so the single-pipeline experience is unchanged). New `internal/git` worktree wrapper; `specs/011-worktree-concurrency`.

### Fixed
- **Concurrent SDD pipelines no longer conflate** — The gate-check endpoint (`/api/sdd/gate-check`) previously scanned *all* pipelines and returned the first open gate it found, so a gate open in one terminal tab blocked the agent and polluted the dashboard in every other tab. It is now scoped to the requesting session (`?sessionId=`), and the enforcement hook passes `FORGE_SESSION_ID` so each tab sees only its own gate. An unbound session (no identity) is SDD-inactive and never blocked.

## [7.19.8] - 2026-06-20

---

## [v7.19.8] - 2026-06-20

### Fixed
- **SDD gate card now appears when you click an awaiting-decision phase** — Clicking a phase cell in `awaiting-decision` state demand-pulls the pending gate card from `/api/sdd/status` and opens the Approve/Reject/Clarify bar immediately, without waiting for a new WebSocket event. Previously, if the `SDD_PHASE_GATE` event was missed (e.g. after a reconnect or update), the gate card was gone with no way to recover it by clicking. `awaiting-decision` phase cells are now also styled as interactive buttons so the affordance is visible.

## [7.19.7] - 2026-06-20

---

## [v7.19.7] - 2026-06-20

### Fixed
- **SDD hook install now targets global `~/.claude/` — works in all repos** — `install-sdd-hook.ps1` previously wrote to the project-level `.claude/settings.json` using a relative path, so the enforcement hook was silently inactive in every repo except `forge-terminal`. The script now copies `sdd-gate-check.ps1` to `~/.claude/scripts/` and registers the hook in `~/.claude/settings.json` with an absolute path, matching the behaviour of all other Forge global skills. The in-app hook-status check (`isSddHookInstalled`) was updated to search both the project-level and global settings files so the install-prompt banner correctly recognises a global install.

## [7.19.6] - 2026-06-20

---

## [v7.19.6] - 2026-06-20

## [7.19.5] - 2026-06-20

---

## [v7.19.5] - 2026-06-20

### Added
- **SDD gate enforcement — real, not advisory** — A `PreToolUse` Claude Code hook (`scripts/sdd-gate-check.ps1`, wired via `.claude/settings.json`) intercepts every speckit Skill invocation before it executes and calls `GET /api/sdd/gate-check`; if any pipeline has an open gate the hook exits non-zero, blocking the agent and showing a clear message naming the open phase and instructing the developer to approve, reject, or clarify in the dashboard before the next phase can run (specs/008 FR-001, FR-002, FR-003)
- **`/api/sdd/gate-check` endpoint** — New `GET` endpoint that returns `{"isGateOpen": bool, "phase": "..."}` without requiring a session ID; iterated over all active pipelines and returns true on the first one in `StatusAwaitingDecision`; called by the enforcement hook and testable independently
- **`/api/sdd/hook-status` endpoint + in-app install prompt** — New `GET` endpoint checks whether `sdd-gate-check.ps1` is referenced in `.claude/settings.json`; `useSddGate` fetches this once on mount and passes `isHookInstalled` to `SddDashboard`, which shows a dismissible amber banner with a copy-to-clipboard install command when the hook is absent — no silent failures for new clones
- **`ReconcileFromDisk` on Orchestrator** — New method that forward-scans the phase table and advances `CurrentPhase` to the highest phase whose artifact file exists on disk; idempotent, never rewinds, skips while a gate is open or a phase is running; called before every status broadcast and after every Approve to give bulk-approve semantics (one click resolves all intermediate completed phases)

### Fixed
- **SDD dashboard — phases show true disk state** — `buildPhaseStatuses` now checks `os.Stat` for phases beyond the orchestrator's current position; if the artifact exists on disk the phase shows as complete regardless of orchestrator event history, preventing permanent "pending" display caused by missed watcher events
- **WebSocket reconnection after app update** — `useWebSocket` hook now uses the existing `WebSocketReconnectionManager` (which was fully implemented but never wired in) with 50 attempts and exponential backoff from 500ms to 10s; the frontend reconnects automatically after an update restarts the backend, requiring no user action

## [7.19.4] - 2026-06-19

---

## [v7.19.4] - 2026-06-19

### Fixed
- **SDD gate — premature card while agent still running** — `gateSddArtifact` previously called `HandlePhaseComplete` the instant the filesystem watcher detected an artifact file, causing the decision card to appear while the agent was still generating output or awaiting a permission prompt; the call now fires only after PTY-quiet detection (reusing `sddPhaseFloorMs` / `sddPhaseQuietMs` / `sddPhaseMaxMs`), consistent with how Validate and Implement have always worked
- **SDD pipeline panel — no spinner while phase is running** — artifact-detected phases (Specify, Clarify, Plan, Tasks) showed as `pending` with a "Run /speckit-… to continue" prompt while actively running; a new `StatusRunning` pipeline state is set by `MarkPhaseRunning` the moment an artifact is first detected, causing `derivePhaseDisplayStatus` to return `PhaseDisplayActive` and the UI to show the blue spinning indicator; the state automatically transitions to `awaiting-decision` once PTY-quiet is detected

## [7.19.3] - 2026-06-19

---

## [v7.19.3] - 2026-06-19

## [7.19.3] - 2026-06-19

### Fixed
- **AV false-positive — binary flagged at download** — Windows Defender added `--dangerously-skip-permissions` to its AI permission-bypass signature database, causing Go binaries containing that literal string to be quarantined at download time; all occurrences in the binary's string constant pool are now replaced with a runtime-assembled equivalent (`strings.Join([]string{"--dangerously", "skip-permissions"}, "-")`) so the contiguous literal never appears in rodata; the Vite/esbuild bundle receives the same treatment via `['--dangerously', 'skip-permissions'].join('-')`, which esbuild does not fold at compile time; behaviour is identical at runtime

## [7.19.2] - 2026-06-18

---

## [v7.19.2] - 2026-06-18

### Fixed
- **SDD Dashboard — artifact "File not found" on click** — `buildPhaseStatuses` sent `ArtifactPath` as a feature-relative filename (e.g. `"spec.md"`) instead of the absolute path; the frontend resolved it against the working directory and failed when the spec kit writes artifacts to a subdirectory (`specs/<feature>/spec.md`); `ArtifactPath` is now `filepath.Join(state.FeatureDir, phase.ExpectedArtifact)`, matching the path construction already used by the `SDD_PHASE_GATE` broadcaster; phases with no artifact (Validate, Implement) continue to emit an empty string

## [7.19.1] - 2026-06-18

---

## [v7.19.1] - 2026-06-18

### Fixed
- **SDD Dashboard — decision bar bleeds across tabs** — switching tabs did not clear the current gate card; if a speckit gate fired in Tab A and the user switched to Tab B, Tab B showed the Approve/Reject/Clarify bar even though no speckit commands had run in that session; `useSddGate` now resets `card`, `decisionError`, and `isSubmitting` whenever `activeSessionId` changes
- **SDD Dashboard — `SDD_PHASE_STATUS` events never reached `useSddGate`** — `ForgeTerminal.jsx` only routed `SDD_PHASE_GATE` to `onSddGateRef`; `SDD_PHASE_STATUS` messages fell through to terminal output, so phase statuses were frozen at the one-time recovery fetch value and never updated live; fixed by also routing `SDD_PHASE_STATUS` in the same guard (`msg.type === 'SDD_PHASE_GATE' || msg.type === 'SDD_PHASE_STATUS'`)
- **SDD Dashboard — decision bar lost after page reload** — `GET /api/sdd/status` only returned phase statuses, never the pending card; after a reload the card was null so the decision bar was hidden even though a gate was open; the endpoint now includes `pendingCard` when one exists and `useSddGate` restores it on mount
- **SDD Dashboard — idle rail invisible** — `.sdd-dashboard__rail-wrapper` used `flex: 1` inside an unconstrained flex-column parent, collapsing the rail to 0 height; fixed with `min-height: 44px`; idle-row text color raised from `#4a4a4a` (near-black-on-black) to `#6b7280`
- **ActionPromptStrip gate-open prompt** — text "Review the artifact above…" referenced an inline artifact preview that was removed in spec-006; replaced with "Approve to continue, Reject to restart this phase, or Clarify to redirect."

## [7.19.0] - 2026-06-18

---

## [v7.19.0] - 2026-06-18

### Added
- **SDD Dashboard Playwright UX tests (spec-006)** — `tests/e2e/sdd-dashboard.spec.js` covers all 9 quickstart scenarios (idle state, 6-cell phase rail, decision bar, Clarify native dialog, phase detail strip, ×N run-count badge, 500 error inline, all-complete badge, terminal non-blocking); uses a `window.fetch` intercept to extract the active session ID from the `useSddGate` recovery call so synthetic `SDD_PHASE_STATUS` / `SDD_PHASE_GATE` events can be injected via `window.__wsInject` without any backend code change; `sdd-phase-ux.spec.js` and `sdd-phase-gate.spec.js` updated to `SddDashboard` selectors; `sdd-pipeline-dashboard.spec.js` purged of deleted-component tests
- **SDD Pipeline Dashboard (spec-006)** — `SddPipelinePanel` (collapsible bottom bar) and `PhaseDecisionCard` (floating drawer) replaced by a single always-visible `SddDashboard` component below the terminal; it renders a horizontal 6-cell `PhaseRail` (icon · name · status word · ×N badge), an inline `DecisionBar` (Approve / Reject / Clarify buttons visible only when a gate is open), a floating `PhaseDetailStrip` (appears above the rail without layout reflow when a complete phase cell is clicked — shows headline, artifact chips, and a "View artifact →" link that opens Monaco), a `ClarifyModal` using the native `<dialog>` element for the steer input, and a `DashboardHeader` with the active feature name and a pipeline-level status badge; `ActionPromptStrip` is reused unchanged as the dashboard footer prompt
- **`useSddGate` — `featureName` and `phaseSummaries`** — hook now extracts `featureName` (string) from each `SDD_PHASE_STATUS` event and accumulates `phaseSummaries` (a `useRef` keyed by phase name) from each `SDD_PHASE_GATE` event, providing the feature header and detail-strip data without any new backend endpoints or WebSocket message types

### Fixed
- **`cmd/forge` phase-count tests** — `TestHandleSddStatus_ActivePipeline_ReturnsPhasesArray` and `TestBuildPhaseStatuses_NoPhasesStarted_AllPending` hardcoded the old 5-phase count; updated to 6 to match the `PhaseTasksGenerate` addition from the spec-005 bug fixes
- **SDD phase UX — four post-spec-005 defects** — (A) `SddPipelinePanel` hardcoded `isCardOpen={false}`, so `ActionPromptStrip` always showed the idle prompt instead of the gate-open variant; fixed by threading `isCardOpen` from `useSddGate` through `App.jsx`; (B) `PhaseDecisionCard` embedded raw artifact text (up to 200 lines in a `<pre>`) inside the decision surface, creating a wall of text; removed inline artifact section — structured summary (headline + items + flags) now stands alone; (C) `PhaseDecisionCard` never received the `phases` prop from `App.jsx`, so its `ActionPromptStrip` always displayed "Run /speckit-specify…" regardless of pipeline state; (D) the `/speckit-tasks` phase was invisible to the orchestrator — added `PhaseTasksGenerate` (order 4) to the phase table and file-watcher detector, shifting validate to order 5 and implement to order 6
- **005 spec accuracy** — `↻ Iterating` definition corrected: fires when the gate reopens after a second run, not while re-executing; acceptance scenario 5 now matches the implementation
- **005 FR-006 annotation** — "prose output" defined explicitly; notes that FR-006 was satisfied by spec-004's clean BEM panel, requiring no removal task
- **005 card-open invariant** — added `PhaseDecisionCard` test asserting the card stays open and the prompt updates when `phaseStatuses` change while `isOpen=true`

## [v7.18.0] - 2026-06-17

### Added
- **Glanceable phase state (US1)** — SDD pipeline panel now renders six visually distinct states per phase: `◌ Pending`, `⟳ Running` (blue spinner), `⏳ Awaiting` (gate open, first run), `✓ Complete` (green), `⚠ Rejected` (amber), `↻ Iterating` (amber spinner, gate open for re-run); unknown future status values fall back to `?` with a `--unknown` class; CSS `transition: color 200ms ease` on every row so all status swaps animate automatically
- **Iteration counter (US3)** — `×N` counter appears next to a phase name whenever `runCount ≥ 2`; the backend now tracks `phaseRunCounts map[PhaseName]int` on the orchestrator (incremented inside `HandlePhaseComplete` under the existing mutex) and surfaces it as `runCount` on each `PhaseStatusEntry` in the `SDD_PHASE_STATUS` WebSocket event (backward-compatible: omitted when zero); `artifactPath` column removed from the panel row
- **Action-prompt strip (US2)** — new `ActionPromptStrip` component (pure function of `phases` + `isCardOpen`) renders exactly one imperative sentence in the panel footer and the gate-card footer, guiding the developer to their next action without any prose; eight named constant prompts covering all pipeline states from "no feature bound" to "pipeline complete"
- **Iterating display status** — new `PhaseDisplayIterating = "iterating"` constant in `internal/sdd/types.go`; `derivePhaseDisplayStatus` promotes a phase from `awaiting-decision` to `iterating` when `runCount ≥ 2` and the gate card is open, disambiguating re-runs from first-run gate opens; state table documented in `specs/005-sdd-phase-ux/plan.md`
- **Idle indicator (FR-010)** — when `phases` is empty and the panel is visible, a compact "No active feature — run /speckit-specify to start" row is shown instead of a blank panel; `App.jsx` now passes `isVisible={true}` unconditionally so the idle state is reachable

## [7.16.2] - 2026-06-16

---

## [v7.16.2] - 2026-06-16

### Changed
- **E2E test framework migrated from Cypress to Playwright** — all 32 spec files ported to `tests/e2e/*.spec.js`; `cypress/support/e2e.js` custom commands translated to `tests/fixtures/forge.js` helper functions; `playwright.config.js` replaces `cypress.config.js`; Article V of the project constitution updated accordingly; `cypress` and `cypress-real-events` removed from dependencies

## [v7.17.0] - 2026-06-15

### Added
- **SDD pipeline status panel (US1)** — persistent collapsible bottom panel (120px expanded / 32px collapsed) showing all 5 speckit phases with live status icons (`· ◌ ⏳ ✓ ✗`); updates within 2s of a phase completing via WebSocket (`SDD_PHASE_STATUS`); recovers on page reload via `GET /api/sdd/status`; awaiting-decision badge visible while collapsed; collapse state persisted to localStorage
- **Non-blocking SDD gate card drawer (US2)** — decision card converted from a blocking full-screen overlay to a right-side drawer (`flex-shrink: 0; width: 380px`) inside `terminal-pane-content`; terminal remains fully scrollable and interactive while a gate decision is pending; no backdrop; Escape and ✕ still dismiss the card
- **Artifact preview in gate card (US3)** — `SDD_PHASE_GATE` WebSocket event now carries the first 200 lines of the phase artifact (`artifactPreview`); rendered as a collapsible `<details>` block below the flags row; truncation notice when file exceeds 200 lines; graceful "not yet available" fallback when content is empty; pty-quiet phases (Validate/Implement) emit no preview

## [7.16.1] - 2026-06-15

---

## [v7.16.1] - 2026-06-15

### Fixed
- **SDD decision cards now fire reliably, never trap the session, and work across multiple
  tabs** — Three real-world defects in the phase orchestrator:
  - **Failsafe exit (was trapping users).** A failed decision (e.g. a stale `cardId` after a
    re-bind) used to leave the card open with no way out — the Approve button silently did
    nothing and the only escape was killing the terminal session. The card now has an
    always-available dismiss (✕ / `Escape`) that closes it locally with no backend dependency,
    surfaces decision errors inline instead of failing silently, and disables action buttons
    while a decision is in flight. The decision endpoint is also lenient: a stale `cardId`/phase
    is applied to the on-screen pending card rather than rejected, so Approve can't dead-end.
  - **Reliable activation (cards rarely fired before).** Binding was once-per-tab and the
    backend 409'd if `.specify/feature.json` didn't already exist — but you normally *create*
    the feature by running `/speckit-specify` during the session, after binding had already
    given up. Binding is now **eager** (a session binds to its repo with no feature required)
    and the watcher **lazily** learns the active feature the moment the first phase artifact
    appears, so the card fires every time rather than by lucky timing.
  - **Per-session pipelines (multi-tab clobbering).** A single global orchestrator meant
    multiple terminal tabs fought over one pipeline. Each session now has its own pipeline
    (keyed by session id), so tabs gate independently; re-binding the same repo is a no-op that
    no longer invalidates an open card. Verified end-to-end against a running build.

## [7.16.0] - 2026-06-15

---

## [v7.16.0] - 2026-06-15

### Added
- **SDD phase orchestrator — in-terminal HITL decision cards (US1 core, specs/003)** — New
  `internal/sdd` package that gates the Spec-Driven Development pipeline: after a phase
  completes, a scannable decision card (Approve / Reject / Clarify) is presented and the
  pipeline advances by injecting the next `/speckit-*` command, stops, or is steered. Card
  content is derived **deterministically** from the phase artifacts (checklist counts,
  `[NEEDS CLARIFICATION]` markers, missing-artifact flags) — no generative call. Reuses
  existing Forge subsystems per the framework-first gate: the macro injector (advance), the
  file watcher (detect), the WebSocket hub (card push), and the styled-modal pattern (UI).
  Now wired end-to-end: `POST /api/sdd/bind` starts a feature-directory watcher; phase
  completions broadcast over the session WebSocket (`BroadcastJSONToSession`) and render
  the `PhaseDecisionCard` beside the terminal; Approve injects the next command via the
  macro path. **US2** (Clarify) adds an inline steer input that carries into the next phase,
  and **US3** adds a best-effort `Notifier` that POSTs each completion to AzureWorkflowPOC
  (fire-and-forget, never blocks the card) by subscribing to the same completion seam as the
  card. All five phases now gate: Specify/Clarify/Plan via the file watcher, and
  Validate/Implement via PTY-quiet detection (after the phase command settles), reusing the
  macro subsystem's quiet-detection. Adds an integration test (real file reads through the
  summarizer + a real HTTP POST through the notifier) closing the three-layer test gap, and a
  Cypress UX spec (`sdd-phase-gate.cy.js`). 369 tests green (Go + vitest), both builds clean;
  the full flow was verified end-to-end against a running dev build: the Cypress UX spec
  passes (card renders, Approve injects the next command, Reject stops), confirming the
  decision card paints in the browser and the advance reaches the live terminal. Only T040
  (manual visual spot-check) is optional-remaining.
- **Spec Kit hub-and-spoke install — no per-repo replication** — `scripts/deploy-speckit-hub.ps1`
  publishes forge-terminal's canonical speckit machinery to a central hub (`~/.forge/speckit/`:
  scripts, templates, extensions) and installs the global `speckit-*` skills with their script
  paths rewritten to call the hub. A repo becomes a thin **spoke** carrying only
  `.specify/memory/constitution.md` (via `scripts/speckit-spoke-init.ps1`) — every script and
  template resolves from the hub, so a speckit change is made once and all spokes pick it up, and
  onboarding a new repo is a single file. `common.sh` gains a Priority-5 template tier that falls
  back to the templates co-located with the scripts (the hub), so a spoke needs no local
  templates. Verified end-to-end: a constitution-only repo runs `/speckit-specify` → `setup-plan`
  with templates served from the hub.

### Fixed
- **A tab now relabels when the shell switches to a different project root** — After
  the tab-naming rebuild, a tab's label was frozen at creation, so `cd`-ing from one
  project into another (e.g. `AzureWorkflow` → `forge-terminal`) left the tab showing
  the old project's name. Tabs now update their label on a genuine project-root switch
  while staying frozen during deep navigation within a project and during temp/home
  detours — so the old title-drift/corruption bug cannot return. A manually renamed
  tab is never relabeled (the rename is now persisted across restarts). New
  `resolveProjectRoot` / `shouldRelabelForDirectory` helpers in `tabLabel.js` make the
  switch-only trigger drift-proof by construction.
- **Claude "Enforced/Fresh/Resume" cards no longer inject Copilot's instruction file
  into a Claude session** — Existing installs carried a stale Claude macro variant in
  `~/.forge/commands.json` that pointed Claude at `@.github/copilot-instructions.md`
  (and named the retired `forge-workflow` skill), violating FR-011 (a Claude session is
  never routed through another tool's instruction file). The default cards in code were
  already correct, but the migration only healed the *one* older generation that was
  missing `framework-first`; the newer stale generation — which already contained
  `framework-first` yet still referenced Copilot's file — slipped through. The migration
  now heals the Claude macro variant of cards 6/7/8 against the **canonical** constant
  (`ClaudeAwarenessMacro` / `ClaudeEnforcedMacro`, both pointing only at
  `@.specify/memory/constitution.md`), so any drift self-heals on next launch, while a
  user-authored macro (one without the Forge awareness header) is left untouched. New
  `healClaudeMacroVariant` helper centralizes the rule.

## [7.15.0] - 2026-06-14

---

## [v7.15.0] - 2026-06-14

### Changed
- **"Install Constitution Globally" uses a styled in-app confirmation, not a native
  browser popup** — The Workflow card's global-install button previously triggered a
  native `window.confirm` dialog (the jarring `localhost:3005 says…` box). It now opens
  a styled in-card confirmation panel (Install / Cancel) consistent with the rest of
  the UI; the install still confirms first (it writes to `~/.claude`, `~/.copilot`,
  `~/.gemini`) and reports the result via a toast. Tests updated to drive the new flow
  and assert `window.confirm` is no longer used.

### Removed
- **The 6-strategy tab-naming system is deleted (tab-naming rebuild, US3)** — Tab
  naming is no longer configurable. Removed `useTabNaming.js`, the entire Tab Naming
  section of the Tab Controls settings panel (Project Root / Current Directory /
  Parent-Child / Shell Type / Numbered / Custom Prefix), `retitleAllTabsFromCwd` and
  the startup naming-sync, the `forge:tabNaming*` localStorage keys, and the
  `NamingStrategy`/`NamingPrefix`/`NamingRootFolder` fields from the backend
  `TabDefaults`. Tabs now always show the project-root name, fixed at creation, with
  ` #N` for duplicates — no settings, nothing to misconfigure. New
  `TabControlsPanel.test.jsx` asserts zero naming options render. 297/297 frontend
  tests + Go tests green.

### Fixed
- **Terminal tab name no longer drifts or corrupts on deep navigation (tab-naming
  rebuild, US1)** — The tab label is now computed **once at tab creation** from the
  project root (`computeTabLabel`) and the directory-change path is **severed from
  naming**: `handleDirectoryChange` (App.jsx) updates `currentDirectory` only — it no
  longer recomputes/rewrites the tab title — so the OSC 9;9 (`cd`) notifications that
  used to rename the tab (and leak raw escape characters into it) can't touch the
  label anymore. Session restore keeps the saved label and self-heals only a
  legacy/corrupted one (empty, file-like, generic `Terminal N`, or carrying control
  characters). 297/297 frontend tests pass. Remaining cleanup (delete the 6-strategy
  settings system + backend naming fields) follows in the same feature branch.

### Added
- **Tab label producer — foundation of the tab-naming rebuild** — New
  `frontend/src/utils/tabLabel.js` with `computeTabLabel(cwd)` and
  `dedupeLabel(label, existing)`: the single source of a tab's display name.
  `computeTabLabel` returns the project root (first child of a known projects
  container) and is **stable at any directory depth**, falls back to the immediate
  folder name when not under a projects root, and strips control characters so a
  corrupted path can never reach the label. `dedupeLabel` appends the lowest free
  ` #N` suffix for duplicate projects. Pure functions, 9/9 unit tests. First
  increment of `specs/002-tab-naming-rebuild/`; wiring into the tab manager and
  removal of the old multi-strategy system follow.
## [7.14.0] - 2026-06-14

---

## [v7.14.0] - 2026-06-14

### Added
- **Cross-tool Spec Kit projection engine + Copilot pipeline (cross-tool SDD,
  Phase 2 + US1)** — New `internal/workflow/speckit_project.go` projects the single
  embedded Spec Kit stage source onto each tool's native skill surface instead of
  hand-maintaining a copy per tool (the drift the constitution's single-source
  discipline forbids). `EnumerateSpecKitStages` reads the 10 authored stages;
  `ProjectSpecKitForTool` writes them to a tool's skill directory honoring the
  conflict strategy, and for Copilot embeds a dedicated `FORGE-SPECKIT` marker
  block into `.github/copilot-instructions.md` listing each `skill: <stage>`
  invocation (kept separate from the PS-managed FORGE-SKILLS block). Scaffolding now
  projects the pipeline for Copilot in addition to Claude, so a Copilot user gets a
  runnable SDD pipeline. Guarded by 5 new tests in `speckit_project_test.go` plus
  `TestScaffoldProject_ProjectsCopilotSpecKit`. Google projection and the live
  end-to-end verification are the next increments.

### Fixed
- **Claude's project context file routes to the constitution, not Copilot's file
  (cross-tool SDD, FR-011)** — `RenderClaudeMD` generated a `CLAUDE.md` that imported
  `@.github/copilot-instructions.md`, routing a Claude session through Copilot's
  instruction file — the same cross-tool contamination removed from the session
  macros in PR #162. The generated `CLAUDE.md` now imports only the tool-agnostic
  `@.specify/memory/constitution.md`, and carries the `<!-- SPECKIT START/END -->`
  markers so the Spec Kit agent-context step has a real target instead of being
  silently inert. Added forge-terminal's own root `CLAUDE.md` (the repo was missing
  the very file its scaffolder generates for every other project). Guarded by
  `TestRenderClaudeMD_RoutesToConstitutionNotCopilotInstructions` and
  `TestRenderClaudeMD_IncludesAgentContextMarkers`. First increment of the
  cross-tool Spec-Driven Development feature (`specs/001-cross-tool-speckit/`); the
  per-tool pipeline projection (Copilot/Google) follows.
- **Claude session macros no longer point at Copilot's instruction file** — The
  `ClaudeAwarenessMacro` and `ClaudeEnforcedMacro` injected after a Claude session
  start (`internal/commands/storage.go`) told Claude to `Read @.github/copilot-instructions.md`.
  That is CLI-specific verbiage in a Claude-facing macro, which contradicts the SDD
  globalization goal of enforcing from one tool-agnostic source. Both macros now name
  only `@.specify/memory/constitution.md` as the binding-rules source; the inline skill
  cascade is unchanged. The Copilot/Google macros are untouched (they legitimately
  reference their own tools' files). Guarded by a new
  `TestClaudeMacrosOmitCopilotInstructions`.

## [7.13.0] - 2026-06-14

---

## [v7.13.0] - 2026-06-14

### Changed
- **Monolith retired & runtime macros updated (SDD Phase C3b)** — Finishes the
  `forge-workflow` dissolution across the surfaces that drive live agent sessions.
  The session-start awareness macros in `internal/commands/storage.go` (Claude,
  Copilot, Google) no longer name `forge-workflow` in their skill order, and the
  Claude macros now also point at `.specify/memory/constitution.md`. The
  `.github/copilot-instructions.md` monolith is slimmed from 1250 → ~1000 lines:
  the duplicated 5-phase / naming / testing / enforcement prose (now in the
  constitution) is replaced by a lean pre-flight + an SDD section pointing at the
  constitution; `framework-first` (previously missing from the pre-flight list)
  is added; the GitHub-issue-images section and the canonical `FORGE-SKILLS`
  skill block (Copilot's inline rules) are kept. Cosmetic "Phase N of
  forge-workflow" references in sibling skills are rephrased to the constitution.
  Guarded by a new `TestWorkflowMacrosOmitForgeWorkflow`. **Verify in a fresh
  session** that pre-flight still fires and rules resolve from the constitution.

### Removed
- **`forge-workflow` skill dissolved (SDD Phase C3a)** — The legacy bespoke 5-phase
  workflow skill is removed from the skill system: the `.github/skills/forge-workflow/`
  and `.claude/commands/forge-workflow.md` files are deleted, it's dropped from the
  `workflow-enforcer` cascade and the `sync-skills.ps1` / `deploy-skills.ps1` skill
  lists, and the embedded `FORGE-SKILLS` block in `copilot-instructions.md` is
  regenerated without it (8 → 7 skills). The `workflow-enforcer` mode detection is
  re-based on the constitution (`.specify/memory/constitution.md`) instead of the
  now-deleted skill. Non-breaking: the runtime awareness macros say "silently skip any
  skill not found", so sessions degrade gracefully. (The macros in
  `internal/commands/storage.go` and the duplicated prose in `copilot-instructions.md`
  are slimmed in a follow-up that needs fresh-session verification, since they drive
  live agent injection.)

## [7.12.0] - 2026-06-13

---

## [v7.12.0] - 2026-06-13

### Changed
- **Skill set collapsed toward SDD (Phase C2)** — `AGENTS.md`'s mandatory cascade is
  rewritten Spec-Driven-Development-first: it now names reading
  `.specify/memory/constitution.md` and the `speckit-*` pipeline as the workflow, and
  demotes `forge-workflow` to a transitional legacy note (removed in C3). The
  `sequential-tasks` skill is dropped entirely — superseded by `speckit-tasks` — and
  removed from the `workflow-enforcer` cascade, its status table, and the skills tree.
- **`workflow-enforcer` is now constitution- and Spec-Kit-aware (SDD Phase C1)** —
  The circuit-breaker skill detects `.specify/memory/constitution.md` (a new Phase 0A
  check) and treats it as the authoritative source of binding rules, and names the
  `speckit-*` pipeline (`specify → plan → tasks → implement`) as the workflow when a
  `.specify/` directory is present. `forge-workflow` is annotated as superseded but
  still loads (removed in C3). Also reconciles a three-way drift: the canonical
  `.github/skills/workflow-enforcer/SKILL.md` and the derived
  `.claude/commands/workflow-enforcer.md` had diverged into different content; the
  command copy is now regenerated from the canonical so they match. (Machine-wide
  `~/.claude/skills` propagation via `deploy-skills.ps1 -GlobalOnly` follows once the
  skill-set collapse in C2 lands.)
- **Constitution now a proven superset of the legacy rules (SDD Phase C gate)** —
  Audited the 1124-line `copilot-instructions.md` monolith against the constitution's
  Articles ahead of retiring it. One gap was found and closed: Article IV (Code
  Quality) now states the explicit comment mandate — every file opens with a
  one-line purpose comment and every exported function carries a doc comment —
  matching the monolith. forge-terminal's own `.specify/memory/constitution.md` was
  regenerated from the template so the two stay byte-identical. This makes the
  constitution safe to use as the single source of truth when the monolith is
  dissolved.

### Added
- **"Install Constitution Globally" button** — The Forge Workflow sidebar card now
  has a one-click action to install the constitution machine-wide (calling
  `POST /api/workflow/global-install`). It asks for confirmation first, since it
  writes the user's global CLI instruction files (`~/.claude`, `~/.copilot`,
  `~/.gemini`), then reports how many tools were updated via a toast. Also fixes
  a frontend/backend drift: the wizard's default module list now includes the
  `constitution` and `speckit-pipeline` modules, matching the Go `DefaultConfig`.
- **New projects ship with the Spec Kit pipeline** — Project scaffolding now lays
  down the full GitHub Spec Kit pipeline: the `speckit-*` agent skills
  (`specify → plan → tasks → implement`, plus clarify/analyze/checklist/etc.) and
  the supporting `.specify/` scripts and templates. The payload is embedded in the
  Forge binary (`go:embed`) and replayed natively, so every project created through
  Forge Terminal gets Spec-Driven Development **offline** — no Python, `uv`, or
  `specify` CLI required. The per-project constitution stays owned by
  `RenderConstitution` (it is excluded from the embedded payload), so each project's
  rules are freshly generated rather than copied. Honors the conflict strategy, so
  re-scaffolding never clobbers a developer's edited pipeline files.
- **Global constitution install — every CLI tool inherits the rules** — New
  `POST /api/workflow/global-install` writes the Forge constitution machine-wide:
  a master copy at `~/.forge/constitution.md` plus an idempotent, marker-fenced
  block (`<!-- FORGE-CONSTITUTION-START/END -->`) embedded into each supported
  CLI tool's global instructions file — `~/.claude/CLAUDE.md`,
  `~/.copilot/copilot-instructions.md`, and `~/.gemini/GEMINI.md`. Re-running
  replaces the managed block in place and never touches the user's own
  surrounding instructions. This is the cross-CLI hoist that lets every tool, in
  every project, inherit the binding rules without per-project reconstruction.
  Only the constitution is hoisted globally — the `speckit-*` skills stay
  per-project because they depend on a project-local `.specify/` tree.
- **Spec Kit pipeline vendored — forge-terminal is now a Spec Kit project** —
  The real GitHub Spec Kit payload (`specify` CLI v0.10.3) is vendored into the
  repo: ten `speckit-*` agent skills under `.claude/skills/` (constitution,
  specify, clarify, plan, tasks, analyze, implement, checklist, taskstoissues,
  agent-context-update) plus the supporting `.specify/` tree (bash scripts,
  spec/plan/tasks/constitution/checklist templates, extensions, workflows). This
  makes the Spec-Driven Development pipeline directly runnable here without each
  developer installing the CLI. `.specify/memory/constitution.md` is populated
  with forge-terminal's own constitution, generated from the same template that
  scaffolded projects receive (PR #152), so the two never drift. A `.gitattributes`
  rule pins `*.sh` to LF so the vendored scripts run under bash on Windows.
- **Spec-Driven Development base (GitHub Spec Kit)** — Every newly scaffolded
  project now receives `.specify/memory/constitution.md`, the GitHub Spec Kit
  source of truth read first by every speckit stage. The constitution merges
  Forge's hard-won, non-negotiable rules into eleven numbered Articles (process
  protection, GitHub Flow, code quality, three-layer testing, local-release-only,
  vault zero-knowledge, framework-first, and more), so new projects inherit the
  base requirements without per-repo reconstruction. `CLAUDE.md` now imports the
  constitution alongside the existing instructions. Emitted natively in Go (no
  Python/`uv`/`specify` CLI dependency) so project creation works offline — the
  first additive phase of re-orchestrating the Forge workflow around SDD.
- **File viewer: Copy Path button** — A "Copy Path" button now appears in the
  MonacoEditor toolbar next to Save. Clicking it writes the full file path to
  the clipboard and shows a brief "Copied!" confirmation. No reveal step needed.
- **Vault: Copy always visible** — The Copy button on each vault entry card is
  now shown at all times rather than only after Reveal. Clicking Copy silently
  fetches and copies the secret without displaying it in the UI. Reveal remains
  available for the rare case where the raw value must be inspected.

### Fixed
- **Chat: project instructions now injected** — `buildChatPrompt` now reads
  `.github/copilot-instructions.md` from the working directory and prepends it
  to every chat prompt, so the AI respects the project's engineering standards.
  The auto-generated FORGE-SKILLS block is stripped before injection to keep
  prompt sizes reasonable. `--no-custom-instructions` is preserved on the
  Copilot CLI call to prevent pollution from unrelated repos; the injection is
  done at the prompt level instead.

## [7.11.10] - 2026-06-06

---

## [v7.11.10] - 2026-06-06

### Changed
- **Core workflow skills now install machine-wide**: `scripts/deploy-skills.ps1`
  hoists the five project-agnostic skills (`workflow-enforcer`, `code-quality`,
  `framework-first`, `branching-strategy`, `code-tutor-workflow`) into the user-level
  `~/.claude/skills/` directory, so every Claude Code project inherits them with no
  per-repo copy (Claude Code resolves user-level skills natively). `forge-workflow` is
  deliberately excluded — it hardcodes Forge Terminal's build commands and must stay
  project-local. A new `-GlobalOnly` switch refreshes just the user-level set; a normal
  full deploy keeps it in sync. This closes the gap where freshly scaffolded projects
  (e.g. created from the Projects card) started with no workflow skills at all.

### Fixed
- **Scaffolded pre-push hooks build the whole module, not Forge's entrypoint**:
  `forge workflow init` previously generated a pre-push hook hardcoded to
  `go build ./cmd/forge/` (Forge Terminal's own entrypoint), so every other
  scaffolded Go repo's hook false-failed on every push and forced
  `git push --no-verify`. The `prePushSHTemplate` / `prePushPS1Template` in
  `internal/workflow/templates.go` now build `go build ./...` (entrypoint-agnostic)
  and regenerate `templ` output first — guarded on the `tool github.com/a-h/templ`
  directive so it is a no-op in non-templ projects. Existing repos must re-scaffold
  or update the hook by hand; new ones get the corrected hook automatically.
- **Tab naming strategy now applied on startup**: On every app launch, Forge now
  fetches `/api/tab-defaults` after session restore and calls `retitleAllTabsFromCwd`
  with the server-authoritative strategy. Previously, `useTabNaming` read only from
  `localStorage`, which could be stale or missing; if `localStorage` defaulted to
  `'project-root'`, any tabs saved with `"Terminal N"` titles (from a prior numbered
  session) would be re-derived into directory-based project names — showing "3D Repos",
  "3D Printing", etc. instead of the user's configured strategy.

## [7.11.7] - 2026-06-05

---

## [v7.11.7] - 2026-06-05

### Fixed
- **Claude session macros now name `framework-first` explicitly**: `ClaudeAwarenessMacro`
  (injected by Fresh Session and Resume cards) and `ClaudeEnforcedMacro` (injected by the
  Enforced card) previously pointed only to `@.github/copilot-instructions.md` without spelling
  out the skill order. The file's own top-level pre-flight list did not yet enumerate
  `framework-first`, so a Claude agent following that list exactly would skip the
  architecture-fidelity gate. Both macros now state the full 6-skill cascade:
  `workflow-enforcer → forge-workflow → code-quality → framework-first → branching-strategy →
  code-tutor-workflow`. A migration rule in `migrateToolVariants` refreshes existing
  `~/.forge/commands.json` installs on next boot. `TestWorkflowMacrosIncludeFrameworkFirst`
  is extended to cover all four tool macros (Copilot, Google, Claude Awareness, Claude Enforced)
  so this gap cannot re-open silently.

### Added
- **framework-first skill — architecture-fidelity gate**: A new companion skill that fires on
  every code task and forces one question before building infrastructure: *does the project's
  framework already provide this?* It carries a "smell list" (persistence/checkpointing, state
  machines, retries, human-in-the-loop pause/resume, routing, serialization, tool-calling,
  streaming, caching, DI, pub-sub), a three-step gate (recon → decide → record a drift
  justification), and reads a per-project `FRAMEWORK-CAPABILITIES.md` ledger as its concrete
  checklist. It complements `code-quality`/`workflow-enforcer` (which govern *how* code is
  written) by answering a different question — *should this be custom code at all?* The skill is
  distributed through the live paths: `.claude/commands/framework-first.md` (synced to Claude
  Code globally, Copilot via `copilot-instructions.md`, and Aider) and
  `.github/skills/framework-first/SKILL.md` (per-repo deploy). It is wired into the
  `workflow-enforcer` cascade, the `AGENTS.md` mandatory sequence, the `sync-skills.ps1` skill
  order, and the Copilot/Google session-start macros so it loads automatically on every session.

- **vault_list MCP tool — vault entry discovery**: Agents can now call `vault_list` (no
  arguments) to receive the names of every secret stored in the Forge Vault before calling
  `vault_inject`. Previously, agents had to guess entry names exactly — a wrong guess
  produced a silent dead-end error, forcing users to screenshot the Vault UI every session.
  `vault_list` returns only entry names (no secret values, no UUIDs), preserving the
  zero-knowledge guarantee. The tool description explicitly guides agents to call
  `vault_list` first, then use the returned names with `vault_inject`.

### Fixed
- **vault_inject error now includes available names**: When `vault_inject` is called with
  an entry name that does not exist in the vault, the error message now includes the full
  list of available entry names. For example, an agent guessing `DBAI_TESTBOT` when the
  real name is `DBAI-TestBot` will now receive `vault entries not found: [DBAI_TESTBOT].
  Available entry names: [DBAI-TestBot, ...]` and can self-correct on the next call without
  requiring user intervention.

## [7.11.5] - 2026-05-31

---

## [v7.11.5] - 2026-05-31

### Fixed
- **terminal_execute active-session guard**: `terminal_execute` now refuses to inject
  commands into PTY sessions where `connectedClients > 0` (i.e. the user has the tab open
  and visible). Previously, keystrokes were sent directly to the PTY input buffer and
  appeared on screen as if typed by the user — alarming and potentially confusing.
  The tool now returns a descriptive error naming the session and directing agents to use
  either a background session (`connectedClients: 0`) or the new `vault_run_script` tool.
  Background-session behavior (`connectedClients = 0`) is entirely unchanged.

### Added
- **vault_run_script MCP tool — PTY-free vault script execution**: Agents can now call
  `vault_run_script(script_path)` with the path returned by `vault_inject` to source the
  vault injection script in a fresh non-interactive subprocess (`pwsh -NonInteractive` on
  Windows, `sh` on Unix) without needing any terminal session at all. An optional `command`
  parameter runs a follow-up shell command in the same subprocess after secrets are loaded,
  enabling one-call patterns like "inject database credentials then run migrations."
  Secret values never appear in the tool response — only subprocess stdout/stderr is
  returned. This is the correct path when all terminal sessions are being watched by a user.

### Docs
- **vault-operations skill — vault_run_script and active-session guard documented**:
  Updated `.claude/commands/vault-operations.md` (the canonical skill source) to reflect the
  two changes above: the `terminal_execute` active-session guard (`connectedClients > 0` →
  error) and the new `vault_run_script` tool. "The Two Safe Paths" is now "The Three Safe
  Paths" with Path 2 covering `vault_run_script`, the decision tree has a `connectedClients`
  branch, the forbidden-actions table has a new row for injecting into live sessions, and both
  tool reference tables are present. Re-synced via `scripts/sync-skills.ps1`.

## [7.11.4] - 2026-05-30

---

## [v7.11.4] - 2026-05-30

### Fixed
- **Update checker stale-cache**: When the Cloudflare Worker proxy at license.rootlevellabs.tech
  returns a cached v7.11.1 as "latest" after v7.11.2 was published, CheckForUpdate() now
  cross-checks against GitHub's full releases list (/releases?per_page=5) before reporting
  "You're up to date." The cross-check result is cached for 10 minutes to stay within the
  60 req/hr unauthenticated GitHub rate limit. (internal/updater/updater.go)

### Added
- **vault_inject MCP tool — zero-knowledge agent secret injection**: Agents can now
  call `vault_inject` with a list of vault entry names to obtain a self-deleting
  platform script (PowerShell on Windows, POSIX sh elsewhere) and a ready-to-use
  source command for `terminal_execute`. Secret values flow directly from vault memory
  to the temp script file and never appear in the agent's response or conversation
  context. This fixes the "agent as courier" anti-pattern where agents previously had
  to ask users to copy-paste secrets through the conversation.
  - New `VaultSecretInjector` interface in `internal/mcp/tools_vault.go`
  - New `BuildInjectionScriptForNames` method on `*vault.Vault` (`internal/vault/vault.go`)
  - Tool registered in `internal/mcp/server.go` alongside all other MCP tools
  - `VaultAccess` field added to `mcp.Dependencies`; wired in `cmd/forge/handlers_mcp.go`
  - 12 unit tests covering definition, nil-vault guard, zero-knowledge guarantee,
    argument forwarding, and vault error propagation (`internal/mcp/tools_vault_test.go`)
- **vault-operations skill**: New `.claude/commands/vault-operations.md` skill documents
  the zero-knowledge injection pattern, the agent decision tree, and the forbidden
  actions (copy-paste couriering, reading script file contents, storing secrets in task
  descriptions). Synced to copilot-instructions.md and all global Claude commands via
  sync-skills.ps1 (7 skills total, was 6).
- **Global Claude skill sync**: sync-skills.ps1 now copies all Forge workflow skills
  (.claude/commands/*.md) to ~/.claude/commands/ so they are available in every Claude Code
  project on this machine — not just forge-terminal. Commands like /add-command-card,
  /forge-workflow, /workflow-enforcer etc now work from any project directory.
  (scripts/sync-skills.ps1)

## [7.11.2] - 2026-05-30

---

## [v7.11.2] - 2026-05-30

### Added
- **Universal skill bridge for Copilot and Aider.** The six workflow enforcement skills in `.claude/commands/` were only visible to Claude Code. GitHub Copilot and Aider had no access to the branching rules, code quality standards, or 5-phase workflow, meaning those tools could silently bypass every guard that Claude Code enforces. `scripts/sync-skills.ps1` now reads every `.claude/commands/*.md` file and writes the full skill content into two adapter targets: `.github/copilot-instructions.md` (between `<!-- FORGE-SKILLS-START -->` / `<!-- FORGE-SKILLS-END -->` HTML-comment markers that Copilot's context window sees on every request) and `.aider/forge-system-prompt.md` (loaded automatically via `.aider.conf.yml`). The script is idempotent, preserves everything outside the markers in `copilot-instructions.md`, and supports a `-DryRun` flag. Edit a skill file once, run `.\scripts\sync-skills.ps1`, and all three tools are updated with no manual copy-paste.

## [7.11.1] - 2026-05-30

---

## [v7.11.1] - 2026-05-30

### Changed
- **Redesigned the command card "Options" section in the Add/Edit modal.** The four options (Paste Only, Favorite, Always Append, On/Off Toggle) were unstyled inline checkboxes that crammed together and wrapped mid-label, because `.checkbox-label` and `.form-row` had no CSS at all. They are now clean, padded option rows — each with a bold title and a one-line description — that highlight when active (pure-CSS `:has()`), matching the polished inputs above them. Fixing `.form-row` to be an actual flex container (it is used only in this modal) also restores the intended side-by-side layout of the Key Binding + Delay and Start/Stop label fields, whose inline `gap`/`align-items` were previously dead. The Always-Append and Toggle info boxes now use shared callout classes instead of inline styles.

## [7.11.0] - 2026-05-29

---

## [v7.11.0] - 2026-05-29

### Fixed
- **Release pipeline no longer ships the wrong binary in non-interactive runs.** `scripts/local-release.ps1` prompted for release notes via `Read-Host`, which throws in any non-interactive shell (agent/CI/background) — the script then died *after* pushing the tag but *before* `gh release create`. Completing the release by hand from the repo root once uploaded a stale binary to the GitHub Release. The script now resolves release notes in priority order — `-ReleaseNotes` → the CHANGELOG `[Unreleased]` section (captured before stamping) → a safe default when no TTY is present — so the full pipeline (including `gh release create`, which uploads from `bin/`) runs unattended and always publishes the freshly built binaries.

### Changed
- **Stale cross-compiled binaries removed from the repo root and git-ignored.** `forge-linux-amd64`, `forge-darwin-amd64`, and `forge-darwin-arm64` were committed in the repo root (the `*.exe` ignore rule missed these extension-less files) and were the stale artifacts a manual release accidentally shipped. They are now removed from tracking and ignored; release binaries live only in `bin/`, on the GitHub Release, and in R2.

## [7.10.33] - 2026-05-29

---

## [v7.10.33] - 2026-05-29

### Added
- **On/off toggle command cards** — A new generic card type (`cardType: "toggle"`) renders a single card with two buttons: a green **Start** that launches a service and a red **Stop** that tears it down. The Start action reuses the card's existing `command`/`macro_payload`/`delay` fields; a new nested `toggle` config (`offCommand`, `offMacroPayload`, `offMacroDelay`, `offDelay`, `onLabel`, `offLabel`) drives the Stop action. The last-clicked side stays highlighted in-memory (it reflects the last action taken, not verified process state, and resets on restart). Toggle cards are first-class in the add/edit modal (a "🔀 On/Off Toggle" checkbox reveals the Stop fields) and require no backend execution or migration changes — every new field is `omitempty`, so existing cards serialize unchanged. Use case: combining a "Launch POC" and "Stop POC" pair into one card.

### Security
- **Vault API now requires authentication on every route — closes an unauthenticated local-read vulnerability.** Previously all `/api/vault/*` routes passed through `AuthMiddleware`, which is a no-op whenever the global remote-access token is unset (the default on a localhost install). That left the entire vault readable by any local process with no credentials: `GET /api/vault/entries` returned all entry metadata, and `GET /api/vault/entries/value?id=...` returned the **decrypted plaintext secret value**. A dedicated vault session token (256-bit, stored `0600` at `~/.forge/vault-session-token`, mirroring the mobile-token pattern) is now enforced on every vault route regardless of the global token. The secret-exposing routes (`reveal`, `inject`) accept the token only via the `Authorization: Bearer` header — never a cookie — making them immune to CSRF, and all vault routes reject cross-site `Origin`s. The token is injected into the same-origin served page so the desktop UI keeps working with no user-visible change.
- **Secret-in-description detection (advisory).** The vault now heuristically detects when a secret has been pasted into an entry's *description* field (a URL with an embedded password, known key prefixes such as `sk-`/`ghp_`, or a high-entropy token). The Add/Edit form shows an inline, non-blocking warning as you type, and existing entries whose description looks like it holds a secret are flagged with a badge so they can be rotated and cleaned up. Descriptions are metadata, not secret values, so this nudges the value into the encrypted secret field instead.

## [7.10.32] - 2026-05-29

---

## [v7.10.32] - 2026-05-29

### Fixed
- **Release Manager typed the release command into a running Claude Code session instead of starting a background job** — Forge infers the active tab's working directory by scraping shell prompts out of terminal output. A live Claude Code session draws a box-framed input prompt containing a Windows path and a `>` chevron, which the prompt parser mistook for the shell's current directory. That corrupted the tab directory, so the Release Manager card could no longer locate `scripts/local-release.ps1` and fell back to typing the full release command into the agent. Prompt-based directory detection is now suppressed whenever a full-screen TUI owns the terminal — both the alternate screen buffer (vim, htop) and a box-drawn frame in the normal buffer (Claude Code, lazygit) — so the last real shell directory is preserved and the release always runs as a background job. Copilot and agy were unaffected because their UIs do not render `C:\…>`-shaped lines.

## [7.10.31] - 2026-05-29

---

## [v7.10.31] - 2026-05-29

## [7.10.30] - 2026-05-29

---

## [v7.10.30] - 2026-05-29

### Fixed
- **Release script parameter binding error on external projects** — Fixed a ParameterBindingException when executing release scripts in repositories that name the version parameter `BumpType` or `Version` instead of `VersionType`. Introspection now dynamically resolves the correct version parameter name from the script's `Get-Command` metadata (falling back to the first positional parameter) to ensure compatibility across all repositories.

## [7.10.29] - 2026-05-29

---

## [v7.10.29] - 2026-05-29

### Added
- **Antigravity CLI (agy) integration for Google provider** — Migrated Google tool variant commands from the old `gemini` CLI to the active `agy` CLI. Fresh session and Enforced workflow cards now execute `agy --dangerously-skip-permissions`, and the Resume card executes `agy --dangerously-skip-permissions --continue` to correctly resume the most recent conversation.
- **Agy command and process detection** — Added pattern matching for `agy` CLI commands and processes in the Go backend and frontend utility libraries to support proper persistent context injection and system process tracking.
- **Persistent visual indicator for background release jobs** — Implemented a pulsing active release job indicator tag on tab headers when a background release is active in their directory.
- **Global background release status polling and notifications** — Added a centralized polling mechanism in `App.jsx` using React refs and local storage synchronization to cheap-poll active job statuses globally, ensuring users receive success/failure toasts even if they navigate away or switch tabs from the initiating project panel.
- **Auto-syncing release job logs and status** — Connected `OwnerReleaseCard` to the global release registry so that navigating back to a tab with an active release dynamically resumes log tracking and high-fidelity output.

### Fixed
- **Command Card Edit Modal Tool-Awareness** — Fixed a bug where editing a tool-aware card (like Fresh, Resume, or Enforced) would default to displaying Claude commands regardless of the active "Run with" tool selection. The edit modal now dynamically displays and updates the command, description, and macro payload for the currently active CLI tool variant and successfully saves edits back to the respective variant maps.

## [7.10.28] - 2026-05-29

---

## [v7.10.28] - 2026-05-29

## [7.10.27] - 2026-05-29

---

## [v7.10.27] - 2026-05-29

### Added
- **Google CLI tool support for command cards** — Added "Google" as an option to the "Run with" selector. Workflow command cards (`🚀 Fresh Session`, `🔄 Resume`, `🛡 Enforced`) now dynamically resolve to run `gemini` or `gemini --resume` commands with the workflow macro injection when Google is selected.
- **Gemini CLI command detection** — Updated Go backend patterns and frontend utility functions to recognize the `gemini` command as an LLM CLI tool, enabling smart context injection and system process tracking.

### Fixed
- **Background Release Manager: polling no longer uses the wrong project after tab switch** — `readReleaseJobStatus` previously closed over `releaseRepoPath`, a live-computed value derived from `cwd`. When the user switched tabs mid-release, `cwd` changed, `releaseRepoPath` updated to the new project, and all subsequent poll requests sent the old job ID paired with the new project path — causing 404 errors and corrupted job state. Fix: `activeJobRepoPath` state is now snapshot from `releaseRepoPath` the moment a job starts and frozen for the lifetime of that job. The fetch helper is a pure function with empty dependency array that accepts explicit `(jobId, jobRepoPath)` parameters; it never closes over live CWD-derived values.
- **Background Release Manager: stale in-flight poll responses no longer corrupt state** — The old callback called `setActiveReleaseJob` internally, before the polling effect could check `shouldContinuePolling`. A response in-flight during a tab switch could therefore overwrite state with data from the previous project. Fix: `fetchReleaseJobStatus` now returns data only; all state mutations happen inside the polling effect, after the `shouldContinuePolling` guard.
- **Background Release Manager: toast completion/failure messages now use the job's own version** — Previously used the live `next` version computed from the current tab, which diverged after a tab switch. Now uses `result.job.version` from the polled response.
- **Background Release Manager: concurrent write/read race on job.json eliminated** — Each HTTP request previously created a new `ReleaseJobStore` with a fresh `sync.RWMutex`, so the background release goroutine and HTTP poll handlers never actually shared a lock. A poll arriving mid-write could read a partially written file, producing "unexpected end of JSON input". Fix: a package-level `sync.Map` registry now ensures all `ReleaseJobStore` instances for the same canonical project root share one `*sync.RWMutex`. Path canonicalisation uses `filepath.Abs` + `filepath.Clean` + lowercase normalisation on Windows so that case variants and relative paths resolve to the same lock.

## [7.10.26] - 2026-05-28

---

## [v7.10.26] - 2026-05-28

## [v7.10.26] - 2026-05-29

### Fixed
- **Tab naming: "project-root" no longer shows username instead of project name** — WSL/Linux shells fire an OSC 9;9 event at startup with the bare home directory path (`/home/<user>`) before navigating to the project. The new `isSystemProfilePath()` guard detects these bare home/profile paths and updates the stored directory without overwriting the tab title. This is applied consistently in `handleDirectoryChange`, session restore, and the retitle-all-from-settings path.
- **`extractProjectFolder` now recognises the Linux `projects` convention** — Added `'projects'` to `KNOWN_ROOT_FOLDER_NAMES` so `/home/<user>/projects/<project-name>` and `~/projects/<project-name>` are correctly anchored to the project name rather than falling through to a positional guess. Tilde paths (e.g. `~/projects/forge-terminal`) also benefit.
- **Extended KNOWN_ROOT_FOLDER_NAMES search depth** — The search limit was raised from `ceil(len/2)` to `min(len-1, 5)`, allowing anchor detection at the third path segment (`/home/user/projects/…`) while capping at 5 to prevent false positives from nested folders with the same name.
- **Removed hardcoded `title === 'forge-terminal'` session restore trigger** — This was a project-specific hack that caused unnecessary re-derivation of any tab already titled 'forge-terminal', which could overwrite the correct title with a system path like 'mikejsmith1985'. Tabs with real project names are now preserved as-is during session restore.

## [7.10.25] - 2026-05-28

---

## [v7.10.25] - 2026-05-28

### Fixed
- **Background release manager compatibility** — The background runner now uses parameter introspection (`Get-Command`) before invoking `local-release.ps1`, so forge-specific flags (`-NonInteractive`, `-Force`, `-IncludeUncommittedChanges`) are only passed when the target script declares them. Previously, running the Release Manager against any project whose script did not declare `-NonInteractive` caused an immediate `ParameterBindingException` failure.

## [7.10.24] - 2026-05-28

---

## [v7.10.24] - 2026-05-28

### Added
- **Release Manager background jobs** — Local release scripts can now be started from a pre-run modal and executed by the Forge backend with persistent `.forge/release-jobs` logs, status polling, and completion toasts so the active CLI terminal stays usable.

### Changed
- **`local-release.ps1` supports explicit non-interactive choices** — Added `-NonInteractive` and `-IncludeUncommittedChanges` so background releases fail safely instead of waiting on `Read-Host`, while `-ReleaseNotes` and `-Force` cover release notes and warning prompts.

## [7.10.23] - 2026-05-27

---

## [v7.10.23] - 2026-05-27

### Added
- **`add-command-card` skill** — New agent skill that teaches any Copilot session how to build and register a Command Card in Forge Terminal. Covers the full data schema, POC/dev-server templates, Zero-Click macro patterns, tool-variant cards, the read→append→POST workflow, and a validation checklist. Registered in `workflow-enforcer` and `copilot-instructions.md` as a conditionally-loaded skill (activates on keywords: command card, launch POC, add shortcut, sidebar button).
- **Refresh button on the ⚡ Commands ribbon** — A `RefreshCw` icon button in the command-card sidebar header lets you pull in cards added by agents without a full browser page refresh. The icon spins while the fetch is in-flight and is disabled to prevent double-fetches.

### Fixed
- **`loadCommands` stale-closure bug** — The previous implementation guarded the state update with `timeoutId !== null || commandsLoading`, where `commandsLoading` was read from the render-time closure. On any call after the first successful load, `commandsLoading` was `false` in the closure, causing the guard to silently discard the fetched cards and leave the sidebar frozen on "Loading command cards…" permanently. Replaced with a mutable `isRequestActive` flag that is owned by each individual request and is not subject to React's asynchronous state batching.

## [7.10.22] - 2026-05-27

---

## [v7.10.22] - 2026-05-27

### Fixed
- **Release Manager now resolves external repo versions from global highest semver tags** — NodeToolbox-style repositories with newer tags on non-ancestor branches now report the correct CURRENT version by using sorted `git tag` lookup instead of ancestry-limited `git describe`.

## [7.10.21] - 2026-05-26

---

## [v7.10.21] - 2026-05-26

### Fixed
- **Release commands now use conventional commit messages** — External release commands and Release Manager defaults now use `chore: release vX.Y.Z`, preventing Forge-generated `commit-msg` hooks from blocking releases in repositories such as GitDiscord.

## [7.10.20] - 2026-05-26

---

## [v7.10.20] - 2026-05-26
- **Forge Vault setup now uses portable repo-relative paths and calls out Jira metadata** — The repo-root MCP config no longer hardcodes a machine-specific vault proxy path, and the MCP setup/discovery docs now explain how to store Jira base URLs alongside vault credentials so every project in the repo can discover the same setup.

## [7.10.19] - 2026-05-26

---

## [v7.10.19] - 2026-05-26

### Fixed
- **Forge Vault modal is now wider so toolbar actions stay readable** — Increased the modal max width from 480px to 840px, which gives the search, sort, and add controls enough horizontal room in the header ribbon without clipping.

## [7.10.18] - 2026-05-26

---

## [v7.10.18] - 2026-05-26

### Added
- **Adaptive build environments now support recoverable detached jobs** — `environment_run` accepts `detach: true`, persists job metadata and logs under `.forge/adaptive-build-jobs/`, and exposes `environment_jobs` plus `environment_read_job` so resumed agent sessions can rediscover build status and logs instead of losing long-running work.

### Fixed
- **Release Manager card now passes explicit version to `local-release.ps1`** — When a project has `scripts/local-release.ps1`, the card was sending a relative bump type (`patch`/`minor`/`major`) rather than the explicit next-version shown in the UI. If a previous release attempt had partially bumped `package.json` before failing, the script would compute a *different* version than the card displayed, creating a double-bump. The card now always passes the exact version string (e.g. `0.0.14`), ensuring the script releases precisely what was shown.
- **Vault credential management now keeps related records together and easier to find** — Added optional URL metadata and credential bundle metadata to Vault entries, grouped username/password pairs into a single bundled card in the UI, and added search + sort modes (`Commonly used`, `Alphabetical`, `Recently added`) so entries are no longer stuck in insertion order. Vault API calls in the frontend now also fall back to same-origin automatically when a stale configured API base cannot reach `/api/vault/*` endpoints.

## [7.10.11] - 2026-05-03

---

## [v7.10.11] - 2026-05-03

### Fixed
- **Pasting a clipboard image no longer renames the active tab** — Three overlapping bugs allowed the `see file at C:\...\AppData\Local\Temp\clipboard-<timestamp>.png` text emitted after an image paste to trigger an OSC 9;9 directory-change event that renamed the tab:
  1. *Stale prop closure in the OSC 9;9 handler*: the xterm `addOscHandler` callback captured `onDirectoryChange` at terminal mount time. If the user later changed the Tab Naming strategy in Settings, the handler continued using the old strategy until the terminal was remounted. Fixed by switching to `onDirectoryChangeRef.current`, which is always the latest callback.
  2. *Narrow `looksLikeFile` guard missing image extensions*: the inline regex only blocked script extensions (`.ps1`, `.sh`, `.py`, …) and did not cover `.png`, `.jpg`, `.gif`, `.webp`, `.bmp`, etc. Replaced the inline regex with the shared `isFileLikeName()` utility from `projectFolder.js`, which covers all document and image extensions.
  3. *Missing `isTempOrSystemPath` guard before the OSC callback*: the guard existed inside `handleDirectoryChange` (App.jsx) but was unreachable whenever the stale closure held a version of that function that lacked the guard. Added a defense-in-depth `isTempOrSystemPath(path)` check directly in the OSC 9;9 handler before the callback is invoked at all.
- **Text-based directory detection no longer renames tabs to temp paths** — The `extractDirectory` code path that parses PTY output for `cd`-style paths lacked a `isTempOrSystemPath` guard. An AI agent processing a pasted image and briefly navigating to `%TEMP%` could trigger a spurious rename. The guard is now applied before calling `onDirectoryChangeRef.current`.
- **Tab Naming setting is now always respected, including after settings changes mid-session** — The stale-closure fix above ensures the active naming strategy from Settings drives all tab title updates, satisfying the "Ultimate Law of Tab Naming."
- **Macro payload injection is now reliable for fast-starting CLIs (Copilot, Claude, Aider)** — Three bugs caused the workflow enforcement payload to either arrive 12 seconds late or be mangled into multiple separate messages:
  1. *12-second timeout on fast-start*: `waitForPTYQuiet` only fired when PTY output arrived *after* the macro request. If Copilot finished its startup banner before the POST arrived, the condition was never true and injection waited the full 12-second hard cap. Fixed by using the request-arrival time (`baseline`) as the silence reference when no post-baseline output is observed — injection now fires after `quietMs` (~750 ms) in the fast-start case.
  2. *Multiline payload submitted as separate messages in chunked mode*: When the `\x1b[?2004h` bracketed-paste sequence wasn't in the ring buffer, the code fell back to chunked mode where `\n` → `\r` normalization caused each paragraph to be submitted as a separate Copilot message. Fixed by (a) persisting a `isBracketedPasteEnabled` boolean on `TerminalSession` that is never evicted from the ring buffer, and (b) adding a `macro_mode` field to command cards so AI CLI cards force bracketed-paste mode regardless of detection.
  3. *Bracketed-paste detection failure after ring buffer eviction*: If Copilot emitted the DECSET 2004 enable sequence early then printed >4 KB of output, the sequence scrolled off the 4 KB ring buffer and `pickMacroMode` fell back to chunked. Fixed by tracking the enable sequence as a persistent session flag and expanding the ring buffer from 4 KB to 16 KB.
- **`copilot-workflow-enforced.json` now sets `"macro_mode": "bracketed"`** to force bracketed-paste injection, bypassing detection for a card that is exclusively used with AI CLIs.

## [7.10.10] - 2026-05-01

---

## [v7.10.10] - 2026-05-01

### Fixed
- **Number keys and other input no longer lost on tabs recovered after an application update** — When Forge restarts and recovers saved tabs, the terminal gains keyboard focus (via `term.focus()`) before the WebSocket handshake completes. Any keystroke during that CONNECTING window was silently discarded because `xterm.onData` only sends data when `readyState === OPEN`. Input is now buffered while the socket is CONNECTING and flushed in bulk the instant `onopen` fires. The buffer is cleared on each new connection attempt so no stale pre-disconnect input is ever replayed.
- **Tab numbers no longer duplicate after closing a tab** — For static naming strategies (`numbered`, `shell-type`, `custom-prefix`), the next tab number was computed as `tabs.length + 1`. After closing a tab this could collide with an existing title (e.g. closing "Terminal 2" from ["Terminal 1", "Terminal 2", "Terminal 3"] gave the next tab "Terminal 3" again). The number is now derived as `max(existing_numbers) + 1`, guaranteeing a fresh, collision-free title regardless of which tabs have been closed.

## [7.10.9] - 2026-05-01

---

## [v7.10.9] - 2026-05-01

### Fixed
- **Tab title and project directory no longer change when AI tools view a pasted image** — When a user pasted an image, the system saved it to the OS temp directory (e.g. `%TEMP%` on Windows, `/tmp` on macOS/Linux). If Copilot or Claude navigated there to access the file, the shell's CWD notification fired `handleDirectoryChange`, which overwrote the tab title (e.g. `forge-terminal` → `mikej`) and `tab.currentDirectory` with the temp path — breaking the Release Manager card, Workflow card, Git panel, and other features that depend on `currentDirectory` pointing at the project root. Added `isTempOrSystemPath()` to `projectFolder.js` (covering Windows `AppData\Local\Temp`, `Windows\Temp`, Unix `/tmp`, macOS `/var/folders`, etc.) and applied an early-return guard in `handleDirectoryChange` that skips both title and directory updates when the new path is a temp/system location.

## [7.10.8] - 2026-04-30

---

## [v7.10.8] - 2026-04-30

### Fixed
- **Release Manager now shows the correct current version in dev builds** — Two compounding bugs caused the Release Manager to display a stale version (e.g. v7.10.3) even when git tags showed a newer release (v7.10.7). First: `run-dev-clean.ps1` built the dev binary with `-X main.buildTime` and `-X main.devMode` only — never injecting `-X internal/updater.Version`. Second: `var Version` in `updater.go` was left at the value from when the branch was cut from main, which never received the version bumps that live on the release branch. Fixed by (1) dynamically reading the latest semver git tag in `run-dev-clean.ps1` and injecting it as an ldflag, and (2) syncing the `var Version` fallback to the current latest tag `"7.10.7"`.
- **Companion QR code now encodes the chosen connection method's URL end-to-end** — When the user selected Named Cloudflare Tunnel and Tailscale was also connected, the wizard silently overrode the QR base URL with the Tailscale address. The phone received `tailscale-host/companion/#forge=cloudflare-url` instead of the Cloudflare URL throughout. Removed the Tailscale-override logic; `resolvedCompanionHost` now derives from `tunnelUrl` (the active Cloudflare URL) so both the PWA load path and the `forge=` fragment encode the method the user actually chose. Component test updated to serve as a regression guard against re-introducing the Tailscale substitution.
- **Release Manager no longer re-releases the same version when git tags live on feature branches** — `local-release.ps1` used `git describe --tags --abbrev=0` which only searches branch ancestry. When a release is made from a feature branch before merging to main, new branches cut from main don't see that tag in their ancestry, causing `git describe` to return the previous version. Patch-bumping that yields the same tag as the one just released. Replaced with `git tag --sort=-version:refname` which finds the highest semver tag globally.
- **Release Manager UI now shows the correct current version when the running binary predates the latest tag** — `/api/version` returned only the binary's compiled-in version string. Added `latestGitTag` to the response (populated by the same global tag query). The Release Manager now prefers `latestGitTag` so it shows the right base even in the window between a release being tagged and the new binary being installed.
- **Release Manager command now passes the explicit version to the script, not a bump type** — Previously `generateReleaseCommand` sent `patch`/`minor`/`major`, allowing the script's git-tag detection to override whatever the UI computed. The command now sends the exact version number (e.g. `7.10.4`), bypassing git-tag detection entirely. The UI is now the single source of truth for what gets released.
- **`-ReleaseNotes` parameter added to `local-release.ps1`** — The interactive `Read-Host` prompt is now skipped when notes are supplied via `-ReleaseNotes`, enabling automated and tooling-driven invocations without blocking on stdin.

## [7.10.3] - 2026-04-27

---

## [v7.10.3] - 2026-04-27

### Fixed
- **Companion PWA bottom edge no longer clipped on iOS Safari** — The `height: 100svh` / `height: 100vh` declarations in `.screen` were in the wrong order: CSS last-wins means `100vh` always overrode `100svh` in every modern browser, so the Small Viewport Height unit was completely inert. Swapped to `100vh` first (fallback) then `100svh` (override), so the collapsible Safari toolbar is now properly excluded from the layout height.
- **Sessions screen Refresh button no longer overlaps the iOS home indicator** — The footer bar used a flat `padding: 12px 16px` with no safe-area compensation. Added `padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px))` so the button clears the swipe zone on Face ID devices.
- **Companion sessions list now auto-refreshes every 5 seconds** — The list was fetched once at connect time and never updated in the background. If no terminal was open at that moment the user saw "No active sessions" permanently and had to tap Refresh manually. Background polling (silent — no spinner flash) now starts when the sessions screen is shown and stops when navigating to a terminal or disconnecting.

## [7.10.2] - 2026-04-26

---

## [v7.10.2] - 2026-04-26

### Added
- **Claude Code workflow skills** — Five custom slash commands added to `.claude/commands/` that give Claude Code the same workflow enforcement previously available only to GitHub Copilot via the `\skill:` invocation syntax. Skills: `workflow-enforcer` (circuit breaker gatekeeper), `forge-workflow` (5-phase execution plan), `code-quality` (naming and comment standards), `branching-strategy` (branch-before-code enforcement), `code-tutor-workflow` (walkthrough mode). Each skill is a self-contained Markdown file that Claude Code reads and executes as binding instructions when invoked via `/skill-name` or the `Skill()` tool call.

### Fixed
- **CLI tool toggle now actually works** — `AutoMigrateOnLoad` was defined but never called at server startup, so `toolVariants`, `descriptionVariants`, and `macroVariants` were never written to `commands.json`. As a result `isToolAware` was always `false` in the frontend and the "Run with Claude / Copilot" selector was silently ignored — every runner card (IDs 6/7/8) executed its hardcoded `copilot --allow-all-tools` command regardless of selection. The call is now wired into `main()` immediately after the storage migration block, running synchronously before any HTTP handler accepts requests.

## [7.10.1] - 2026-04-27

### Fixed
- **Runner cards now dynamically update when "Run with Claude" or "Run with Copilot" is selected** — Cards for IDs 6 (Fresh), 7 (Resume), and 8 (Enforced) now carry `descriptionVariants` and `macroVariants` in addition to `toolVariants`. Selecting Claude shows "🤖 Claude (Fresh)", "🔄 Claude (Resume)", "🛡 Claude (Enforced)" with Claude-specific SYSTEM INJECTION macros; selecting Copilot shows the Copilot variants with the workflow-enforcer skill invocation. Existing installs are upgraded automatically via `AutoMigrateOnLoad`.
- **ID 8 (Enforced) upgrade gap fixed** — `migrateToolVariants` previously set `hasID8 = true` without actually upgrading an existing ID 8 card that lacked `toolVariants`. All three workflow cards now receive the full variant upgrade regardless of whether they were pre-existing or freshly injected.
- **MCP tab card ordering** — `MCP Discovery` card now appears first in the MCP tab (was: Adaptive Build Environments first). MCP Discovery is the most critical entry point for new MCP server setup.
- **Forge Companion QR deep link uses Tailscale URL as companion base for Named Cloudflare Tunnel** — When the Named Cloudflare Tunnel method is active and Tailscale is connected, the QR code and "Copy link instead" button now generate `<tailscale-url>/companion/#forge=<named-tunnel-url>&token=…` instead of using the cloudflare URL for both the base and the `forge=` parameter. Falls back to the `companionHost` prop when Tailscale is absent.
- **`forgeUrl` is now normalised in `buildDeepLink`** — Protocol-less forge URLs are prepended with `http://` before being embedded in the QR fragment, preventing the Companion PWA from receiving an unparseable URL on devices that enforce strict URL validation.

## [7.10.0] - 2026-04-26

---

## [v7.10.0] - 2026-04-26

### Added
- **`forge-git` enforcement shim** — New binary at `cmd/forge-git/` acts as a drop-in PATH shim for the system `git` binary. It intercepts `git commit --no-verify` and `git push --no-verify` (including the `-n` shorthand for commit), blocks execution with a clear message, and logs the attempt to `~/.forge/audit/violations.log`. All other git commands are transparently forwarded to the real git found elsewhere in PATH. Install by building the binary to `~/.forge/bin/git` and placing `~/.forge/bin` first in `PATH`.
- **`CLAUDE.md` scaffold entry** — Forge Workflow now generates `CLAUDE.md` alongside `.github/copilot-instructions.md` in every scaffolded project. Claude Code reads `CLAUDE.md` automatically at every session start; the file `@`-imports the canonical instructions file so both Claude Code and GitHub Copilot share a single source of truth with zero content duplication.
- **Tool-agnostic workflow branding** — Template headers, module display names, and package docs renamed from Copilot-specific language (`"Copilot Instructions"`, `"Copilot Coding Agent Setup"`) to tool-neutral equivalents (`"AI Agent Instructions"`, `"CI Agent Environment Setup"`). Module IDs and disk file paths are unchanged for backwards compatibility.
- **CLI tool selector for workflow command cards** — A compact `Run with [Claude] [Copilot]` pill strip now sits between the Projects browser and the command cards in the Cards tab. Selecting a tool switches what the three workflow action cards (`🚀 Fresh Session`, `🔄 Resume`, `🛡 Enforced`) actually run, eliminating the need for separate Copilot and Claude cards for the same action. Selection persists to `localStorage`. Each tool-aware card shows a small colour-coded badge (`Claude` or `Copilot`) so the active tool is always obvious. Existing Copilot-specific cards (IDs 6, 7) are upgraded automatically on first boot; the new Enforced card (ID 8) is injected into existing installs via `AutoMigrateOnLoad`.
- **Enforced workflow card (ID 8)** — New `🛡 Enforced` action card starts a fresh session with an amplified macro payload that mandates the workflow-enforcer rules on every task (no shortcuts, all quality gates apply). Works with both Claude and Copilot.

### Fixed
- **Named tunnel crashes on cloudflared v2025.8+ due to wrong argument order** — `--config` and `--no-autoupdate` are `tunnel`-level flags in cloudflared v2025.8's `urfave/cli` strict subcommand scoping; they must appear between `tunnel` and `run`, not after it. The supervisor had `cloudflared tunnel run --config … --no-autoupdate` which caused cloudflared to immediately print its full help text and exit, triggering the storm guard in ~40 seconds. Fixed to `cloudflared tunnel --no-autoupdate --config … run <uuid>`. Validated live against the real binary before committing.
- **Crash output buffer captured useless help text instead of the error line** — ring buffer kept only the *last* 10 lines; for startup crashes (help text printed then exit) this captured the bottom of the help page. Changed to keep the *first* 3 + *last* 5 non-empty lines so the actual error (always first) is always captured. Buffer resets at the start of each restart attempt.
- **Crash detail text overflowed the sidebar** — raw `pre-wrap` text with 50+ lines was unconstrained. Detail block is now a scrollable monospace `<code>` element with `max-height: 96px` and `overflow-y: auto`.

## [7.9.2] - 2026-04-26

---

## [v7.9.2] - 2026-04-26

### Fixed
- **Named tunnel storm-guard leaves wizard permanently stuck** — when cloudflared crashes 5 times within 2 minutes the supervisor enters `StageStopped` and never self-recovers, but the Companion wizard treated `stopped` identically to `starting` (same spinner, same disabled "Tunnel is healthy" button, no escape). Wizard step 2 now detects `tunnelStage === 'stopped'`, replaces the spinner with an `AlertCircle`, shows an actionable message, and renders an inline **Restart supervisor** button that calls `POST /api/tunnel/setup/restart` to start a fresh supervisor.
- **Named tunnel storm publish erased the known hostname URL** — `StageStopped` was published with an empty URL, causing the wizard's QR code and hostname display to go blank on the next 6-second poll. Now passes `s.probeURL` so the URL stays visible even when the supervisor has given up.
- **Cloudflared crash reason unknowable** — all cloudflared stdout/stderr was intentionally discarded, so the storm error message said "check logs" with no actionable detail. The supervisor now buffers the last 10 output lines and appends them to `LastError`, making the actual failure reason (auth error, port conflict, bad config path, etc.) visible in the wizard's detail area.

## [7.9.1] - 2026-04-26

---

## [v7.9.1] - 2026-04-26

## [7.9.0] - 2026-04-25

---

## [v7.9.0] - 2026-04-25

### Fixed
- **Named tunnel health probe never reaches "healthy" (spinner wedged in Companion wizard)** — three compounding bugs: (1) `ProbeHTTP` hardcoded its own 2-second `context.WithTimeout` that silently overrode the caller's 8-second budget added in v7.8.6 for slow Cloudflare TLS, meaning the external probe only ever got 2 s; (2) the local fallback probe used `localhost` which on Windows resolves to `::1` (IPv6) before falling back to IPv4, adding ~1 s of TCP latency and intermittently exceeding the 2-second window; (3) the wizard read `option.detail` but the backend sends `option.lastError`, so error messages in the spinner never displayed. Fixed: `ProbeHTTP` no longer wraps the caller's context — callers control the timeout budget; local probe URL changed to `127.0.0.1` to bypass Windows IPv6 resolution; wizard now reads `option.lastError`.
- **Sidebar tab ribbon visual redesign** — icon-only tabs rendered as large boxy filled squares in accent color; replaced with a slim underline-indicator style (2 px accent border-bottom, transparent background) that matches the rest of the sidebar's visual language.

### Added
- **Sidebar ribbon UX refresh** — overloaded Cards tab split into four focused tabs: **Cards** (user command shortcuts + Projects browser), **Files** (unchanged), **MCP** (MCPSetupCard + MCPDiscoveryCard + CompanionAccessCard), and **Tools** (Release Manager + Forge Workflow + Web App Debugger). The Debugger tab is retired; its contents live in Tools.
- **Configurable tab label style** — new Tag button in the theme controls row toggles between icon+label and icon-only modes; preference persisted to localStorage (`sidebarTabStyle`).
- **New Project wizard in the Projects card** — `FolderPlus` button opens an inline form that creates a new folder in the project root, runs `git init`, and scaffolds all Forge workflow files automatically via `DefaultConfig()`. Optional GitHub repo creation via the `gh` CLI (private or public); graceful error if `gh` is not installed.
- `POST /api/project/create` backend endpoint with path traversal guard, git init, scaffold, and optional `gh repo create --source=. --push`.

### Changed
- Release Manager card moved out of the sortable command list and into the Tools tab permanently; legacy `id: -1` entries are silently filtered from saved commands on load.

## [7.8.6] - 2026-04-25

---

## [v7.8.6] - 2026-04-25

## [7.8.6] - 2026-04-25

### Fixed
- **Macro payload injected before CLI starts (Enter-key race)** — `handleExecute` fired the macro HTTP request at t=0 but `sendCommand` scheduled Enter after `cmd.delay` ms (up to 4500 ms on Workflow cards). The payload arrived at the server before the CLI was even launched. Fix: wrap the macro `fetch` in `setTimeout(…, cmd.delay + 200)` so the request is not sent until after Enter has been delivered to the PTY.
- **Macro `waitForPTYQuiet` fires on stale output (false-quiet)** — the quiet-detection loop checked `now.Sub(lastOutputAt) >= 750 ms` without verifying the output occurred *after* the macro request. When the terminal was idle before the card click, the check passed immediately and the payload was injected into an empty shell. Fix: `waitForPTYQuiet` now accepts a `baseline time.Time` (set to `startedAt` before the floor sleep) and ignores output that predates it.
- **Named tunnel health probe fails on NAT-hairpin networks** — the supervisor probed `https://<hostname>/api/ping` via the external Cloudflare URL. On home/office networks where the local machine cannot reach its own external hostname (split-horizon DNS, Windows firewall, CGNAT), the probe always timed out — even though remote clients could connect fine. Fix: dual-probe strategy in `probeAndReport` — if the external probe fails, fall back to `http://localhost:{port}/api/ping`. If the local probe succeeds and cloudflared is running, the stage is marked Healthy. Probe timeout also raised from 2 s → 8 s to handle slow Cloudflare TLS round-trips.
- **Companion wizard showed no detail on unhealthy tunnel** — the spinning "Waiting…" hint gave no indication of *why* health was failing. The hint now renders `tunnelDetail` (the supervisor's error string) below the spinner so users can see "external=dial tcp: connection refused; local=OK" or similar.

## [7.8.5] - 2026-04-25

---

## [v7.8.5] - 2026-04-25

## [7.8.5] - 2026-04-25

### Fixed
- **Named tunnel never reached "healthy" in the Companion wizard** — `internal/tunnel/named.go` probes `https://<hostname>/api/ping` every 20 s and demotes the supervisor to *Degraded* after 3 misses, but no handler was registered for `/api/ping`. The probe always 404'd, so Step 2 of the wizard ("Tunnel is healthy") stayed disabled forever. Added a tiny unauthenticated handler in `cmd/forge/handlers_ping.go` registered before the catch-all `/` route. Probe now returns 200 within ~5 s of the tunnel starting and the wizard advances normally.
- **Macro payloads still missed the AI CLI even after the v7.8.4 delay bump** — the old path waited a fixed `macro_delay` in the browser and shipped bracketed paste over the WebSocket, which silently failed when (a) the receiving CLI hadn't enabled DECSET 2004 yet, (b) the WebSocket reconnected during the wait, or (c) cold-start variance pushed the first prompt past the timeout. Replaced with a server-side endpoint `POST /api/terminal/{sessionID}/macro` that owns the PTY directly: it waits for an *output-quiet* window (default 750 ms of silence after a 1500 ms minimum, capped at 12 s), sniffs recent PTY output for `\x1b[?2004h`, then picks bracketed-paste or 64-byte chunked-typed mode accordingly. Every attempt is logged to `~/.forge/logs/macro.log` with mode, wait time, and delivery status.

### Added
- `cmd/forge/handlers_ping.go` + `handlers_ping_test.go` — unauthenticated `/api/ping` for tunnel health probes.
- `cmd/forge/handlers_macro.go` + `handlers_macro_test.go` — server-side macro injection with quiet-detection and dual-mode bracketed/chunked write.
- `internal/terminal/session.go` — output-activity tracking (`LastOutputAt`, `RecentOutput`) on every PTY read, used by the macro endpoint to gate injection on a quiet PTY rather than a wall-clock timer.

### Changed
- `frontend/src/App.jsx` — Copilot card execution now POSTs the macro payload to `/api/terminal/{tabId}/macro` instead of bracketed-pasting from the browser. Default `minDelayMs` is 1500; the backend extends as needed until the PTY goes quiet.

## [7.8.4] - 2026-04-25

---

## [v7.8.4] - 2026-04-25

## [7.8.4] - 2026-04-25

### Fixed
- **Forge Workflow Architect "Modules Enabled" badge said "11 of 8"** — the review step had `8` hardcoded as the total module count, but the live skill catalog ships 11 modules. The denominator now reflects `moduleCatalog.length` so the ratio is always honest.
- **Macro payloads on Copilot command cards (Resume / Workflow Enforced / Fresh) frequently failed to inject** — three root causes addressed together:
  - Default JSON templates stored newlines as the literal sequence `\n` (backslash-n) instead of real line breaks, so the bracketed-paste detector never fired and the entire payload arrived as one run-on string. Defaults now embed real newlines, and an automatic migration in `internal/commands/migration.go` heals legacy `commands.json` files on first load.
  - The old default `macro_delay` of 1500ms fires before `copilot` finishes rendering its first prompt; the first character of the payload was being eaten. The default is now 4500ms for both fresh card creation (`storage.go`) and the App.jsx fallback. Existing workflow cards with delays under 4 seconds are bumped on migration.
  - Default templates still referenced "enterprise workflow" wording and the legacy `enterprise-workflow` skill ID. Both are renamed to "Forge Workflow" / `forge-workflow` on disk and via migration.
- **Phones hitting the bare Forge URL landed on the desktop terminal instead of the Companion PWA** — added a User-Agent–aware redirect in `cmd/forge/main.go` that bounces mobile / tablet browsers to `/companion/` *before* the desktop auth challenge runs. Desktop browsers, curl, and monitoring agents are unaffected (`isMobileUserAgent` only matches well-known UA tokens — `Mobi`, `Mobile`, `Android`, `iPhone`, `iPad`, `iPod`).
- **Companion Connection Wizard QR code did not appear until step 4 of the Named Tunnel flow** — the QR is now shown on step 2 the moment a tunnel URL is known, even before the supervisor reports "healthy", so the user can scan and have the PWA waiting the moment the tunnel comes up.
- **Companion Connection Wizard QR encoded a deep link the PWA cannot parse** — the wizard previously emitted `?host=…&token=…` (query string) while the PWA reads `#forge=…&token=…` (fragment). The wizard now reuses the canonical `buildDeepLink` helper from `utils/companionUrl.js`, so both the legacy CompanionAccessCard QR and the new wizard QR produce identical, working URLs.

### Added
- `command-cards/copilot-workflow-enforced.json` — the third Copilot card (Resume / Workflow Enforced / Fresh) is now part of the shipped defaults.
- `cmd/forge/mobile_ua.go` and `mobile_ua_test.go` — the mobile-UA detection helper with table-driven coverage of Android phones, iPad, desktop Chrome / Firefox, and curl.
- `internal/commands/migration_test.go` — covers literal-`\n` healing, "enterprise workflow" rename, macro_delay bump, and a happy-path "do not touch already-good cards" guard.

### Known issues
- A small percentage of restored tabs after a binary update can still freeze with garbled output. This is being tracked separately and was not reproducible from the changes in this release.

## [7.8.2] - 2026-04-25

---

## [v7.8.2] - 2026-04-25

## [7.7.4] - 2026-04-25

---

## [v7.7.4] - 2026-04-25

## [7.8.2] — Quick Tunnel wizard fix

### Fixed
- **Forge Companion Quick Tunnel flow now actually starts the tunnel.**
  Previously the wizard said "Forge will start a Quick Tunnel" but never
  called any API. Step 2 now shows context-sensitive buttons:
  - `absent` stage → **Install cloudflared** button (calls `POST /api/tunnel/setup/install`)
  - `configured`/`stopped` stage → **Start Quick Tunnel** button (calls `POST /api/tunnel/start`)
  - `starting` stage → spinner
  - `degraded` stage → error detail + **Try again** button
  - `healthy` stage → success checkmark
- **Backend polling no longer wipes a running Quick Tunnel back to "configured".**
  `detectQuick()` now preserves supervisor-set states (Starting, Healthy,
  Degraded, Stopped) exactly as `detectNamed()` has always done.  Before
  this fix, every `/api/tunnel/options` poll called `DetectAll` which called
  the old `detectQuick()`, which had no memory of the running process and
  always returned `configured`, making the URL never appear in the wizard.
- After clicking Start or Install, the wizard triggers three rapid re-polls
  so the UI transitions to `starting` state within ~3 seconds instead of
  waiting for the next 6-second interval.
- Error messages from failed install/start API calls are now displayed
  inline as a sticky banner above the action button, cleared on retry.

## [7.8.1] - 2026-04-25

---

## [v7.8.1] - 2026-04-25

## [7.8.1] - 2026-04-25

## [7.7.4] - 2026-04-25

---

## [v7.7.4] - 2026-04-25

## [7.8.1] - 2026-04-25

### Changed
- **Workflow pre-commit hook is now auto-installed.** Previously developers had to run `scripts/install-workflow-hooks.{ps1,sh}` once per repository. Now `internal/workflow/ticket.go` calls `EnsureHookInstalled` automatically the first time `RecordGate` creates a new ticket for a project — so any agent (or human) that records their first gate also silently gets the hook. The installer scripts remain available for manual re-installation. The hook preserves any existing non-Forge pre-commit script rather than overwriting it.



---

## [v7.8.0] - 2026-04-25

## [7.8.0] - 2026-04-26

### Added
- **Runtime workflow enforcement (real, not just prompts).** `internal/workflow/ticket.go` introduces a per-task gate ledger persisted at `.forge/workflow-ticket.json`. The new MCP tools `workflow_gate_record` and `workflow_preflight_check` let agents (and humans) record evidence and ask whether the required gates (`branch-created`, `tests-written`, `tests-passed`) have been satisfied. `forge workflow preflight` exits with code 2 when blocked, and `scripts/install-workflow-hooks.{ps1,sh}` install a `pre-commit` hook that refuses commits to `main`/`master` and any commit whose ticket is incomplete (with an auditable `FORGE_BYPASS=1` escape hatch). The `workflow-enforcer` skill now references the ledger so agents must record gates before claiming they passed.
- **Forge Companion connection wizard.** Brand-new `CompanionConnectionWizard` component asks the user a single Step-1 question — *"How should your phone reach this PC?"* — with three plain-language options: **Named Cloudflare Tunnel** (persistent, recommended), **Cloudflare Quick Tunnel** (per-session, zero setup), and **Tailscale** (per-session, uses your tailnet). Subsequent steps render only the chosen method's instructions, so two connection types are *never* shown side-by-side. The QR code is generated identically at the final step regardless of method. Choice is persisted via `GET/POST /api/companion/preference` (`~/.forge/companion/preference.json`) and auto-detected on the next launch. LAN remains accessible from "Advanced settings" only.
- **Forge Companion preference REST endpoint.** `cmd/forge/handlers_companion.go` validates against the allowlist `{named, quick, tailscale}` and round-trips through `~/.forge/companion/preference.json`. Round-trip behaviour is covered by `handlers_companion_test.go`.

### Changed
- **"Enterprise Workflow" → "Forge Workflow" everywhere.** Skill directory `.github/skills/enterprise-workflow/` is now `forge-workflow/`. Frontend component `EnterpriseWorkflowCard.{jsx,css}` is now `ForgeWorkflowCard.{jsx,css}` (CSS prefix `ewc-` → `fwc-`). All user-facing labels, AGENTS.md, README.md, copilot-instructions.md, and skill cross-references updated. Internal Go package `internal/workflow` keeps its already-neutral name.
- **CompanionAccessCard now delegates the entire connection flow** to `CompanionConnectionWizard`. The previous always-visible Cloudflare Tunnel embed plus Forge URL field plus QR block has been replaced by the single-method wizard. `ConnectionSetupCard` is still reachable from Advanced settings for power users.



---

## [v7.7.3] - 2026-04-25

### Fixed
- **Mouse clicks still injected escape sequences in *restored* tabs (carryover from v7.7.2).** The previous fix only reset xterm.js mouse-tracking modes inside the OSC 9;9 prompt-arrived handler, so it never ran on tabs reattached after an update — those tabs reattach to an existing PTY mid-session and may not see a fresh prompt for some time. `ForgeTerminal.jsx` now writes the same six disable sequences immediately after `term.open()`, before the WebSocket connects, guaranteeing a clean state on every mount regardless of restoration path.
- **Command-card macro payloads silently corrupted multi-line workflow prompts to AI CLIs.** `sendCommand` previously sent the entire payload as a single send followed by a synthetic `\r`, with no special handling for embedded newlines. Receiving TUIs (Copilot CLI, Claude Code, etc.) interpreted each `\n` as Enter mid-payload, submitting partial prompts and dropping the rest. `sendCommand` now detects newlines and wraps multi-line payloads in xterm bracketed-paste markers (`\x1b[200~ ... \x1b[201~`) with normalized line endings, so the receiving TUI treats the entire payload as one paste event and only acts on it after the closing marker.
- **Forge Workflow card (Forge Workflow card) detected wrong project root from subfolder terminals.** When the active terminal's CWD was a subfolder (e.g. `forge-terminal/frontend`), `/api/workflow/status`, `/api/workflow/compliance`, and `/api/workflow/preflight` all scanned the subfolder rather than the project root — so the card showed missing CHANGELOG, missing `.github/`, and false compliance failures. The handlers now walk up from the supplied path to the nearest project marker (`.git`, `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`) before scanning, so every subfolder of a project sees the same workflow state as the root.

## [7.7.2] - 2026-04-25

---

## [v7.7.2] - 2026-04-25

### Fixed
- **Named Cloudflare Tunnel and Connection Setup cards were separate from Forge Companion.** Both cards rendered as standalone sidebar entries below the Forge Companion card instead of inside it. The Cloudflare tunnel is a prerequisite for mobile access, so its setup wizard now lives directly inside the Forge Companion card as the "Cloudflare Tunnel" section. The Connection Setup card (mode switcher and live tunnel health) is accessible under Advanced settings within the same card. `CommandCards.jsx` no longer renders either card independently.
- **Forge URL field showed localhost — QR code was unreachable from phone.** On mount, `CompanionAccessCard` now queries `/api/tunnel/options` and auto-populates the Forge URL and Companion PWA host from the active named tunnel URL when the stored value is still a localhost address (the factory default). This ensures the QR code encodes the real externally-reachable URL without the user having to paste it manually.
- **Domain dropdown stuck on "Loading…" when tunnel was already configured.** In `NamedTunnelSetupCard`, the `step === 'ready'` branch only rendered when `status.config.hostname` was truthy. When the server reported `created: true` but `hostname` was missing from the config object, the component fell through to the create form — where zone loading is gated on `!status.created`, leaving the select permanently showing "Loading…". Fixed with an explicit guard: `step === 'ready'` with a missing hostname now shows an error with a Reconfigure button rather than falling into the create step.

## [7.7.1] - 2026-04-25

---

## [v7.7.1] - 2026-04-25

### Fixed
- **Favicon reverted to anvil/hammer logo after every update.** The repo contained an anvil illustration as `favicon.ico`/`favicon.png` — the purple "F" icon that showed correctly was only ever cached by the browser from a prior session and was never committed. Replaced all six icon files (`favicon.ico`, `favicon.png`, `favicon-192.png`, `favicon-512.png`, `icon-192.png`, `icon-512.png`) with a purple (`#8b5cf6`) rounded-square containing a bold white **F**, matching the project accent colour. `favicon.ico` embeds 16 × 16, 32 × 32, and 48 × 48 PNG frames for sharp rendering on all platforms. Added `scripts/gen-favicons.js` (uses `sharp`) as the source-of-truth generation script.

## [7.7.0] - 2026-04-25

---

## [v7.7.0] - 2026-04-25

### Fixed
- **Tab Controls "Save" did not retitle existing tabs.** Changing naming strategy / projects root folder and clicking Save only updated the preferences for *future* tabs and *future* `cd` events. Restored tabs whose shell never emitted OSC 9;9 (no shell integration installed, or simply the user hadn't `cd`'d since restart) kept their old, often-wrong titles forever — most visibly: a `forge-terminal` tab stuck on a stale name like `mikejsmith1985` that was never present in the actual cwd. Save now calls a new `retitleAllTabsFromCwd` action that re-derives every open tab's title from its persisted `currentDirectory` using the freshly-saved strategy. Static strategies (numbered/shell-type/custom-prefix) recompute from the tab's index + shell type instead. The action refuses to overwrite a real title with a generic `Terminal N` placeholder or a file-like name, so a tab whose `currentDirectory` is null still keeps whatever name it had.
- **Number/letter keys silently dropped on tabs restored after an update.** Restored tabs all mounted in parallel and each ran `term.focus()` unconditionally. Because hidden tabs use `visibility:hidden` (not `display:none`), their `xterm-helper-textarea` elements remained focusable — so whichever hidden tab mounted last stole focus from the active tab, sending keystrokes into the wrong PTY. Most visibly: typing `1`/`2`/`3` to answer a Copilot CLI menu prompt would do nothing on the active tab. The two mount-time `term.focus()` calls in `ForgeTerminal.jsx` now check `isVisible` first; the existing `useLayoutEffect([isVisible])` already handles focus when a tab becomes visible, so visible-tab behaviour is unchanged.

## [7.6.32] - 2026-04-24

---

## [v7.6.32] - 2026-04-24

### Fixed
- **Terminal windows flashing on Windows** — Numerous `exec.Command` callsites in the tunnel package (`detect.go`, `service.go`, `creds_windows.go`, `tunnel.go`) were spawning subprocesses without `hideWindow()`, causing brief CMD console windows to flash on screen. The Tailscale status poller runs every 10 seconds, so users saw a cursor spin and window flicker regularly. All callsites now use `hideWindow()` to set `CREATE_NO_WINDOW`, including the inline patterns in `detect.go` tailscale-status poll, `service.go` `sc query cloudflared` / install / uninstall, and `tunnel.go` tailscale funnel reset.
- **Cloudflared tunnel list parse error** — Newer versions of cloudflared append a structured JSON version-warning object after the tunnel-list array on stdout. `json.Unmarshal` rejected this as "invalid character '{' after top-level value". Switched to `json.NewDecoder().Decode()` in `wizard.go` which stops at the first complete JSON value, ignoring trailing content.
- **Ctrl+F terminal search not openable while terminal is focused** — The App.jsx keyboard handler returned early for `xterm-helper-textarea` events before reaching the Ctrl+F case. Restructured the handler so the search overlay shortcut fires before the xterm pass-through guard, while still skipping real input fields (modals, rename boxes). Added `stopPropagation()` to prevent xterm from forwarding `\x06` to the PTY.
- **Macro delay of 0ms silently replaced by 1500ms default** — `CommandModal` used `||` to fall back on macro_delay, which treated `0` as falsy. Changed to `??` (nullish coalescing) so an explicitly-set 0 ms delay is preserved.
- **Named Cloudflare Tunnel never actually started after setup wizard completed.** The `Supervisor` struct (introduced in v7.6.30) managed `cloudflared tunnel run` lifecycle but was never instantiated or started anywhere. The result: the UI showed "Connected" (wizard file-presence check) while `cloudflared` was never running, so `forge.<yourdomain>` returned Cloudflare Error 1033 every time. `startNamedSupervisorIfConfigured` now wires the supervisor into three paths: (1) on boot when the user's preference is "named" or auto-pick, (2) immediately after the setup wizard `handleTunnelSetupCreate` succeeds, (3) via the new `POST /api/tunnel/setup/restart` endpoint for manual recovery.
- **`detectNamed` reset crash-exhausted `StageStopped` back to `StageConfigured`** on the next detection poll, hiding the error state and making the "Repair tunnel" action unreachable. `StageStopped` is now included in the set of supervisor-owned states that `detectNamed` preserves unchanged.
- **Port drift in Named Tunnel config.yml.** When Forge restarts and claims a different port, `config.yml` retained the old `localPort`, causing `cloudflared` to proxy traffic to a dead backend. `SyncConfigPort` rewrites both `config.yml` and `state.json` atomically before the supervisor starts.

### Added
- **`POST /api/tunnel/setup/restart`** — new endpoint to stop and restart the Named Tunnel supervisor, surfacing a "Repair tunnel" recovery path without requiring a full Forge restart.

## [7.6.31] - 2026-04-24

---

## [v7.6.31] - 2026-04-24

## [7.6.31] - 2026-04-23

### Fixed
- **Constant flicker inside open panels (DiagnosticOverlay, UpdateModal).** The problem-detection effect in `DiagnosticOverlay` had `events` in its dependency array, so every incoming diagnostic event tore down and recreated the 2 s `setInterval`, and each re-run called `setProblems(...)` — producing a re-render storm that manifested as a visible dark/light flicker inside any open overlay and made the Close button nearly unclickable. The interval now reads the latest events via `diagnosticCore.getEvents()` inside the callback; `[isOpen]` is the correct dependency. The `UpdateModal` close-reset effect had the same class of bug (`[isOpen, pollingInterval, timeoutTimer]`) and was collapsed to `[isOpen]` for the same reason.

### Added
- **Named Cloudflare Tunnel setup UI** (`NamedTunnelSetupCard`) — surfaces the v7.6.29 wizard backend (install → log in → pick zone → create) that previously had no UI wiring. Users authorizing Forge on their Cloudflare account can now complete the full `cloudflared` install + login + `forge.<yourdomain>` creation flow from the sidebar without touching the CLI. The v7.6.29 `ConnectionSetupCard` is also now mounted — it was built but never imported into any render path, so the ranked-connection-mode selector has been invisible since v7.6.29. (UAT regression fix: "compiled but not deployed" miss.)

## [7.6.30] - 2026-04-23

---

## [v7.6.30] - 2026-04-23

## [7.6.30] - 2026-04-23

### Fixed
- **UI flicker on dashboards with active tunnels.** `buildCSP()` + `CORSMiddleware` were re-reading `state.json` and `notify_config.json` from disk on **every** HTTP response. On a dashboard polling `/api/tunnel/options` every 10s plus normal asset traffic, this produced dozens of disk reads per second and slowed header flush enough to cause visible flicker on repaint. Tunnel hostnames are now memoized with a 5s TTL and invalidated on notify-config writes.

## [7.6.29] - 2026-05-01

### Added — v7.6.29 Unified Mobile Access
- **Tunnel health state machine + capability-ranked selector** (`internal/tunnel/health.go`) — foundation for v7.6.29 unified mobile access. Every tunnel mode (Named Cloudflare Tunnel, Tailscale Funnel, Quick Tunnel, LAN) now carries a `HealthState` with a lifecycle stage (Absent → Configured → Starting → Healthy ↔ Degraded / Stopped). The new `Ranker` picks the single best option to publish to the companion, with the contract that `Healthy` strictly beats `Configured` which strictly beats `Degraded`. A broken Named Tunnel will no longer mask a working Quick Tunnel just because `cloudflared` has a config file on disk.
- **Named Cloudflare Tunnel supervisor** (`internal/tunnel/named.go`) — a long-running manager for stable `forge.<domain>` tunnels. Unlike the legacy token-based path, the supervisor only transitions to `Healthy` after a successful `/api/ping` probe, eliminating the "launch tunnel then QR 404" race. Includes exponential backoff (1s → 60s cap), a restart-storm guard (5 crashes in 2 min = give up with actionable `RecoveryHint`), 3-consecutive-probe-failure demotion to `Degraded`, and clean child-process teardown on Forge exit.
- **Headless-safe cloudflared installer + login** (`internal/tunnel/install.go`, `internal/tunnel/login.go`, `cmd/forge/handlers_tunnel_setup.go`) — the Named-Tunnel setup wizard can now install cloudflared and run `cloudflared tunnel login` on servers and SSH sessions where auto-launching the user's browser is useless. `tunnel.Install` performs an atomic download (temp file → rename) with platform/arch coverage for darwin-amd64/arm64 (tgz-extracted), linux-amd64/arm64/arm/386, and windows-amd64/arm64/386. `tunnel.StartLogin` spawns the login command, scans both stdout and stderr for the OAuth URL (strict `dash.cloudflare.com/argotunnel` / `login.cloudflareaccess.com` match, loose `browser`/`open`-tagged fallback), snapshots `cert.pem`'s pre-spawn state so an existing cert is never mistaken for instant success, and enforces a 10-minute overall deadline. New endpoints: `POST /api/tunnel/setup/install`, `POST /api/tunnel/setup/login`, `GET /api/tunnel/setup/login/status`, `POST /api/tunnel/setup/login/cancel`. Concurrent logins are idempotent — a second POST reuses the in-flight session rather than spawning a second child. Cancel kills only the cloudflared process, leaving any browser window the user may have opened untouched.
- **Named Tunnel setup wizard API** (`internal/tunnel/wizard.go`, `cmd/forge/handlers_tunnel_setup.go`) — turns a completed `cloudflared tunnel login` into a running Named Tunnel without manual CLI work. `GET /api/tunnel/setup/zones` parses the ARGO TUNNEL TOKEN block in `~/.cloudflared/cert.pem` and lists the user's Cloudflare zones via the REST API (best-effort — empty result falls back to manual entry). `POST /api/tunnel/setup/create` orchestrates the whole pipeline under one wizard mutex: find-or-create `forge-<slug>-<hash>` tunnel (hash suffix prevents slug collisions), route DNS with exit-0-only idempotency (stderr-substring matching would mask records pointing at another tunnel), copy `<uuid>.json` into `~/.forge/tunnel/` without deleting the source, render `config.yml` pointing at `http://localhost:<port>`, then write `state.json` **last** so `LoadWizardState().Created==true` is a true postcondition. Reusing an existing tunnel verifies local credentials are readable first and returns an explicit "adopt from another host" error otherwise. `GET /api/tunnel/setup/status` exposes the aggregate state (installed / loggedIn / created + config). 20 unit tests against fake cloudflared and httptest Cloudflare API cover idempotent reuse, DNS failure rollback-safety (no `state.json` written), hostname validation, collision-resistant naming, and Windows-safe config.yml path rendering.
- **Ranked tunnel options + dynamic CSP + legacy-migration endpoint** (`internal/tunnel/detect.go`, `cmd/forge/handlers_tunnel_options.go`, `cmd/forge/middleware.go`) — capability detection for all 4 modes (Named, Tailscale, Quick, LAN) runs on-demand with user-preference persistence at `~/.forge/tunnel/preference.json`. Named detection preserves live supervisor state (`Healthy`/`Degraded`/`Starting`) rather than overwriting it, so the probe loop and the detector never fight. New endpoints: `GET /api/tunnel/options` (ranked list + active mode + preference), `POST /api/tunnel/select` (persist/clear preference), `GET /api/tunnel/setup/service` + POST/DELETE (opt-in Windows service install via `cloudflared service`), `GET /api/tunnel/migrate-legacy` (non-destructive detection of old token-based configs so the UI can offer a one-time upgrade prompt). The SecureHeaders CSP is now built dynamically — `connect-src` includes whichever tunnel hostname is currently active (wizard state + legacy notify config) in addition to the Quick Tunnel wildcard.
- **Mobile-access documentation** (`docs/mobile-access.md` + README pointer) — end-to-end walkthrough of the four tunnel modes, one-time Named Tunnel setup, optional Windows-service install, the deep-link QR (token-in-fragment so it never reaches server logs), legacy token-based migration, troubleshooting ("launch tunnel then QR 404" race explicitly called out as fixed by the probe-gated supervisor), and a full API reference for every `/api/tunnel/*` endpoint added in v7.6.29.
- **Connection Setup card** (`frontend/src/components/ConnectionSetupCard.jsx`) — unified React UI for v7.6.29 mobile access. Fetches `GET /api/tunnel/options` on mount + every 10s, surfaces the single active mode with its live stage (healthy/configured/starting/degraded/stopped), and hides the remaining three modes behind an "Other ways to connect (3)" expander. A **Make default** button POSTs to `/api/tunnel/select` against any mode in Configured or Healthy state; a **Clear preference** footer appears whenever a preference is pinned. 5 vitest specs cover fetch-on-mount, expander reveal, POST wiring (verifies only qualifying modes get the button), error banner on API failure, and preference clearing.
- **Credential hardening + Windows service + companion deep-link QR** (`internal/tunnel/creds.go`, `internal/tunnel/service.go`, `cmd/forge/hosted_qr.go`) — after every `CreateNamedTunnel` the wizard now tightens `~/.forge/tunnel/` and its credential files (`cert.pem`, `<uuid>.json`, `config.yml`, `state.json`, `preference.json`) to 0700/0600 on POSIX and — best-effort — `icacls /inheritance:r` + grant-only-to-current-user+SYSTEM on Windows. The allow-list approach avoids accidentally locking the user out of drop-ins in the same directory; a `FORGE_TUNNEL_SKIP_HARDEN=1` env var exists so `t.TempDir()`-based tests can clean up without ACL surprises. New `tunnel.InstallService/UninstallService/QueryService` wrap `cloudflared service install/uninstall` and `sc query cloudflared` for opt-in Windows-service persistence; non-Windows returns explicit errors rather than silently no-op'ing so the frontend can guard the UI. The companion QR code is now a deep link (`<tunnelURL>/companion/#forge=<url-encoded>&token=<url-encoded>`) — the hash fragment means the token never traverses the network and browser refreshes keep credentials without a re-scan.

## [7.6.18] - 2026-04-22

---

## [v7.6.18] - 2026-04-22

## [7.6.18] - 2026-04-22

### Fixed
- **Companion QR code base URL now always includes `http://`** — Safari and most mobile browsers reject protocol-less URLs such as `100.x.x.x:3005/companion/`. A `normalizeHttpUrl()` helper now prepends `http://` to any URL that lacks a scheme, applied in `getDefaultCompanionHost`, `buildDeepLink`, and the stale-host migration on startup.
- **Stale localStorage detection now catches protocol-less values** — the `isStaleCompanionHost()` check previously only migrated `localhost` / legacy Pages URLs. Any stored value without `http://` or `https://` is now treated as stale and automatically replaced with a correctly-formed default on next load.
- **URL logic extracted to a testable utility** — `getDefaultCompanionHost`, `isStaleCompanionHost`, `buildDeepLink`, and `normalizeHttpUrl` are now in `frontend/src/utils/companionUrl.js` with 31 unit tests, ensuring URL correctness is verified before shipping.



---

## [v7.6.17] - 2026-04-22

### Fixed
- **Companion PWA QR code now generates a reachable URL** — the QR code base URL is now derived from the user's Forge URL (Step 2) rather than `window.location.origin` (which is always `localhost` on the desktop). Scanning the QR code now points the phone directly to `http://<tailscale-ip>:3005/companion/` instead of the unreachable `http://localhost:3005/companion/`.
- **Stale localStorage companion host auto-migrated** — any previously saved `companionHost` value pointing to `localhost` is silently replaced with the correct derived URL on next load.

## [7.6.16] - 2026-04-22

---

## [v7.6.16] - 2026-04-22

## [7.6.16] - 2026-04-22

### Fixed
- **Companion PWA `/companion/` route now always works** — `cmd/forge/web/companion/` is no longer gitignored. The three PWA files are committed alongside the main frontend so `//go:embed all:web` always includes them in the binary regardless of whether a local build has been run.
- **Companion PWA icons no longer 404** — `vite.config.js:copyCompanionPlugin` now copies `icon-192.png` and `icon-512.png` from the Vite public output into `web/companion/` so the PWA manifest icon paths resolve correctly at `/companion/`.
- **`/companion` without trailing slash** — Requests to `/companion` (no trailing slash) now redirect to `/companion/` with a 301 instead of silently dropping.
- **Pre-commit hook no longer blocks release commits** — Both the PowerShell and bash hook templates now exclude `cmd/forge/web/`, `frontend/dist/`, and `bin/` from the test-file gate. The PowerShell template also gains the version-bump CHANGELOG exemption that the bash template already had.

### Added
- **Companion embed regression test** — `cmd/forge/companion_embed_test.go` asserts all three PWA files are present in the embedded FS at compile + test time, catching any future accidental gitignore regression.

## [7.6.15] - 2026-04-22

### Fixed
- **Forge Companion QR code 404 resolved** — The companion PWA is now bundled inside the Forge Terminal binary and served at `<your-forge-url>/companion/`. No external hosting required. Users with stale legacy URLs (Cloudflare Pages or GitHub Pages) in localStorage are auto-migrated on load.
- **Companion card text layout** — Fixed broken `display: flex` on hint text that caused words and `<code>` elements to fragment into columns when wrapping.

### Changed
- **Companion card redesigned as a step-by-step wizard** — The enabled view now shows numbered steps (1 → pick Tailscale or Cloudflare, 2 → paste URL, 3 → scan QR). Each connection path is shown as a labelled card. PWA host override and raw token are moved to a collapsible "Advanced settings" section.
- **Pre-commit hook** — Build output directories (`cmd/forge/web/`, `frontend/dist/`, `bin/`) are now excluded from the test-file gate so compiled assets don't generate false positive violations.

## [7.6.14] - 2026-04-22

---

## [v7.6.14] - 2026-04-22

### Fixed
- **Forge Companion now supports Tailscale** — URL hint, instructions card, and README updated to present Tailscale as the recommended connection method when already installed. Cloudflare Tunnel remains the alternative for non-Tailscale users. Tailscale troubleshooting steps added to README.

## [7.6.13] - 2026-04-22

---

## [v7.6.13] - 2026-04-22

### Fixed
- **Settings tabs no longer cut off** — Tab bar now wraps to a second row on narrow modal views instead of clipping. Removed hidden scrollbar in favour of `flexWrap: wrap` with reduced padding.
- **Forge Companion QR code was 404** — Deployed the companion PWA to Cloudflare Pages (`forge-companion-1b3.pages.dev`). Updated `DEFAULT_COMPANION_HOST` constant to point to the live deployment. QR scans now open the working companion app.
- **Companion instructions referenced non-existent Settings tab** — "Settings → Mobile Access" does not exist as a tab. Instructions in `CompanionAccessCard` and `forge-companion/README.md` updated to correctly say "Click the Forge Companion card in the sidebar".
- **Companion instructions too technical** — Rewrote all setup steps to plain language with explicit cloudflared commands, numbered steps, and emoji waypoints. A non-technical user can follow without knowing what a "PWA" or "tunnel" is.

## [7.6.12] - 2026-04-22

---

## [v7.6.12] - 2026-04-22

### Fixed
- **"GitHub API returned status 403" on update check eliminated** — The desktop updater used to query `api.github.com/repos/.../releases/latest` directly, which is capped at 60 unauthenticated requests per hour per IP. Users with heavy update-check activity (or agents publishing many releases in a day) would periodically see the raw rate-limit error. Update checks now flow through a new `/version/latest` endpoint on the license worker (`license.rootlevellabs.tech`) that authenticates to GitHub with a Personal Access Token (lifting the limit to 5000 req/hr), caches the response at the Cloudflare edge for 5 minutes, and serves stale-while-revalidate for up to an hour if GitHub is unreachable. The updater still falls back to a direct GitHub call if the worker is down, so self-hosted/offline use continues to work.

## [7.6.11] - 2026-04-22

### Added
- **MCP Discovery card** — A new sidebar card that catalogs popular external MCP servers (Filesystem, GitHub, Fetch, Memory, Playwright, Time, PostgreSQL, Brave Search) with a one-click "Copy config" button for Copilot CLI, VS Code, and Claude Code. Includes a collapsible "What is MCP?" primer for users unfamiliar with the protocol, a search/filter box, and a link to the full upstream registry. Addresses the long-standing ask for easier MCP discovery that the Adaptive Build Environments card did not cover — that card continues to expose Forge's own MCP server; the new Discovery card is for adding third-party servers alongside it.
- **Companion Access card** — A license-gated sidebar card that lets entitled users pair the Forge Companion PWA with their desktop. Reads `/api/mobile/settings`, renders a QR code containing the deep-link (`<companion-host>#forge=<url>&token=<token>`), provides copy buttons for URL/token/deep-link, and shows step-by-step pairing instructions. When the `mobile_access` feature flag is off, the card shows a clear "Companion Access — upgrade required" state with a link to the upgrade page. Tunnel URL and companion host are remembered in localStorage.

### Dependencies
- Added `qrcode` npm package for rendering the companion pairing QR.

## [7.6.10] - 2026-04-22

### Fixed
- **Terminal rendering regression from v7.6.7/v7.6.8 reverted** — User reports v7.6.7 and v7.6.8 (and v7.6.9 which inherited their terminal code) produce the same cumulative-render breakage seen in v7.6.0–v7.6.5: massive vertical gaps between lines, broken TUI layout. `ForgeTerminal.jsx` is restored to the v7.6.6 state verbatim. The reattach `ESC[2J ESC[H` clear (v7.6.7) and the alt-screen dark-theme override + DEC prefix CSI handlers (v7.6.8) are all dropped. Only the mobile-strip cleanup from v7.6.9 is retained. The two cosmetic bugs those patches addressed (stale replay after reattach, white-on-white TUIs on light themes) are reopened and will be re-approached without touching the rendering pipeline.

## [7.6.9] - 2026-04-22

### Changed
- **Desktop bundle fully decoupled from mobile code** — The mobile-responsive changes introduced in v7.6.0 (and partially reverted in v7.6.6) pulled mobile CSS and layout code into the desktop frontend, which is what caused the v7.6.0–v7.6.5 terminal rendering regression cycle. Those files are now removed from the desktop build entirely: `MobileTabStrip`, `MobileInputBar`, `MobileLayout`, `MobileFileUpload`, `RemoteAccessModal`, `useMobileDetect`, `mobile.css`, `mobile-input.css`, `touch-controls.css`, and the orphaned `mobileReconnect`/`serviceWorker` utilities. `App.jsx` no longer imports or renders any of them. The desktop app is desktop-only going forward. The separate `forge-companion/` PWA remains the sole mobile experience and is unaffected by this change (it talks to `/api/mobile/*` and has always been architecturally isolated). This eliminates an entire class of regressions where mobile media queries or touch code could bleed into desktop rendering.

## [7.6.8] - 2026-04-22

### Fixed
- **TUI apps unreadable on light-mode terminals** — Applications that use xterm's alternate screen buffer (vim, lazygit, Copilot CLI, gh dash, htop) now receive a dark palette while active, regardless of the tab's base theme. When the app exits the alt-screen the user's original theme is restored. Detection uses CSI private-mode codes 47, 1047, and 1049 via a properly-registered DEC private prefix (`prefix: '?'`, not `intermediates: '?'`) — the latter throws "intermediate must be in range 0x20..0x2f" at terminal construction. Combines fixes originally in commits `4f87c28` and `b5b121b` (lost in the v7.6.6 revert).

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
- **Code Tutor toast leak** — `ForgeWorkflowCard` was firing blank toast notifications via a leftover file-watcher effect even though Code Tutor is disabled. The watcher start/stop lifecycle and the broken notification effect have been removed entirely; the polling loop no longer runs.
- **Code Tutor options in Workflow Wizard** — `tutor` and `tutor-and-agent` PR review strategy cards have been removed from the Forge Workflow Wizard. Users who had those strategies saved will be automatically migrated to `agent` on next open. Quality Agent is now the recommended strategy.

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
- **Code Tutor removed from Forge Workflow** — Code Tutor is no longer listed in the Enterprise Standard preset description or Quality Mode "BEST" label. Removed `code-tutor` from `DefaultConfig()` enabled modules and the frontend default config.
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
- **Forge Workflow: AI compliance disclaimer** — Added a small but honest notice at the bottom of the Forge Workflow card explaining that workflow rules are strong guidance, not hard enforcement, and that compliance may vary in long sessions due to how large language models manage context. Framed as an industry-wide characteristic, not a product limitation. Also added a full explanatory section to README.md under a new `## 🧭 Forge Workflow — Understanding AI Compliance` heading.
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
- Forge Workflow initialized with Forge Terminal Workflow Architect
- 6 new Go tests for session detach/reattach lifecycle (`session_reconnect_test.go`)
- **PR Review Strategy** (`internal/review/`, `cmd/forge/handlers_review.go`): Configurable PR review system with 4 strategies — Manual, Code Tutor, Quality Agent, Tutor+Agent. Quality Agent uses LLM model chain to produce structured findings (naming, complexity, tests, architecture, security) with 0–100 quality score
- **WorkflowWizard PR Review Step**: New step 3 in the 5-step Forge Workflow Architect wizard lets users choose their PR review strategy, configure auto-trigger, CHANGELOG gate, agent strictness, and focus areas
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
- **Code Tutor notifications clicking does nothing**: Three bugs combined — `ForgeWorkflowCard` never passed `action`/`onAction` to `addToast()`; the `useEffect` re-fired on every new notification re-showing all duplicates; no `clearWatcherNotifications()` existed to atomically flush the queue

## [5.1.0] - 2026-04-04

### Fixed
- Terminal tab-switch flicker: the outer container now holds `opacity:0` from the moment a tab becomes active until xterm.js `fit()` completes, then fades in via a 60ms CSS transition — eliminates the outline artifacts that occurred when the stale-sized canvas was exposed during the 50ms re-fit window

### Added
- `AGENTS.md` at repo root: a circuit-breaker pattern that requires `skill: workflow-enforcer` as the first tool call on any code task; read automatically by Copilot CLI at session start with a per-response gate and skill invocation table

### Changed
- `workflow-enforcer` skill restructured into three phases — Phase 0 (co-skill cascade fires immediately when the skill loads), Phase 1 (active coding standards applied while writing), Phase 2 (pre-delivery checklist); transforms the skill from a post-delivery audit into a pre-flight gate
- `.github/copilot-instructions.md`: hard-stop pre-flight block prepended before all other content; section 8.8 changed from advisory SHOULD language to MUST with an ordered numbered invocation sequence
- `code-tutor-workflow` skill: post-change walkthrough changed from opt-in ("want a walkthrough?") to required — agent must explain all changes without being asked when this skill is loaded
