# Data Model: SDD Pipeline Dashboard (spec-006)

## Entities

### PhaseStatusEntry (unchanged — from spec-005 / `internal/sdd/types.go`)

Delivered by `SDD_PHASE_STATUS` WebSocket event inside `phases[]`.

| Field | Type | Description |
|---|---|---|
| `phase` | `PhaseName` string | Phase identifier: `"specify"` … `"implement"` |
| `order` | `int` | Pipeline order (1–6) |
| `displayStatus` | `PhaseDisplayStatus` string | One of six states below |
| `runCount` | `int` | Times `HandlePhaseComplete` fired for this phase |
| `artifactPath` | `string` | Relative path of expected artifact (empty for pty-quiet phases) |

**PhaseDisplayStatus enum** (six values):

| Value | Meaning |
|---|---|
| `pending` | Has not started |
| `active` | Phase command running (pty-quiet detection in progress) |
| `awaiting-decision` | Gate open, first run (`runCount == 1`) |
| `iterating` | Gate open, re-run (`runCount ≥ 2`) |
| `rejected` | Developer clicked Reject; waiting for re-run |
| `complete` | Approved or terminal phase completed |

---

### SddPhaseStatusEnvelope (existing — `cmd/forge/sdd_wiring.go`)

The WebSocket message that carries phase status. Already includes `feature`.

| Field | JSON key | Type | Description |
|---|---|---|---|
| Type | `type` | `string` | Always `"SDD_PHASE_STATUS"` |
| SessionID | `sessionId` | `string` | Terminal session this pipeline belongs to |
| Feature | `feature` | `string` | Base name of the feature directory (e.g. `"006-sdd-pipeline-dashboard"`) |
| Phases | `phases` | `PhaseStatusEntry[]` | Current status of all 6 phases |

**Change in spec-006**: `useSddGate` must extract `Feature` and expose it as `featureName`. No backend change needed.

---

### PhaseSummary (existing — `internal/sdd/types.go`)

Structured outcome of a completed phase. Travels inside `SDD_PHASE_GATE` events. In spec-006 `useSddGate` accumulates these in a `phaseSummaries` ref keyed by phase name.

| Field | Type | Description |
|---|---|---|
| `headline` | `string` | One-line outcome (e.g. "Plan ready · 3 contracts · 0 open clarifications") |
| `producedItems` | `string[]` | Artifact file names (e.g. `["plan.md", "research.md"]`) |
| `flags` | `SummaryFlag[]` | Issues found during phase analysis |

**SummaryFlag**:

| Field | Type | Values |
|---|---|---|
| `kind` | `string` | e.g. `"unchecked-checklist"`, `"open-clarification"` |
| `label` | `string` | Human-readable description |
| `severity` | `string` | `"info"` / `"warn"` / `"block"` |

---

### DecisionCard (existing — `internal/sdd/types.go`, surface via `SDD_PHASE_GATE` WS event)

Gate event received when `HandlePhaseComplete` fires. Carries the decision surface.

| Field | JSON key | Type | Description |
|---|---|---|---|
| CardID | `cardId` | `string` | Unique ID for this gate instance |
| Phase | `phase` | `PhaseName` | Which phase completed |
| Summary | `summary` | `PhaseSummary` | Structured outcome (stored in `phaseSummaries`) |
| Actions | `actions` | `string[]` | Allowed actions: `"approve"`, `"reject"`, `"clarify"` |
| ArtifactPreview | `artifactPreview` | `ArtifactPreview \| null` | First 200 lines of the phase artifact (null for pty-quiet phases) |

**No change** to this entity. The `artifactPreview` field is no longer rendered in the card body (Bug B fix in `fix/sdd-phase-ux-bugs`), but the field is still received and discarded — the detail strip uses the Monaco open-file call instead.

---

## State Additions to `useSddGate` (frontend-only)

These fields are new to the hook's return value in spec-006:

| Return field | Type | Source |
|---|---|---|
| `featureName` | `string` | Extracted from `SDD_PHASE_STATUS` event's `feature` field |
| `phaseSummaries` | `Record<string, PhaseSummary>` | Accumulated from each `SDD_PHASE_GATE` event; keyed by phase name |

Both are accumulated in refs / state inside the hook. `featureName` is a `useState` string (triggers re-render when name changes). `phaseSummaries` is a `useRef` object updated on each gate event — a ref avoids triggering re-renders on every gate arrival (summaries only display when the user clicks a phase cell).

---

## State Owned by `SddDashboard` (local React state)

| State var | Type | Meaning |
|---|---|---|
| `selectedPhase` | `string \| null` | Phase name whose detail strip is open; `null` if none |
| `isClarifyOpen` | `boolean` | Whether the Clarify native `<dialog>` is mounted and visible |

These are local to `SddDashboard`. Neither is persisted to `localStorage` (closing and reopening the app resets to no-selection state).

---

## Wire Protocol — No Changes

The `SDD_PHASE_STATUS` and `SDD_PHASE_GATE` events are unchanged. The `POST /api/sdd/decision` endpoint is unchanged. No new HTTP endpoints. No new WebSocket message types.
