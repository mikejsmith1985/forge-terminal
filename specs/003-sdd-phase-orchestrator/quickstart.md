# Quickstart & Validation Guide: SDD Phase Orchestrator

This guide proves the feature works end-to-end. It is a run/validation guide — implementation lives in `tasks.md` and the code. Contracts and entities are referenced, not duplicated (see `contracts/`, `data-model.md`).

## Prerequisites

- Forge Terminal dev build runnable via `run-dev-clean.ps1` (per Article V; never validate against a hand-built binary).
- A scratch feature directory under `specs/` to drive the pipeline against (a throwaway `specs/999-demo/`).
- Optional: a local AzureWorkflowPOC stub listening on `http://localhost:7000/sdd/phase` (any 2xx). For the down-service test, leave it stopped.

## Setup

```powershell
# Launch the dev app (frontend + backend) — do NOT build the binary
./run-dev-clean.ps1 -Port 9999

# (Optional) point the notifier at a stub; otherwise the default is used
$env:FORGE_SDD_NOTIFY_URL = "http://localhost:7000/sdd/phase"
```

**Binding**: the pipeline must be bound to a session before gates fire. The frontend does this
automatically — when the active terminal's working directory is known it `POST`s
`/api/sdd/bind { sessionId, repoRoot }` (see `contracts/sdd-bind-endpoint.md`). To bind manually
for a test, issue that POST with the active session id and the repo root; a repo without
`.specify/feature.json` returns `409` and no pipeline starts.

## Validation scenarios

Each scenario cites the spec acceptance criterion it proves. Verify terminal output via the xterm buffer model (`window.term.buffer.active`), never the DOM (Article X).

### V1 — Card appears on phase completion (US1 / FR-001, FR-004, FR-005)

1. In a Forge terminal, run a phase that writes an artifact into the active feature dir (e.g., let Specify produce `spec.md`).
2. **Expected**: within ~one debounce window, a `PhaseDecisionCard` appears beside the terminal showing the phase, a one-line headline summary, and any flags — **no browser/window opens**, and the card contains no raw phase log.

### V2 — Approve auto-advances (US1 / FR-007)

1. With a card showing, click **Approve**.
2. **Expected**: the orchestrator injects the next phase's slash command into the same session (visible in `window.term.buffer.active`); the card dismisses; `POST /api/sdd/decision` returned `{"status":"advancing"}`.

### V3 — Reject stops (US1 / FR-008, R10)

1. With a card showing, click **Reject**.
2. **Expected**: no command is injected; the pipeline status becomes `rejected`; re-triggering does not auto-advance past the rejected phase.

### V4 — Clarify steers the next phase (US2 / FR-009, FR-018)

1. With a card showing, click **Clarify**, enter a short steer, confirm.
2. **Expected**: the next phase command is injected with the steer appended on its own line; status `advancing`.
3. Repeat but **cancel** with empty text → the same card stays `pending`, nothing advances (FR-009 cancel path; endpoint returns 400).

### V5 — Best-effort notification, service down (US3 / FR-012, SC-004)

1. Stop the AzureWorkflowPOC stub. Complete a phase.
2. **Expected**: the decision card still appears with no perceptible delay; a failed-notification line is logged under `~/.forge/logs/`; the pipeline is unaffected.
3. Start the stub, complete another phase → the stub receives exactly one POST matching `contracts/azureworkflowpoc-notify.md`.

### V6 — Missing-artifact flag (Edge Case / FR-013)

1. Drive a phase that ends without producing its expected artifact (simulate by interrupting it).
2. **Expected**: the card shows a `block`-severity "missing artifact" flag rather than silently advancing.

### V7 — One card at a time (FR-014)

1. Cause two phases to complete in quick succession.
2. **Expected**: cards present in order; the second phase does not begin until the first card is resolved.

## Automated coverage (maps to these scenarios)

- **Unit (Go, `internal/sdd`, <10ms, mocked)**: state-machine transitions (V2/V3/V4/V7), summarizer golden artifacts (V1/V6), notifier non-blocking + payload (V5).
- **Unit (vitest)**: `PhaseDecisionCard` renders summary/flags and fires `onAction`; `useSddGate` dispatches the WS event and POSTs the decision.
- **UX (Cypress + cypress-real-events, via `run-dev-clean.ps1`)**: `sdd-phase-gate.cy.js` drives V1→V2 (real click) and asserts injection through the xterm buffer model.

## Done = all V1–V7 pass and the automated suites are green.
