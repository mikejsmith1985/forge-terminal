# Implementation Plan: SDD Pipeline Dashboard

**Branch**: `feature/004-sdd-pipeline-dashboard` | **Date**: 2026-06-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-sdd-pipeline-dashboard/spec.md`

## Summary

Replace the blocking SDD gate modal with a side-drawer that leaves the terminal interactive, add a collapsible bottom panel showing all five pipeline phases with live status, and embed phase artifact content in the gate event so the developer can read the output before deciding. Backend changes extend `sdd_wiring.go` and add one new endpoint; frontend changes modify the existing hook and card component and add one new panel component.

## Technical Context

**Language/Version**: Go 1.21 (backend), JavaScript/React 18 (frontend)

**Primary Dependencies**: gorilla/websocket (hub), React, lucide-react, Cypress + cypress-real-events

**Storage**: `~/.forge/sdd/` (decision history, existing); `localStorage` (panel collapsed state)

**Testing**: Go stdlib `testing` (backend unit), Vitest (frontend unit), Cypress (UX)

**Target Platform**: Windows desktop, served by Go binary at `localhost:9999`

**Performance Goals**: Gate card appears within 3 seconds of phase completion (SC-004); status panel updates within 2 seconds of a phase completing (SC-002)

**Constraints**: No additional polling or page-level HTTP calls beyond the one-time status recovery fetch on panel mount (FR-012); artifact content truncated to 200 lines before embedding (FR-009)

**Scale/Scope**: 5 phases, 1 session per tab, typical feature specs are 100–500 lines

## Constitution Check

| Article | Requirement | Status |
|---------|-------------|--------|
| I — Best route | Reuse all existing infrastructure; net-new only where framework gap exists (R5 in research.md) | PASS |
| III — Branching | Must branch from main: `feature/004-sdd-pipeline-dashboard` | REQUIRED |
| IV — Code quality | Self-documenting names, verb-first functions, <40 lines per function | REQUIRED |
| V — Testing | Unit tests 100% mocked (<10ms); Cypress with cypress-real-events for UX; Red→Green→Refactor | REQUIRED |
| VII — Framework-First | WebSocket hub, orchestrator, detector, decision card all REUSED. Net-new: `SddPipelinePanel`, `SDD_PHASE_STATUS` event, artifact embedding. All three have documented gaps in research.md R5 | PASS |
| X — Verification | Terminal output verified via `window.term.buffer.active`, never DOM | REQUIRED |

## Project Structure

### Documentation (this feature)

```text
specs/004-sdd-pipeline-dashboard/
├── plan.md              ← this file
├── research.md          ← R1–R5 decisions
├── data-model.md        ← new types + state transitions
├── quickstart.md        ← 5 validation scenarios
├── contracts/
│   ├── sdd-phase-gate-event-v2.md
│   ├── sdd-phase-status-event.md
│   └── sdd-status-endpoint.md
└── tasks.md             ← /speckit-tasks output (not yet created)
```

### Source Code

```text
Backend (Go)
cmd/forge/
├── sdd_wiring.go          MODIFY — artifact preview embedding, status broadcaster,
│                                   readSddArtifactPreview(), buildPhaseStatuses()
├── sdd_wiring_test.go     MODIFY — new tests: artifact preview read, status build
├── handlers_sdd.go        MODIFY — add GET /api/sdd/status handler
├── handlers_sdd_test.go   MODIFY — new test: status endpoint (no pipeline / active pipeline)
└── main.go                MODIFY — add GET /api/sdd/status route

internal/sdd/
├── types.go               MODIFY — add PhaseStatusEntry, PhaseDisplayStatus
└── types_test.go          ← pre-commit gate requires 1:1 test file; types.go already has one
                             (the const/type additions don't need additional tests — covered
                              by the wiring tests that build PhaseStatusEntry values)

Frontend (React)
frontend/src/
├── components/
│   ├── PhaseDecisionCard.jsx    MODIFY — add artifactPreview prop + preview section
│   ├── PhaseDecisionCard.css    MODIFY — overlay → side drawer layout
│   ├── SddPipelinePanel.jsx     NEW    — five-phase status panel component
│   └── SddPipelinePanel.css     NEW    — bottom panel styling
├── hooks/
│   └── useSddGate.js            MODIFY — handle SDD_PHASE_STATUS, phaseStatuses state,
│                                         fetchInitialStatus() on mount
└── App.jsx                      MODIFY — wire SddPipelinePanel, relocate PhaseDecisionCard
                                          inside terminal-pane as flex child

