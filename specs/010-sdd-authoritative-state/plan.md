# Implementation Plan: SDD Authoritative State & Concise Phase Reports

**Branch**: `feature/010-sdd-authoritative-state` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-sdd-authoritative-state/spec.md`

## Summary

Make the SDD phase dashboard trustworthy by replacing inferred state with **reported** state. Phase transitions are driven by authoritative signals — a deterministic PreToolUse hook for "phase started" and a skill-emitted event for "phase complete + decisions" — with the existing file-watcher/quiet-detection/disk-reconciliation demoted to a fallback that only ensures convergence. Each terminal tab gets a stable `FORGE_SESSION_ID` (propagated from the id the backend already assigns), so every signal, gate-check, and broadcast is scoped to exactly one pipeline and concurrent pipelines never conflate. The verbose gate document is replaced by a concise, structured **report card** (files touched with +/- counts, scope, decisions) rendered as grouped bullets ≤100 words, with the full speckit output available via an opt-in action.

## Technical Context

**Language/Version**: Go (backend, `cmd/forge`, `internal/sdd`, `internal/terminal`); JavaScript/React (frontend, `frontend/src`).

**Primary Dependencies**: existing — `UserExistsError/conpty` (Windows PTY), the in-repo SDD orchestrator, the React dashboard components, the Claude Code PreToolUse hook, and git. No new runtime libraries. (The Stop hook was considered for completion-fallback and rejected — disk reconciliation is the sole fallback.)

**Storage**: in-memory pipeline state (`sync.Map`) + on-disk artifacts (canonical, unchanged) + git working tree (baseline snapshots).

**Testing**: Go unit (mocked, <10 ms) + Go integration (real endpoints/git) + Playwright UX via `run-dev-clean.ps1`.

**Target Platform**: Windows 11 desktop (primary); Unix path kept correct.

**Project Type**: Desktop application (Go backend + web frontend in an Electron/web shell).

**Performance Goals**: authoritative phase reflected ≤2 s after the command completes (SC-004); report card ≤100 words (SC-005).

**Constraints**: localhost-only endpoints, no new auth; retrofit-in-place (no parallel state machine); per-tab env injection must reuse the existing ConPTY mechanism.

**Scale/Scope**: multiple concurrent pipelines (one per open tab); small data volumes (a handful of phases per pipeline).

## Constitution Check

*GATE: must pass before Phase 0 research and re-checked after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| I — Prime Directive (BEST route) | Retrofit reuses the tested state machine; authoritative-signal redesign is the durable fix, not a patch. | PASS |
| II — Process Protection | No wildcard process kills; any dev restart targets a specific PID. | PASS (enforced in tasks) |
| III — Branching | Work on `feature/010-sdd-authoritative-state`; PR to main. | PASS |
| IV — Code Quality | Self-documenting names, file purpose comments, functions <40 lines, guard clauses. | PASS (enforced in tasks) |
| V — Testing (three-layer) | Unit mocked <10 ms; integration real (endpoints + git); UX Playwright via `run-dev-clean.ps1`, real events; Red→Green→Refactor. | PASS |
| VI — Documentation | CHANGELOG.md updated in the PR; no auxiliary status docs (this `specs/010/` tree is the exempt pipeline artifact). | PASS |
| VII — Framework-First | Uses the Claude Code PreToolUse hook, existing orchestrator, existing React card UI, existing per-ConPTY env injection, and git — no rebuilt infrastructure. Justifications recorded in research.md. | PASS |
| VIII — Release | Local pipeline only (`scripts/local-release.ps1`); never GitHub Actions. | PASS |
| IX — Vault Zero-Knowledge | No secrets involved. | N/A |
| X — Verification & Proof | UX proof reads the xterm.js buffer model, not the DOM; quickstart scenarios are evidence-based. | PASS |
| XI — Output/Dashboard Restraint | The report card IS the single sanctioned dashboard surface; no extra dashboard files; no phase-name narration to the user. | PASS |

**No violations** → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/010-sdd-authoritative-state/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (R1–R7)
├── data-model.md        # Phase 1 — entities & transitions
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   ├── phase-event-endpoint.md   # new POST /api/sdd/phase-event
│   └── gate-check-endpoint.md    # scoped GET /api/sdd/gate-check + hook contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root) — touch points

```text
cmd/forge/
├── handlers_sdd.go      # scope gate-check by sessionId; add phase-event handler
├── sdd_wiring.go        # drive MarkPhaseRunning/HandlePhaseComplete from phase-event;
│                        #   capture git baseline; build PhaseReportCard; demote watcher
└── main.go              # register POST /api/sdd/phase-event route

internal/sdd/
├── types.go             # PipelineState: add PhaseBaseline; PhaseReportCard + FileChange
├── orchestrator.go      # accept authoritative triggers; reconciliation stays as fallback
└── detector.go          # remains, but classification becomes a fallback path

internal/terminal/
├── session.go           # inject FORGE_SESSION_ID into env (Unix cmd.Env; thread id to Windows)
└── pty_windows.go       # write $env:FORGE_SESSION_ID per-ConPTY (alongside FORGE_INSTANCE_PID)

scripts/
├── sdd-gate-check.ps1   # read $env:FORGE_SESSION_ID; scoped gate-check; emit phase-event(started)
└── install-sdd-hook.ps1 # (unchanged install flow; ships the updated script)

frontend/src/
├── hooks/useSddGate.js              # already filters by sessionId — verify + harden
└── components/SddDashboard.jsx,     # render PhaseReportCard grouped bullets; "View full output";
    components/ActionPromptStrip.jsx #   "unbound — SDD inactive" indicator

speckit skills (global)              # add mandatory final step: emit phase-event(complete, decisions)
```

**Structure Decision**: Web/desktop split (Go backend + React frontend). All changes are retrofits into existing files; no new packages, consistent with the retrofit-in-place clarification.

## Implementation Sequencing (for /speckit-tasks)

Ordered by the spec's priorities and risk:

1. **Per-tab identity (highest risk first)** — inject `FORGE_SESSION_ID`; verify it equals `activeTabId`/bind key (R3). Gate everything else on this proving out.
2. **Scoped gate-check** — `sessionId` param + per-session lookup; update hook (US2/SC-003).
3. **Authoritative signals** — `phase-event` endpoint + orchestrator triggers; PreToolUse emits `started`; skills emit `complete`+decisions; demote watcher/quiet to fallback (US1/SC-001/SC-004).
4. **Report card** — git baseline + `--numstat`; `PhaseReportCard`; render grouped bullets + opt-in full output + unbound indicator (US3/SC-005/SC-006).
5. **Resilience** — restart restore per session; idempotent double-complete; fail-safe on unreachable channel (FR-012/SC-007).

## Complexity Tracking

No constitution violations — section intentionally empty.
