# Research: SDD Pipeline Dashboard (spec-006)

## Decision 1 — Feature Name Source

**Decision**: Read the `feature` field already present in the `SDD_PHASE_STATUS` WebSocket payload.

**Rationale**: `cmd/forge/sdd_wiring.go` line 314 confirms `sddPhaseStatusEnvelope` already carries `Feature string json:"feature"` populated as `filepath.Base(state.FeatureDir)`. `useSddGate` receives every `SDD_PHASE_STATUS` event and only needs to extract and surface this value as `featureName`. No backend changes are required.

**Alternatives considered**:
- Add a new `SDD_FEATURE_BIND` WebSocket event — rejected: the data is already in every status broadcast; a separate event is redundant and adds a backend surface.
- Derive from the card's `sessionId` — rejected: the session ID is not the feature name.

---

## Decision 2 — Phase Summary Data for the Detail Strip

**Decision**: Accumulate gate-event summaries in `useSddGate` as a `phaseSummaries` map (keyed by phase name), populated whenever a `SDD_PHASE_GATE` event arrives.

**Rationale**: `PhaseSummary` (headline, producedItems, flags) already travels inside every `SDD_PHASE_GATE` event. Storing each received summary in a React ref (not state, to avoid re-renders on arrival) means the detail strip can display accurate data after the gate closes without any new backend endpoint or change to `SDD_PHASE_STATUS`. Summaries persist until the session resets (matching the pipeline lifecycle).

**Alternatives considered**:
- Add summaries to `SDD_PHASE_STATUS` broadcast — rejected: increases payload size for every status update; summaries only change at gate time, so broadcasting them every time is wasteful.
- New `/api/sdd/phase-summary` endpoint — rejected: spec FR-013 and the constitution explicitly prohibit new HTTP endpoints for this feature.
- Fetch from history on demand — rejected: couples the display layer to the on-disk persistence format; fragile and adds I/O latency on click.

---

## Decision 3 — Sub-Component Locality

**Decision**: All `SddDashboard` sub-components (`DashboardHeader`, `PhaseRail`, `PhaseCell`, `PhaseDetailStrip`, `DecisionBar`) are defined as local functions inside `SddDashboard.jsx`. Only `ClarifyModal` is a named export (to facilitate isolated testing).

**Rationale**: Each sub-component is under 40 lines, has no independent test surface beyond its parent, and shares the same CSS namespace. Splitting them into separate files would add 5+ import declarations with no architectural gain. The constitution Article IV "functions stay under 40 lines" is satisfied at the sub-component level.

**Alternatives considered**:
- One file per sub-component — rejected: increases module count without increasing clarity; these are presentation-layer children of a single parent surface.
- Keep `ActionPromptStrip` in the new file — rejected: it's already a separately-tested component with its own CSS; moving it would break the test isolation.

---

## Decision 4 — Clarify Modal Implementation

**Decision**: Use the native HTML `<dialog>` element (`.showModal()` / `.close()`) rendered conditionally inside `SddDashboard`.

**Rationale**: Electron's Chromium renderer supports the `<dialog>` element fully. It provides a free focus trap, `Escape` closes it by default, and it renders above all other content via the top-layer — no JavaScript focus management or z-index stacking required. The constitution Article VII (framework-first) confirms: no external modal library is needed when the platform already ships the capability.

**Alternatives considered**:
- Inline textarea inside the dashboard — rejected by the user (answers: Q3 = modal). Layout shifts when the steer input appears inside the fixed rail area.
- Custom modal via `position: fixed` + backdrop — rejected: rebuilds what `<dialog>` provides natively; drift justification would be required but cannot be written.

---

## Decision 5 — Layout Stability Strategy (SC-004)

**Decision**: The dashboard has a fixed outer container that grows from ~80px (no gate) to ~124px (gate open). The `PhaseDetailStrip` is absolutely positioned, floating upward above the rail without affecting layout flow.

**Rationale**: SC-004 requires the dashboard not to scroll or cause terminal reflow. Two concerns are separate: (a) the decision bar appearing when a gate opens adds ~44px to the fixed container (acceptable, small, user-triggered); (b) the detail strip for completed phase inspection must not push the terminal. Positioning the detail strip as `position: absolute; bottom: 100%` on the rail means it overlays terminal content above rather than reflowing it. Users who opened the strip expect it to cover some terminal output temporarily.

**Alternatives considered**:
- Dashboard fixed at 124px always, decision bar always reserved — rejected: 44px of blank space when no gate is open wastes screen real estate and looks broken.
- Detail strip inside the rail as a collapsing row — rejected: causes reflow inside the dashboard, shifts other phase cells, and requires complex layout math.

---

## Decision 6 — Deleted Components (no backward compatibility)

**Decision**: `SddPipelinePanel`, `PhaseDecisionCard`, and their CSS and test files are deleted outright. No feature flags, no re-exports.

**Rationale**: The spec assumption explicitly states "no backward-compatibility or feature-flag toggle is required." Both components are internal to the React app with no external consumers. Deleting them removes dead code from the test suite (6 fewer test files covering a replaced surface), reducing maintenance burden immediately.

**Alternatives considered**:
- Keep as deprecated re-exports — rejected: the spec forbids backward-compatibility shims; the constitution Article IV prohibits dead code.

---

## No Open Unknowns

All `NEEDS CLARIFICATION` items from the spec were resolved by prior user decisions:
- Dashboard height: always visible, ~100px baseline (Q1 → yes)
- Artifact link target: Monaco editor via `handleFileOpen` (Q2 → monaco)
- Clarify flow: native modal (Q3 → modal)
