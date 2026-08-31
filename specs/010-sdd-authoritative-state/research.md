# Phase 0 Research: SDD Authoritative State & Concise Phase Reports

**Feature**: 010-sdd-authoritative-state
**Date**: 2026-06-21

This document resolves the unknowns in the Technical Context before design. Each section follows Decision / Rationale / Alternatives.

---

## R1 — How does an authoritative "phase started" signal reach the backend?

**Decision**: Use a Claude Code **PreToolUse hook on the `Skill` tool**. It fires deterministically before any `speckit-*` skill runs, receives `tool_input` (the skill name) and `cwd` on stdin, and can read `$env:FORGE_SESSION_ID`. The hook POSTs a "phase started" event to the backend, scoped by session, and performs the scoped gate-check in the same call.

**Rationale**: PreToolUse is fired by the harness, not the agent, so it cannot be forgotten. It already exists in the codebase (`scripts/sdd-gate-check.ps1`) — we extend it rather than build new. It is the earliest deterministic point at which we know the exact phase by name.

**Alternatives considered**:
- *File-watcher inference (status quo)* — rejected: racy, the root cause of the 10+ failed releases.
- *PostToolUse(Skill)* — rejected: confirmed it fires when the skill **prompt is injected**, not when the phase work completes, so it cannot be a completion signal (it is, however, equivalent to PreToolUse for a "started" signal).

---

## R2 — How does an authoritative "phase complete" signal (with decisions) reach the backend?

**Decision**: The phase **completion + decisions** are emitted by the skill's own mandatory final step. Each `speckit-*` skill ends with an instruction for the agent to POST a `phase-complete` event to `POST /api/sdd/phase-event` carrying the phase name and a short `decisions[]` list, scoped by `$env:FORGE_SESSION_ID`. **Disk reconciliation** is the sole shipped safety net if the agent's emission is missed.

**Rationale**: FR-007a *requires* the decisions list to come from the phase command, not from inference — so the completion signal must originate in the skill workflow regardless. The agent already reliably executes the skills' "Completion Report / Post-Execution Hooks" steps. "Complete" cannot come from a harness tool-hook because no tool boundary coincides with "phase work done" (see R1 alternative). Disk reconciliation provides convergence when emission is missed, satisfying FR-002.

**Alternatives considered**:
- *Stop hook as a fallback* — considered (fires at end of turn, deterministic) but **rejected and out of scope**: it fires every turn (a phase may span turns; a turn may end mid-phase) and carries no decisions, so it adds complexity without covering FR-007a. Disk reconciliation already converges a missed `complete`, so the Stop hook is unnecessary belt-and-suspenders.
- *Stop hook as the primary completion signal* — rejected: same reasons, and it cannot carry decisions.
- *Terminal-quiet detection as primary* — rejected: it is exactly the heuristic FR-001b demotes to fallback.

---

## R3 — How is a reliable per-tab session identity established? (highest risk)

**Decision**: Inject `FORGE_SESSION_ID=<session id>` into each terminal session's environment, using the **same `id` the backend already assigns** at `NewTerminalSession(id)` and the **same value the frontend uses as `activeTabId`** for `/api/sdd/bind` and WebSocket filtering.
- **Unix**: append `FORGE_SESSION_ID=<id>` to `cmd.Env` in `session.go` (clean, the env slice is already built there).
- **Windows (ConPTY)**: write `$env:FORGE_SESSION_ID='<id>'` into that specific ConPTY at startup — the **same per-tab mechanism already used for `FORGE_INSTANCE_PID`/`FORGE_INSTANCE_PORT`** in `pty_windows.go`. This requires threading the session `id` into `startPTYWithShell` (today it takes only shell/args/workingDir).

**Rationale**: The id already exists and is already the hub/bind key, so no new identifier is introduced — we only propagate it into the shell env. The Windows write-into-shell injection is a **known, shipping** mechanism (not new risk); `FORGE_INSTANCE_PID` proves it works per-tab. The agent (`claude`) is launched by the user *after* the tab's shell is ready, so the ~100 ms injection has long completed before any hook fires — the historical timing risk does not apply to this manual-launch flow.

**Verification required in implementation** (recorded as a task, per Article X): confirm the `id` passed to `NewTerminalSession` is byte-identical to the frontend's `activeTabId` used in `bind`/WS filtering. If they differ, add an explicit mapping rather than guessing.

**Alternatives considered**:
- *Process-wide `os.Setenv` (current debug-session approach)* — rejected: `session.go:247` itself flags it as "risky for concurrent differing sessions"; it cannot distinguish tabs.
- *Claude Code's own `session_id` from the hook payload* — rejected as the key: it identifies the `claude` process, not the Forge tab, and would still require a mapping back to the tab. The injected `FORGE_SESSION_ID` is the direct, unambiguous link.

---

## R3a — T001 verification result (2026-06-22): identity is equal end-to-end ✅

**Finding**: The `id` passed to `NewTerminalSession(id)` is **byte-identical** to the frontend `activeTabId` used for `/api/sdd/bind` and WebSocket filtering. No mapping layer is required. The whole chain keys on the tab's id.

**Evidence (traced)**:
- Frontend opens the terminal WS with `?tabId=<tab.id>` — `frontend/src/components/ForgeTerminal.jsx:1728` (`params.set('tabId', tabId)`).
- Backend reads it and aliases it to the session id — `internal/terminal/handler.go:594` (`tabID := query.Get("tabId")`) then `:613` (`sessionID := tabID  // Use tabID as session ID for consistency`).
- PTY is created with that id — `handler.go:731` (`NewTerminalSessionWithConfig(sessionID, …)`); `sessions` and `hubs` maps are both keyed on the same `sessionID`.
- SDD bind sends the same value — `frontend/src/App.jsx:461` (`body: { sessionId: activeTabId, … }`); pipeline stored as `sddPipelineFor(activeTabId)`.
- WS broadcast + client filter use the same value — `BroadcastJSONToSession(sessionID)` → hub keyed by `tab.id`; `useSddGate({ activeSessionId: activeTabId })` drops mismatched-session messages.

