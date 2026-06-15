# Quickstart: SDD Pipeline Dashboard Validation

**Feature**: specs/004-sdd-pipeline-dashboard  
**Purpose**: End-to-end validation scenarios that prove each user story works

---

## Prerequisites

- `scripts/local-release.ps1` NOT needed; use the dev server.
- Start the dev server (no binary build): `./run-dev-clean.ps1` (port 9999 by default)
- Open Forge Terminal in a browser tab at `http://localhost:9999`
- A test repo with `.specify/` set up (forge-terminal itself works)

---

## Scenario 1 — US2: Non-blocking decision card

**Validates**: FR-005, FR-006, FR-007, SC-002, SC-005

1. Open a new terminal tab in a repo with an active speckit pipeline.
2. Run `/speckit-specify` and wait for it to complete (the watcher will detect `spec.md`).
3. **Observe**: A side drawer appears on the right of the terminal. The terminal scrollback is still visible and scrollable alongside the drawer.
4. Scroll up and down in the terminal — confirm the drawer does not follow (no overlay z-index issue).
5. Click inside the terminal — confirm keystrokes route to the PTY, not the drawer.
6. Press `Escape` — confirm the drawer closes (failsafe exit; existing SC-005 requirement).
7. The card should re-appear on the next WebSocket `SDD_PHASE_GATE` event; trigger it by running `/speckit-specify` again.
8. Click `Approve` — confirm the drawer closes and `/speckit-clarify` is injected into the terminal.

**Expected terminal buffer** (check via `window.term.buffer.active.getLine(n).translateToString(true)`):  
Contains `/speckit-clarify` on a line written after Approve is clicked.

---

## Scenario 2 — US1: Pipeline status panel

**Validates**: FR-001, FR-002, FR-003, FR-004, SC-001

1. Open a fresh Forge Terminal tab with no pipeline bound.
2. **Observe**: The pipeline status panel is hidden or shows an "idle" row (no phases listed).
3. Run `/speckit-specify` in a repo with a speckit pipeline bound.
4. When the phase completes, **observe** the bottom panel updates within 2 seconds:
   - Specify: `✓ complete`
   - Clarify, Plan, Validate, Implement: `· pending`
5. Click the panel's collapse toggle — confirm it collapses to a header bar.
6. While collapsed: a visual indicator (badge / highlight on the toggle) appears when the next phase completes.
7. Expand the panel — confirm all rows show current status.
8. Interact with the terminal — confirm the panel does not overlay or obstruct it.

**Recovery check**: Reload the page mid-pipeline. Confirm the panel re-fetches phase status from `GET /api/sdd/status` and shows the correct state (not all-pending).

---

## Scenario 3 — US3: Artifact preview in decision card

**Validates**: FR-008, FR-009, FR-010, FR-011, SC-003

1. Complete the Specify phase to produce `spec.md`.
2. When the gate card appears, **observe** an artifact preview section inside the card showing the first 200 lines of `spec.md`.
3. If the spec is longer than 200 lines, **observe** a truncation notice: "Showing 200 of N lines — full file at spec.md".
4. Collapse the preview section (toggle) — confirm it hides. Re-open the card on next gate: preview should default collapsed.
5. Run `/speckit-plan` to completion (produces `plan.md`).
6. When the Plan gate card appears, **observe** the plan.md content in the preview section.
7. Trigger a Validate gate (pty-quiet phase, no artifact) — **observe** NO preview section is shown in the card.
8. Simulate a missing artifact: rename `spec.md` temporarily, then trigger the Specify gate via a forced decision endpoint call. **Observe** the card shows a fallback message ("Artifact not yet available") instead of an error or blank block.

---

## Scenario 4 — Regression: existing gate card behaviour

**Validates**: SC-004, SC-005 (failsafe regression check)

1. Verify SC-004: Gate card appears within 3 seconds of a phase completing (time from `spec.md` settle to card render).
2. Verify that ✕ dismiss still works with no backend call (check Network tab: no POST to `/api/sdd/decision` on ✕ click).
3. Verify that Cypress test suite `sdd-phase-gate.cy.js` (existing 3 tests) still passes.

---

## Scenario 5 — Multi-tab independence (US1 / US2)

1. Open two terminal tabs, each bound to a different repo (or same repo, different sessions).
2. Advance pipeline in tab A to the Plan gate.
3. Switch to tab B — confirm tab B's status panel shows its own state, not tab A's.
4. The gate card in tab A is NOT visible in tab B.
