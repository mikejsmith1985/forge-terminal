# Implementation Plan: SDD Gate Reconciliation

**Branch**: `feature/007-sdd-gate-reconciliation` | **Date**: 2026-06-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-sdd-gate-reconciliation/spec.md`

## Summary

Add three targeted fixes to the SDD pipeline HITL gate system: (1) `Orchestrator.ReconcileFromDisk` — a new method that auto-advances gate state to match artifact reality, called on every status broadcast cycle and after every Approve decision; (2) an auto-approve veto window for the Clarify phase — when the agent outputs `<!-- clarify:skip -->`, the frontend shows a 20-second client-side countdown with a single veto button instead of the standard gate card; (3) bulk Approve semantics — a single Approve click resolves all intermediate completed phases in one operation by calling `ReconcileFromDisk` synchronously inside `SubmitDecision`. No new WebSocket message types. No new HTTP endpoints. Changes touch three Go files and four frontend files.

## Technical Context

**Language/Version**: Go 1.22 (backend); React 18 / Vite (frontend)

**Primary Dependencies**: `internal/sdd/Orchestrator` (existing); `useSddGate` hook (existing); `SddDashboard.jsx` (existing); Vitest + Playwright (`@playwright/test`)

**Storage**: No persistence changes. Reconciliation reads on-disk artifacts but writes only to in-memory orchestrator state. The `countdownSecondsRemaining` and `isVetoed` fields live in `useSddGate` React state (session-only, no persistence).

**Testing**: Vitest (unit, mocked) for orchestrator, hook, and component changes; Playwright against `run-dev-clean.ps1` for the 9 quickstart UX scenarios; Go unit tests for `ReconcileFromDisk` and modified `SubmitDecision`.

**Target Platform**: Desktop Forge Terminal (Electron + Chromium renderer). No mobile scope.

**Project Type**: Fullstack desktop app (Go binary + embedded React frontend) — both backend and frontend changes.

**Performance Goals**: `ReconcileFromDisk` completes in < 1ms for 6 phases (6 sequential `os.Stat` calls, no I/O beyond existence checks). Countdown tick fires every 1 second via `setInterval` — negligible CPU.

**Constraints**: No new HTTP endpoints. No new WebSocket message types. `DecisionCard` gains two new optional fields (`shouldAutoApprove`, `autoApproveAfterSeconds`) — additive, backwards-compatible with any client that ignores unknown fields.

**Scale/Scope**: One reconciliation pass per broadcast cycle (≤ 6 `os.Stat` calls). One countdown per session. Six phases.

## Constitution Check

| Article | Gate | Status |
|---------|------|--------|
| I — Prime Directive | Best route, not fastest | ✓ Single shared `ReconcileFromDisk` method; no duplication across call sites |
| II — Process Protection | No wildcard kills | ✓ No process management in this feature |
| III — Branching | Feature branch required | ✓ `feature/007-sdd-gate-reconciliation` |
| IV — Code Quality | Self-documenting names, verb-first, no magic numbers | ✓ `ReconcileFromDisk`, `clarifySkipMarker`, `countdownSecondsRemaining`, `AutoApproveAfterSeconds` — all self-documenting; no magic numbers |
| V — Testing | Red → Green → Refactor; 3-layer separation | ✓ Go unit tests for orchestrator; Vitest for hook/component; Playwright for UX scenarios |
| VI — Docs | CHANGELOG updated in PR | ✓ |
| VII — Framework-First | Confirm no framework already provides it | ✓ See Framework-First verdict below |
| X — Verification | Evidence required; xterm.js buffer for terminal assertions | ✓ Playwright reads buffer model; UX scenarios in quickstart.md |

**Framework-First verdict**: Go's standard library provides `os.Stat` for artifact existence checks — no custom filesystem abstraction needed. React's `useState` and `useEffect` with `setInterval` are the correct native primitives for a client-side countdown — no third-party countdown library is needed or justified. The `signalContentMarker` extension point already exists in `phases.go`; extending it with a new constant is idiomatic. *Custom because*: no existing Forge or React primitive provides "orchestrator state reconciliation from disk" or "HITL gate auto-approve countdown with veto" as a ready-made capability.

## Project Structure

### Documentation (this feature)

```text
specs/007-sdd-gate-reconciliation/
├── plan.md                         ← this file
├── spec.md                         ← feature specification
├── research.md                     ← Phase 0 output (all 5 decisions resolved)
├── data-model.md                   ← Phase 1 output
├── quickstart.md                   ← Phase 1 output (9 validation scenarios)
├── contracts/
│   └── auto-approve-signal-v1.md  ← Phase 1 output (skip marker protocol)
├── checklists/
│   └── requirements.md            ← spec quality checklist (all items passing)
└── tasks.md                        ← Phase 2 output (/speckit-tasks — not created here)
```

### Source Code

```text
internal/sdd/
├── orchestrator.go         ← MODIFIED: add ReconcileFromDisk(); modify SubmitDecision() for bulk Approve
├── orchestrator_test.go    ← MODIFIED: tests for ReconcileFromDisk and bulk Approve SubmitDecision
├── phases.go               ← MODIFIED: add clarifySkipMarker constant; add AutoApproveAfterSeconds to Phase
└── types.go                ← MODIFIED: add ShouldAutoApprove bool + AutoApproveAfterSeconds int to DecisionCard