**Conclusion**: Injecting `FORGE_SESSION_ID = <PTY session id>` (i.e. `tab.id`) makes the hook/agent identity match the bind key and the broadcast key automatically. The R3 plan stands unchanged.

**One caveat to carry into Phase 2**: `handler.go:595-598` falls back to a fresh `uuid.New()` when `tabId` is absent from the query. The frontend always sends it (`ForgeTerminal.jsx:1728`), so this only fires in anomalous cases — but if it does, the injected `FORGE_SESSION_ID` would be a uuid the SDD pipeline never bound, yielding an **unbound** session. That is exactly the FR-011a graceful-degrade path ("unbound — SDD inactive"), so no special handling is needed; just inject whatever the real session id is and let the unbound path cover the gap.

**Watcher / reattach note**: multiple WS clients can share one `sessionID` (watcher joins) and a detached PTY is reused on reattach — in both cases the PTY (and its `FORGE_SESSION_ID`) was created once with `tab.id`, so no re-injection is needed.

---

## R4 — How is the gate-check scoped to one session?

**Decision**: Add a `sessionId` query parameter to `GET /api/sdd/gate-check`. `handleSddGateCheck` looks up **only that session's** pipeline (`sddPipelineFor(sessionId)`) instead of `Range`-ing over all pipelines. The hook passes `?sessionId=$env:FORGE_SESSION_ID`. When `FORGE_SESSION_ID` is empty (unbound tab), the hook treats the tab as SDD-inactive and allows the call (FR-011a graceful degrade).

**Rationale**: Directly removes the global first-match conflation (`handlers_sdd.go:131`). Backward-compatible: a missing `sessionId` can preserve legacy behaviour during migration, but the shipped hook always sends it.

**Alternatives considered**:
- *Keying pipelines by `(repoRoot, sessionId)`* — unnecessary: `sessionId` is already unique per tab; scoping the **lookup** is sufficient and smaller.

---

## R5 — How are "files touched" + change magnitude computed for the phase window? (FR-014)

**Decision**: At the **phase-started** event, the backend captures a baseline tree snapshot of the repo via `git stash create` (or, if the tree is clean, the current `HEAD`), storing the resulting commit-ish on the pipeline state. At **phase-complete**, compute `git diff --numstat <baseline>` scoped to the repo to produce the touched-files list with added/removed line counts. If git is unavailable or no baseline could be captured, the card lists files from the file-watcher's observed set and marks magnitude "unavailable" (FR-013).

**Rationale**: `git stash create` records the working-tree state as a dangling commit **without modifying the tree or index** — the safest way to snapshot mid-session uncommitted work. Diffing against it yields exactly the changes within the phase window (FR-014), excluding pre-existing dirty state. Git is already a hard dependency of the project.

**Alternatives considered**:
- *All uncommitted changes (`git status`)* — rejected: attributes pre-existing edits to the phase (FR-014 violation).
- *File-watcher event set only* — kept as the degraded fallback when git can't produce magnitude.

---

## R6 — Report card data shape and the ≤100-word rendering (FR-007, FR-008)

**Decision**: The backend builds a structured `PhaseReportCard` (files[], scope string, decisions[]) and sends it in the existing `SDD_PHASE_GATE` envelope. The frontend renders it as three grouped bullet sections in the existing `SddDashboard`/decision-card components. The full verbose output is **not** placed in the card; a "View full output" action opens the phase artifact (e.g. `spec.md`) on demand (FR-009).

**Rationale**: Reuses the shipped gate-card UI and WebSocket envelope (Article VII — don't rebuild). Keeping decisions/scope as discrete arrays lets the renderer enforce scannability (truncate long file lists with a "+N more") without dropping the structured essentials.

**Alternatives considered**:
- *Embedding rendered Markdown in the card* — rejected: reproduces the wall of text the feature exists to remove.

---

## R7 — Migration approach (retrofit vs rewrite)

**Decision**: Retrofit in place (locked by clarification). Keep `internal/sdd/orchestrator.go`'s state machine and `ReconcileFromDisk`. Change only the **trigger**: `MarkPhaseRunning` is driven by the phase-started event; `HandlePhaseComplete` by the phase-complete event. The file-watcher (`detector.go`) and quiet-detection (`scheduleQuietDetection`) remain wired but become fallback paths.

**Rationale**: Reuses the tested state machine (Article VII), minimises diff surface, and avoids two divergent state systems — the failure mode of prior attempts.

---

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| Authoritative "started" signal | PreToolUse(Skill) hook → `phase-event` (R1) |
| Authoritative "complete" + decisions | Skill final-step emission → `phase-event`; disk-reconciliation fallback (R2) |
| Per-tab identity | `FORGE_SESSION_ID` env via existing per-tab injection (R3) |
| Gate-check scoping | `sessionId` query param; per-session lookup (R4) |
| Files-touched window | `git stash create` baseline + `--numstat` diff (R5) |
| Card shape & brevity | Structured `PhaseReportCard` in `SDD_PHASE_GATE`; opt-in full output (R6) |
| Migration | Retrofit orchestrator; demote watcher/quiet to fallback (R7) |

No unresolved NEEDS CLARIFICATION items remain.