Tests
frontend/src/components/
└── SddPipelinePanel.test.jsx    NEW — unit tests (mocked hook output)

cypress/e2e/
├── sdd-phase-gate.cy.js         MODIFY — add regression test for non-blocking card
└── sdd-pipeline-dashboard.cy.js NEW    — US1/US2/US3 UX tests
```

## US Delivery Order

Three independently shippable slices. Build in this order (highest pain → most new code):

```
US2  Non-blocking card (CSS + layout move)  — removes the most urgent blocker
US1  Pipeline status panel (new component)  — the original dashboard ask
US3  Artifact preview (backend + card ext.) — completes the decision loop
```

---

## US2 — Non-Blocking Decision Card

**Deliverable**: PhaseDecisionCard converted from full-screen overlay to right-side drawer that does not block the terminal.

### Backend changes

None for US2.

### Frontend changes

**PhaseDecisionCard.css**:

Replace the overlay pattern with a drawer pattern:

```diff
- .phase-decision-card-overlay {
-   position: fixed;
-   inset: 0;
-   background: rgba(0, 0, 0, 0.6);
-   z-index: 10001;
-   display: flex;
-   align-items: center;
-   justify-content: center;
- }

+ .phase-decision-card-drawer {
+   /* Flex child of terminal-pane-content; renders as right-side panel */
+   flex-shrink: 0;
+   width: 380px;
+   display: flex;
+   flex-direction: column;
+   border-left: 1px solid #2a2a2a;
+   background: #111;
+   overflow-y: auto;
+   /* Slide-in animation */
+   transform: translateX(0);
+   transition: width 0.2s ease;
+ }
```

The `.phase-decision-card` inner container loses `max-width: 520px` and border-radius (it now fills the drawer). All other styles are unchanged.

**PhaseDecisionCard.jsx**:

Change the root element from `<div className="phase-decision-card-overlay">` to `<div className="phase-decision-card-drawer">`. The outer div in `App.jsx` previously rendered the component inside the root — it now renders inside `terminal-pane-content`.

**App.jsx**:

1. Move `<PhaseDecisionCard … />` from its current mount point (after the `terminal-pane` closing tag) to INSIDE `div.terminal-pane-content`, as a flex sibling to `div.terminal-container`:

```jsx
<div className="terminal-pane-content">
  <div className="terminal-container">
    {tabs.map(...)}
  </div>
  {/* US2: side drawer — no overlay, terminal remains interactive */}
  <PhaseDecisionCard
    isOpen={sddGate.isCardOpen}
    phase={sddGate.card?.phase}
    summary={sddGate.card?.summary}
    actions={sddGate.card?.actions}
    onAction={(action, clarifyText) => sddGate.submitDecision(action, clarifyText)}
    onDismiss={sddGate.dismiss}
    decisionError={sddGate.decisionError}
    isSubmitting={sddGate.isSubmitting}
  />
</div>
```

2. Add `display: flex; flex-direction: row` to `.terminal-pane-content` in the global CSS (or via inline style).

### Tests

**Cypress** (`sdd-phase-gate.cy.js` — add to existing test file):

```
"non-blocking: terminal scrollable while card is open"
  → open a gate card, scroll the terminal, assert scroll position changed
  → type a character, assert focus went to PTY (via buffer read), not captured by card
```

---

## US1 — Pipeline Status Panel

**Deliverable**: `SddPipelinePanel` component showing all 5 phases with live status, mounted as a collapsible bottom panel inside `terminal-pane`.

### Backend changes

**`internal/sdd/types.go`**: Add `PhaseDisplayStatus` and `PhaseStatusEntry`:

```go
type PhaseDisplayStatus string

