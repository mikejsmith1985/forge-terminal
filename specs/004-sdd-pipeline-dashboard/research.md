# Research: SDD Pipeline Dashboard

**Feature**: specs/004-sdd-pipeline-dashboard  
**Phase**: Plan research  
**Date**: 2026-06-15

---

## R1 — Layout: non-blocking decision card

**Decision**: Move `PhaseDecisionCard` from a fixed full-screen overlay to a side-drawer anchored inside `terminal-pane`, rendered as a right-side flex sibling to the terminal content area.

**Rationale**: The current CSS (`.phase-decision-card-overlay { position: fixed; inset: 0 }`) covers the entire viewport including the terminal. In App.jsx the card is mounted outside `terminal-pane`, so it is structurally divorced from the layout it needs to coexist with. Moving it to be a flex child of `terminal-pane` and replacing the overlay CSS with a fixed-width side-drawer (right-aligned, no backdrop) means the terminal pane compresses rather than disappearing. The sidebar (left or right, user-settable) is on the outer `app` flex container and is not affected.

**How**: Change `terminal-pane-content` to a row flex container. The terminal container takes `flex: 1`, the decision card drawer takes a fixed width (380px) and appears via `transform: translateX(100%)` → `translateX(0)` transition. Remove the overlay backdrop (`background: rgba(0,0,0,0.6)`) entirely. The Escape/✕ failsafe already exists and works in any layout.

**Alternatives considered**:  
- Keep it as an overlay but make it draggable: rejected — draggable overlays still block the region they cover, and add drag state complexity.  
- Position it as a bottom drawer: the status panel (US1) already occupies the bottom, and two bottom panels stack awkwardly.

---

## R2 — Pipeline status panel position

**Decision**: Collapsible bottom panel below `terminal-pane-content` (inside `terminal-pane`), above the App-level footer (none exists — this adds one).

**Rationale**: Q2 was unanswered at plan time; the recommended option A (bottom panel) is adopted. The terminal is read horizontally (commands and output are long lines); a bottom panel compresses it vertically without affecting line-width. The right-side is already occupied by the decision card drawer (US2). A bottom panel follows the VS Code "Problems"/"Output"/"Terminal" panel pattern that developers already use daily.

**How**: Add a `SddPipelinePanel` component rendered as a flex child of `terminal-pane` below `terminal-pane-content`. Default height: 120px, collapsible to a single 32px header bar. Persist collapsed state in `localStorage`.

**Alternatives considered**:  
- Right sidebar panel: conflicts with decision card drawer, and the sidebar position already toggles left/right.  
- Top strip with phase dots: insufficient information density for the headline + artifact link.

---

## R3 — Artifact content delivery transport

**Decision**: Backend reads the artifact file and embeds truncated content in the `SDD_PHASE_GATE` WebSocket envelope as `artifactPreview`. No new HTTP endpoint required. (Locked in Q1, clarify session 2026-06-15.)

**Rationale**: Content arrives atomically with the gate event, satisfying FR-012 (no additional polling). The file is already read in `gateSddArtifact` (`os.ReadFile`); the broadcaster closure in `sdd_wiring.go` can re-read it using the pipeline's `featureDir` and the phase's `ExpectedArtifact` field from `phaseTable`. The `sddGateEnvelope` is extended with an `ArtifactPreview *sddArtifactPreview` field (omitempty — absent for pty-quiet phases).

**Truncation**: Default 200 lines. Configurable via `sddArtifactMaxLines` constant in `sdd_wiring.go`. Backend counts total lines, sends first N, includes `isTruncated`, `totalLines`, `filePath`.

**Alternatives considered**:  
- Frontend fetches `GET /api/sdd/artifact` on card open: rejected (extra round-trip, violates FR-012, requires new auth surface).  
- Full file content in envelope: rejected (plan.md can be thousands of lines, bloating every gate message; truncation is required by FR-009).

---

## R4 — Pipeline status event transport

**Decision**: Add a second WebSocket event type `SDD_PHASE_STATUS` carrying the full array of all five phases with their current status. Broadcast on every phase completion (same seam as the gate) and after every decision. Add `GET /api/sdd/status` for panel recovery on page reload.

**Rationale**: The gate event only covers the phase that just completed. The status panel needs all five phases' statuses at once. Deriving status from gate-event history in the frontend is unreliable across page reloads. A dedicated `SDD_PHASE_STATUS` event with the full state keeps the panel always-current with zero client-side reconstruction logic.

**GET /api/sdd/status**: Returns the current `PipelineState` + phase status array for the session. Called once on panel mount (cold start / page reload). After that, WebSocket events keep it live.

**Phase status enum**: `idle | active | awaiting-decision | complete | rejected`. The "active" status fires when a gate decision approves and the injector has been called (the next phase's command was sent to the terminal).

**Alternatives considered**:  
- Frontend reconstructs status purely from received gate events: fails on page reload (history lost).  
- Poll `GET /api/sdd/status` every N seconds: rejected (violates FR-012, adds latency).

---

## R5 — Framework-First Gate (Article VII)

| Capability | Framework provided? | Verdict |
|---|---|---|
| WebSocket hub broadcast | `termHandler.BroadcastJSONToSession` | ✓ Reuse |
| Phase artifact detection | `internal/sdd/detector.go` + `tutor.Watcher` | ✓ Reuse |
| Phase state machine | `internal/sdd/orchestrator.go` | ✓ Reuse |
| Decision card component | `PhaseDecisionCard.jsx` | ✓ Modify |
| Gate hook | `useSddGate.js` | ✓ Extend |
| Pipeline status panel | — | ✗ NET-NEW (no existing persistent-status UI in Forge Terminal) |
| Artifact content in envelope | — | ✗ NET-NEW transport addition (broadcaster only sends card metadata) |
| Phase status event | — | ✗ NET-NEW event type (only gate events exist) |

All net-new components have a documented gap above. Justification recorded.
