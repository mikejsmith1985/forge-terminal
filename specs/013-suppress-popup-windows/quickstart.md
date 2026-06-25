# Quickstart: Validate Suppressed Pop-up Windows

This guide proves the feature end-to-end: that approving an agent action (and other command paths)
runs in-app with **zero** new desktop windows. It references [contracts/window-suppression.md](./contracts/window-suppression.md)
and [research.md](./research.md) rather than restating implementation details.

## Prerequisites

- Windows 11 desktop (primary target — this is where console windows are allocated).
- Forge Terminal dev environment launched via `run-dev-clean.ps1` (Article V — never the built binary for UX tests).
- The visible-window probe `scripts/count-visible-windows.ps1` present (Contract B).
- Go toolchain for unit/integration tests; the Playwright harness (`playwright.config.js`, `tests/e2e/`).

## Scenario 1 — Approving an agent action pops no window (US1 / P1)

**Setup**: Start a session with an AI agent active (the path that previously popped a window — the
Chat-view / auto-tool path per research R3).

**Steps**:
1. Sample baseline: `pwsh scripts/count-visible-windows.ps1` → record `before`.
2. In the real UI, click the **Approve** control that triggers the agent to run a command
   (`locator.click()`, real event).
3. Sample again: `pwsh scripts/count-visible-windows.ps1` → record `after`.

**Expected**:
- `after == before` (SC-001) — no console/terminal window appeared, not even a flash (FR-004).
- The command's output is visible in the in-app terminal — confirm by reading
  `window.term.buffer.active` (Article X), not the DOM (FR-002).
- Forge Terminal still holds keyboard focus (SC-003 / FR-006).

## Scenario 2 — Other command surfaces pop no window (US2 / P2)

Repeat the before/after probe protocol while exercising each surface:
- Run a **command card** (e.g. a macro that runs a shell command).
- Open an **external link** (default browser may open; **no** extra console window may flash — FR-003).
- Trigger a path that touches the file handler (browse/preview) so the previously-unguarded
  `wsl … echo $HOME` / `ffmpeg` calls fire (research R4).

**Expected**: `after == before` in every case (SC-002); each underlying command still completes and its
result is observable (FR-005).

## Scenario 3 — Rapid repeated approvals (edge case)

Click **Approve** several times in quick succession; sample `before` once at the start and `after`
once after all actions settle.

**Expected**: `after == before` — concurrent approvals do not each leak a window.

## Automated checks (Red → Green, Article V)

- **Unit** (`go test ./internal/spawnguard/...`, <10 ms): classifier returns the right strategy; leaf
  strategy sets BOTH `CREATE_NO_WINDOW` and `HideWindow`; the static-guard scan finds **zero**
  unguarded `exec.Command` sites (FR-007).
- **Integration** (Windows-gated `go test`): launch a `ConsoleParent` that spawns a console child via
  the corrected path and assert the visible-window count is unchanged (Contract B); assert a
  `LeafProcess` produces no flash.
- **UX** (`npx playwright test tests/e2e/suppress-popup-windows.spec.js` via `run-dev-clean.ps1`):
  Scenario 1 automated — real Approve click, window-count delta `== 0`, output asserted from
  `window.term.buffer.active`.

**Definition of done for this quickstart**: all three automated layers pass, and a manual pass of
Scenarios 1–3 shows the desktop window count never increases due to Forge Terminal.