const (
    PhaseDisplayPending           PhaseDisplayStatus = "pending"
    PhaseDisplayActive            PhaseDisplayStatus = "active"
    PhaseDisplayAwaitingDecision  PhaseDisplayStatus = "awaiting-decision"
    PhaseDisplayComplete          PhaseDisplayStatus = "complete"
    PhaseDisplayRejected          PhaseDisplayStatus = "rejected"
)

type PhaseStatusEntry struct {
    Phase        PhaseName          `json:"phase"`
    Order        int                `json:"order"`
    DisplayStatus PhaseDisplayStatus `json:"displayStatus"`
    ArtifactPath string             `json:"artifactPath"`
    DecidedAt    *time.Time         `json:"decidedAt"`
}
```

**`cmd/forge/sdd_wiring.go`**: Add `buildPhaseStatuses(pipeline)` and `broadcastPhaseStatus(sessionID)`:

```go
// sddPhaseStatusEnvelope is the SDD_PHASE_STATUS on-wire message.
type sddPhaseStatusEnvelope struct {
    Type      string              `json:"type"`
    SessionID string              `json:"sessionId"`
    Feature   string              `json:"feature"`
    Phases    []sdd.PhaseStatusEntry `json:"phases"`
}

// broadcastPhaseStatus pushes the full phase status array to the session's WS clients.
// Called after every HandlePhaseComplete and after every decision is applied.
func broadcastPhaseStatus(sessionID string) {
    pipeline, ok := sddPipelineFor(sessionID)
    if !ok || termHandler == nil {
        return
    }
    statuses := buildPhaseStatuses(pipeline)
    state := pipeline.orchestrator.State()
    feature := filepath.Base(state.FeatureDir)
    termHandler.BroadcastJSONToSession(sessionID, sddPhaseStatusEnvelope{
        Type:      "SDD_PHASE_STATUS",
        SessionID: sessionID,
        Feature:   feature,
        Phases:    statuses,
    })
}
```

`buildPhaseStatuses` iterates `sdd.PhaseTable()` (expose the package-level table via a new exported function), reads decision history from `loadHistory()`, and maps each phase to its `PhaseDisplayStatus`.

Subscribe `broadcastPhaseStatus` as a completion handler in `startSddPipeline`, and call it from `handleSddDecision` after a successful decision.

**`cmd/forge/handlers_sdd.go`**: Add `handleSddStatus`:

```go
// handleSddStatus returns the current phase status for a session (used by the
// pipeline panel on mount for cold-start recovery; WS events maintain it live).
func handleSddStatus(w http.ResponseWriter, r *http.Request) { ... }
```

Returns the `sddPhaseStatusEnvelope` body (without the `type` discriminator) as JSON.

**`cmd/forge/main.go`**: Register `GET /api/sdd/status`.

### Frontend changes

**`useSddGate.js`**: Add `phaseStatuses` state and `handleWsMessage` branch for `SDD_PHASE_STATUS`:

```js
const [phaseStatuses, setPhaseStatuses] = useState([])

