# Quickstart: SDD Phase UX — Validation Guide

**Date**: 2026-06-16

## Prerequisites

- `run-dev-clean.ps1` starts successfully (Forge Terminal dev server, port 9999)
- Playwright installed and configured (see `playwright.config.js`)
- A test repository with `.specify/` scaffolded

## Scenario A — Six distinct state icons (US1, SC-001)

**Goal**: Confirm each of the six display states produces a visually distinct icon.

1. Start the dev server: `.\scripts\run-dev-clean.ps1`
2. Open Forge Terminal in a browser at `http://localhost:9999`
3. Open a terminal tab pointing at a speckit-scaffolded repo
4. Run `/speckit-specify` in the terminal
5. **Expected (while running)**: Specify row changes from `◌` to `⟳` (active, blue spinning icon)
6. **Expected (when artifact written)**: Specify row changes from `⟳` to `⏳` (awaiting-decision, gate card opens)
7. In the gate card, click **Reject**
8. **Expected**: Specify row shows `⚠` (rejected), action prompt reads "Run /speckit-specify to retry this phase."
9. Run `/speckit-specify` again
10. **Expected** (when artifact is written a 2nd time): Specify row shows `↻` (iterating, amber spinning icon), gate card shows `↻ Iterating` header
11. Click **Approve**
12. **Expected**: Specify row shows `✓ ×2` (complete, second run), action prompt reads "Run /speckit-clarify to continue."

**Pass criteria**: At no step do two different states share the same icon.

---

## Scenario B — Single action sentence (US2, SC-003)

**Goal**: Confirm the action prompt area never shows more than one sentence.

1. With no pipeline bound: prompt reads "Run /speckit-specify to start a new feature."
2. After `/speckit-specify` completes (gate open): prompt in card footer reads "Review the artifact above, then Approve, Reject, or Clarify."
3. After rejection: prompt reads "Run /speckit-specify to retry this phase."
4. When all phases complete: prompt reads "Pipeline complete."

**Pass criteria**: At every transition, the designated prompt area shows exactly one sentence — no paragraph, no list.

---

## Scenario C — Iteration counter (US3, SC-004)

**Goal**: Confirm the `×N` counter appears only when N ≥ 2.

1. Approve Specify on first attempt → row shows `✓` (no counter)
2. Reject Clarify, re-run, approve on 2nd attempt → row shows `✓ ×2`
3. Reject Plan twice, approve on 3rd attempt → row shows `✓ ×3`

**Pass criteria**: Counter is absent for N = 1; correct for N = 2 and N = 3.

---

## Scenario D — State transition animation (US1, FR-002)

**Goal**: Confirm state changes produce a visible CSS transition.

1. Open DevTools → Performance tab → record
2. Trigger a phase rejection (icon changes from `⏳` to `⚠`)
3. In the recording, confirm the `color` property animates over ~200 ms

**Pass criteria**: No instant snap to the new colour; animated transition is visible.

---

## Running Playwright tests

```powershell
# Start the dev server first
.\scripts\run-dev-clean.ps1

# In a second terminal:
npx playwright test e2e/sdd-phase-ux.spec.js --headed
```

Expected output: all test cases in the spec pass.

## Contract reference

See [contracts/sdd-phase-status-v2.md](contracts/sdd-phase-status-v2.md) for the exact WebSocket payload shape used to drive all scenarios above.
