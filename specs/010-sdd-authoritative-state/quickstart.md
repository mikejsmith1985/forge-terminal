# Quickstart / Validation Guide: SDD Authoritative State & Concise Phase Reports

**Feature**: 010-sdd-authoritative-state

This guide proves the feature end-to-end. UX scenarios use Playwright via `run-dev-clean.ps1` (Article V) and read the xterm.js buffer model, never the DOM (Article X).

## Prerequisites

- `run-dev-clean.ps1` running the dev build (never the production binary for UX tests).
- The SDD hook installed (`scripts/install-sdd-hook.ps1`) with the scoped gate-check + phase-event additions.
- Two repositories available for the concurrency scenario.

## Scenario 1 — Authoritative state, no inference (US1, SC-001, SC-004)

1. In a tab bound to repo A, run a phase command (e.g. specify).
2. **Expect**: the bar shows that phase as `running` the moment the PreToolUse hook fires, then `awaiting-decision` within 2 s of the skill's `complete` event — **without** waiting for the terminal to fall quiet.
3. Make the phase edit its artifact multiple times.
4. **Expect**: the bar does **not** flip phases on each edit (no inference). Phase changes only on an authoritative `phase-event`.

## Scenario 2 — Concurrent pipelines never conflate (US2, SC-002, SC-003)

1. Open tab A (repo A) and tab B (repo B).
2. Drive tab A to `awaiting-decision` on Plan. Drive tab B to `running` Tasks.
3. **Expect**: each bar shows only its own phase. No bleed-through.
4. With tab A's gate open, invoke a `speckit-*` skill in tab B.
5. **Expect**: tab B is **not** blocked (gate-check scoped by `sessionId`). Approving in tab A advances only tab A.
6. Verify each tab's `$env:FORGE_SESSION_ID` is distinct (read via the xterm.js buffer after `echo $env:FORGE_SESSION_ID`).

## Scenario 3 — Concise report card + opt-in full output (US3, SC-005, SC-006)

1. Complete any phase that touches files.
2. **Expect**: the gate card shows grouped bullets — files (with +/- counts), scope, decisions — and the essential content fits ≤100 words. No wall of Markdown.
3. Complete a no-op phase.
4. **Expect**: the card states "No files changed" rather than rendering empty/broken.
5. Click **View full output**.
6. **Expect**: the full verbose phase artifact opens on demand; it was never the default surface.

## Scenario 4 — Graceful degrade on unbound identity (FR-011a)

1. Simulate identity-injection failure (start a tab with `FORGE_SESSION_ID` unset).
2. **Expect**: the dashboard shows "unbound — SDD inactive"; normal terminal work continues; a `speckit-*` skill is **not** blocked; no other session's state is touched.

## Scenario 5 — Restart restores per-session gate (FR-012, SC-007)

1. With tab A's gate open and tab B running, restart the backend.
2. **Expect**: on reconnect, tab A's gate is restored for tab A only; tab B unaffected; zero cross-session leakage.

## Unit/integration coverage to assert (Article V)

- **Unit (mocked, <10 ms)**: gate-check returns only the requested session's state; report-card builder enforces ≤100-word essentials and the empty-files and magnitude-unavailable branches; orchestrator transitions driven by `PhaseEvent` not the watcher.
- **Integration (real)**: `POST /api/sdd/phase-event` started/complete drives the orchestrator and broadcasts; `git stash create` baseline + `--numstat` yields correct per-window file changes.