cmd/forge/
├── sdd_wiring.go           ← MODIFIED: call ReconcileFromDisk before broadcast; set ShouldAutoApprove in gate card
└── sdd_wiring_test.go      ← MODIFIED: reconciliation broadcast tests

frontend/src/
├── hooks/
│   ├── useSddGate.js       ← MODIFIED: countdownSecondsRemaining, isVetoed state; veto handler; auto-approve retry
│   └── useSddGate.test.js  ← MODIFIED: countdown, veto, retry-on-failure unit tests
└── components/
    ├── SddDashboard.jsx    ← MODIFIED: DecisionBar renders countdown + veto button when countdownSecondsRemaining > 0
    ├── SddDashboard.css    ← MODIFIED: countdown indicator and veto button styles
    └── SddDashboard.test.jsx ← MODIFIED: countdown rendering, veto button visibility tests
```

**Structure Decision**: All three changes are backend-first: orchestrator → wiring → frontend. Each change is independently testable. `ReconcileFromDisk` is a method on the existing `Orchestrator` struct — no new types or packages. Frontend changes are confined to the existing `useSddGate` hook and `SddDashboard` component — no new files.

## Technical Decisions (from research)

### Decision 1 — Reconciliation Trigger Point

**Chosen**: `ReconcileFromDisk(featureDir string)` added to `Orchestrator`. Called (a) in `broadcastSddPhaseStatus` before `buildPhaseStatuses`, and (b) inside `SubmitDecision(ActionApprove)` after advancing `CurrentPhase`.

**Rationale**: Single method, two call sites — avoids duplication. Idempotent, so safe to call on every broadcast cycle. `SubmitDecision` is the natural owner of state transitions. See `research.md` Decision 1.

### Decision 2 — Skip Signal Marker

**Chosen**: Constant `clarifySkipMarker = "<!-- clarify:skip -->"` in `phases.go`. Detected by `signalContentMarker` monitor. On detection, `DecisionCard.ShouldAutoApprove = true`.

**Rationale**: Zero new machinery — reuses existing PTY monitor. HTML comment is invisible in rendered Markdown and unambiguous in terminal output. See `research.md` Decision 2.

### Decision 3 — Auto-Approve Timeout Storage

**Chosen**: `AutoApproveAfterSeconds int` on `Phase` struct. Clarify: `20`. All others: `0`. Value transmitted in `DecisionCard`.

**Rationale**: Per-phase config lives with the phase definition. Value `0` means disabled. See `research.md` Decision 3.

### Decision 4 — Frontend Countdown State

**Chosen**: `countdownSecondsRemaining` (number|null) and `isVetoed` (bool) added to `useSddGate`. `useEffect` + `setInterval` for 1-second ticks. Retry wrapper (3 attempts, 1s backoff) for the Approve call. On all-retries-fail: revert to standard gate card.

**Rationale**: Logic in hook, rendering in component. Independently testable. See `research.md` Decision 4 and `contracts/auto-approve-signal-v1.md`.

### Decision 5 — Bulk Approve Semantics

**Chosen**: `ReconcileFromDisk` called synchronously inside `SubmitDecision(ActionApprove)` after state advance. Wiring broadcasts once after return.

**Rationale**: Advances through all completed phases in one operation. Single broadcast. No intermediate gate cards. See `research.md` Decision 5.

## Complexity Tracking

No constitution violations.