// In handleWsMessage:
if (parsed?.type === SDD_PHASE_STATUS_TYPE) {
    if (parsed.sessionId !== activeSessionId) return
    setPhaseStatuses(parsed.phases ?? [])
    return
}
```

Add `fetchInitialStatus` called in a mount effect:

```js
useEffect(() => {
    if (!activeSessionId) return
    fetch(`/api/sdd/status?sessionId=${encodeURIComponent(activeSessionId)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.phases?.length) setPhaseStatuses(data.phases) })
        .catch(() => {}) // best-effort; WS events are the live source
}, [activeSessionId])
```

Export `phaseStatuses` from the hook.

**`SddPipelinePanel.jsx`** (new file):

Renders a collapsible bottom bar. Props: `{ phases, isVisible }`.

- Collapsed state: single row, `Ctrl+Shift+P` or toggle button opens/closes; badge shows count of phases awaiting decision.
- Expanded state: one row per phase with a status icon, phase name, and artifact path (clickable path opens the file via `onFileOpen` if wired).
- Status icons: `·` pending, `◌` active, `⏳` awaiting-decision, `✓` complete, `✗` rejected.

**`App.jsx`**:

1. Import `SddPipelinePanel`.
2. Mount it as a flex child of `terminal-pane` between the tab bar / search bar area and `terminal-pane-content`. OR after `terminal-pane-content`. The `terminal-pane` gets `flex-direction: column`.
3. Pass `phases={sddGate.phaseStatuses}` and `isVisible={sddGate.phaseStatuses.length > 0}`.

### Tests

**`SddPipelinePanel.test.jsx`** (new):

```
- renders idle state when phases = []
- renders 5 rows when phases array is full
- shows correct status icon per PhaseDisplayStatus value
- collapses to header bar on toggle click
- shows badge when a phase is awaiting-decision while collapsed
```

**Cypress** (`sdd-pipeline-dashboard.cy.js`, US1 block):

```
- panel shows all 5 phases after bind
- panel updates within 2s of /speckit-specify completion
- panel collapses and shows badge on next completion
- terminal remains scrollable with panel visible
```

---

## US3 — Artifact Preview in Decision Card

**Deliverable**: Gate card includes a scrollable, collapsible preview of the phase artifact; content embedded in the `SDD_PHASE_GATE` WebSocket event.

### Backend changes

**`cmd/forge/sdd_wiring.go`**: Add `sddArtifactPreview` type and `readSddArtifactPreview()`:

```go
const sddArtifactMaxLines = 200

type sddArtifactPreview struct {
    Content     string `json:"content"`
    TotalLines  int    `json:"totalLines"`
    FilePath    string `json:"filePath"`
    IsTruncated bool   `json:"isTruncated"`
}

// readSddArtifactPreview reads a file and returns the first sddArtifactMaxLines lines.
// Returns a zero-value preview (Content:"") when the file cannot be read.
func readSddArtifactPreview(absPath string, maxLines int) *sddArtifactPreview { ... }
```

Extend `sddGateEnvelope`:

```go
type sddGateEnvelope struct {
    Type            string               `json:"type"`
    sdd.DecisionCard
    ArtifactPreview *sddArtifactPreview  `json:"artifactPreview,omitempty"`
}
```

In `newSddBroadcaster()`, after building the base envelope, look up the phase's `ExpectedArtifact` from `sdd.PhaseByName(card.Phase)`, look up the pipeline for `card.SessionID`, and read the preview:

```go
phase, found := sdd.PhaseByName(card.Phase)
if found && phase.ExpectedArtifact != "" {
    if pipeline, ok := sddPipelineFor(card.SessionID); ok {
        absPath := filepath.Join(pipeline.orchestrator.State().FeatureDir, phase.ExpectedArtifact)
        envelope.ArtifactPreview = readSddArtifactPreview(absPath, sddArtifactMaxLines)
    }
}
```

### Frontend changes

**`useSddGate.js`**: The `card` state already stores the full `SDD_PHASE_GATE` payload — `artifactPreview` arrives automatically.

**`PhaseDecisionCard.jsx`**: Add an `artifactPreview` section below the flags row:

```jsx
{artifactPreview && (
  <ArtifactPreviewSection
    content={artifactPreview.content}
    filePath={artifactPreview.filePath}
    totalLines={artifactPreview.totalLines}
    isTruncated={artifactPreview.isTruncated}
    defaultExpanded={false}
  />
)}
```

`ArtifactPreviewSection` is a local sub-component (same file): a collapsible `<details>`-style section with a scrollable `<pre>` block for the content.

**`PhaseDecisionCard.css`**: Add `.phase-decision-card-artifact-preview` styles.

### Tests

**Cypress** (`sdd-pipeline-dashboard.cy.js`, US3 block):

```
- card shows artifact preview section for file-detected phases
- preview section is absent for pty-quiet phases (validate / implement)
- truncation notice shows when isTruncated=true
- preview collapses and defaults collapsed on next gate
- fallback message shown when content === ""
```

---

## Complexity Tracking

No constitution violations.

---

## CHANGELOG note (required by Article VI)

Every PR that ships a US must include a CHANGELOG entry under the next minor version bump.

Suggested entry:

```
## [v7.17.0] — 2026-06-15

### Added
- SDD pipeline status panel: persistent bottom panel showing all 5 speckit phases with live status
- SDD gate card is now a non-blocking side drawer — terminal remains scrollable and interactive
- SDD gate card includes artifact preview (first 200 lines) for file-detected phases
```
