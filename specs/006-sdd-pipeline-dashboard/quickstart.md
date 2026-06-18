# Quickstart Validation Guide: SDD Pipeline Dashboard (spec-006)

**Purpose**: Run these scenarios against a live `run-dev-clean.ps1` instance to prove the
dashboard works end-to-end. These are UX (Playwright) test targets — they do not require
building `fterm.exe`.

## Prerequisites

- Forge Terminal dev server running via `.\scripts\run-dev-clean.ps1`
- Playwright configured and `@playwright/test` installed (`npm ci` in `/frontend`)
- A speckit feature has been specified in the active session (so the pipeline can be triggered)

---

## Scenario 1 — Idle Dashboard (US1 / FR-012)

**What to verify**: Dashboard is always visible; idle state shows when no pipeline is bound.

```
1. Open Forge Terminal
2. Navigate to a tab with no active pipeline
3. Observe the bottom of the window
```

**Expected**: A fixed dashboard strip is visible at the bottom. It shows "No active feature — run /speckit-specify to start". No collapse button exists.

**Playwright locator**: `[data-testid="sdd-dashboard"]` is in the DOM and visible.

---

## Scenario 2 — Glanceable Phase Rail (US1 / FR-001, FR-002, FR-003)

**What to verify**: All 6 phase cells appear in a horizontal row with correct status icons.

```
1. Trigger a plan phase completion in the backend (or mock SDD_PHASE_STATUS via WS)
2. Send: { type: "SDD_PHASE_STATUS", sessionId, feature: "demo-feature", phases: [
     { phase: "specify", order: 1, displayStatus: "complete", runCount: 1 },
     { phase: "clarify", order: 2, displayStatus: "complete", runCount: 1 },
     { phase: "plan",    order: 3, displayStatus: "awaiting-decision", runCount: 1 },
     { phase: "tasks",   order: 4, displayStatus: "pending", runCount: 0 },
     { phase: "validate",order: 5, displayStatus: "pending", runCount: 0 },
     { phase: "implement",order:6, displayStatus: "pending", runCount: 0 }
   ]}
3. Observe the dashboard
```

**Expected**:
- Dashboard header shows "demo-feature" and a status badge
- 6 cells visible left-to-right: specify, clarify, plan, tasks, validate, implement
- Specify and Clarify show "✓" icon and "Done" status text
- Plan shows "⏳" icon and "Awaiting" status text
- Tasks, Validate, Implement show "◌" and "Pending"

---

## Scenario 3 — Inline Decision Bar (US2 / FR-005)

**What to verify**: Approve/Reject/Clarify buttons appear in the dashboard when a gate is open.

```
1. Send SDD_PHASE_GATE WS event for "plan" phase (see data-model.md for shape)
2. Observe the dashboard
```

**Expected**:
- Decision buttons (Approve, Reject, Clarify) appear below the phase rail inside the dashboard
- No separate overlay or floating card appears over the terminal
- Action prompt reads "Review the artifact above, then Approve, Reject, or Clarify."

---

## Scenario 4 — Approve Advances Pipeline (US2 acceptance scenario 1)

```
1. Send SDD_PHASE_GATE for "plan"
2. Click Approve button in the dashboard
```

**Expected**:
- Decision buttons disappear
- Plan phase cell updates to "complete" (✓)
- Tasks phase cell updates to "active" (⟳)
- Action prompt updates to "Tasks is running…"
- No overlay opened or closed; terminal visible throughout

---

## Scenario 5 — Clarify Opens Native Dialog (US2 acceptance scenario 3 / FR-006)

```
1. Send SDD_PHASE_GATE for "plan"
2. Click Clarify
```

**Expected**:
- A native `<dialog>` modal appears with a textarea
- Confirm button is disabled (empty steer)
- Typing text enables Confirm
- Submitting closes the dialog, decision controls disappear, pipeline advances

---

## Scenario 6 — Phase Detail Strip (US3 / FR-007, FR-008, FR-009)

```
1. Send SDD_PHASE_STATUS with specify and clarify complete, plan awaiting
2. Send SDD_PHASE_GATE for specify (so phaseSummaries is populated for specify)
3. Then send SDD_PHASE_STATUS again with specify complete (gate closed)
4. Click the Specify phase cell
```

**Expected**:
- A detail strip expands — headline text, file chips (spec.md), no flags (or flag chips if present)
- "View artifact →" link is present
- The detail strip floats above the terminal content without reflowing the dashboard rail

```
5. Click "View artifact →"
```

**Expected**:
- Monaco editor opens `spec.md` in the current tab's editor panel
- The dashboard remains visible; no navigation occurs

```
6. Click the Specify cell again
```

**Expected**: detail strip collapses

```
7. Click the Clarify cell
```

**Expected**: detail strip switches to show Clarify's summary (not Specify's — only one open at a time)

---

## Scenario 7 — Run-Count Badge (US1 acceptance scenario 2)

```
1. Send SDD_PHASE_STATUS with plan phase: { displayStatus: "iterating", runCount: 3 }
```

**Expected**:
- Plan cell shows "↻" icon (amber) and "×3" badge
- Action prompt reads "Approve this iteration, or Reject to try again."

---

## Scenario 8 — Backend Decision Error (US2 acceptance scenario 5 / FR-013)

```
1. Open gate for "plan"
2. Intercept POST /api/sdd/decision with a mock 500 response
3. Click Approve
```

**Expected**:
- Error message appears inline below the decision buttons (e.g. "Decision request failed: 500")
- Gate remains open; buttons remain active for retry
- Developer can click Dismiss (or use useSddGate.dismiss) to escape

---

## Scenario 9 — All Phases Complete (US4 acceptance scenario 4)

```
1. Send SDD_PHASE_STATUS with all 6 phases: displayStatus = "complete"
```

**Expected**:
- All 6 cells show ✓ icon and "Done"
- Decision controls are absent
- Action prompt reads "Pipeline complete."
- Feature name and badge in header show the completed feature

---

## Layout Stability Check (SC-004)

After Scenario 3 (gate opens and decision bar appears), measure:
- Dashboard container height change: must be ≤ ~44px (one button row)
- No terminal content above the dashboard should reflow or shift
- Phase rail icons must not move horizontally or vertically

After Scenario 6 (detail strip appears), measure:
- Dashboard container height: unchanged from Scenario 3
- Detail strip visually overlaps terminal content above (not below the dashboard)
