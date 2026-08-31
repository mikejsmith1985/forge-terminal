# Feature Specification: SDD Pipeline Dashboard

**Feature Branch**: `feature/004-sdd-pipeline-dashboard`

**Created**: 2026-06-15

**Status**: Draft

**Input**: User description: "Non-blocking decision cards + persistent pipeline status panel showing all 5 SDD phases with live artifact preview so the user can review outputs before choosing Approve/Reject/Clarify"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Pipeline Status Panel (Priority: P1)

As a developer running a speckit pipeline, I want a persistent panel inside Forge Terminal that shows the current status of all five SDD phases (Specify, Clarify, Plan, Validate, Implement), so I always know where I am in the pipeline and what has already been completed — without having to remember or infer it from the terminal scrollback.

**Why this priority**: Without situational awareness of the full pipeline, the developer cannot make informed decisions at gate cards. This is the foundational view the other two stories depend on.

**Independent Test**: Open a Forge Terminal session, bind to a speckit feature, run `/speckit-specify`. The status panel appears and shows Specify as complete with the remaining phases as pending. Delivers standalone value: pipeline progress is visible at all times without any gate card interaction.

**Acceptance Scenarios**:

1. **Given** no speckit pipeline is active, **When** the user opens Forge Terminal, **Then** the pipeline status panel is absent or shows an idle/no-feature state.
2. **Given** a pipeline is bound, **When** each phase completes, **Then** the corresponding row in the panel updates to "complete" within 2 seconds, without requiring a page refresh.
3. **Given** the panel is visible, **When** the user scrolls or interacts with the terminal, **Then** the panel does not obstruct or overlay the terminal content.
4. **Given** a phase was rejected, **When** the user views the panel, **Then** that phase row shows a "rejected" status distinct from "pending" and "complete."
5. **Given** a phase is actively running, **When** the user views the panel, **Then** that phase shows an "active/running" status visually distinct from the others.

---

### User Story 2 — Non-Blocking Decision Card (Priority: P2)

As a developer at a pipeline gate, I want the decision card (Approve / Reject / Clarify) to appear as a side panel or drawer that does not cover the terminal, so I can scroll through the terminal output to review the phase's work before choosing an action.

**Why this priority**: The current modal blocks the terminal entirely. Choosing an action without reading the output is guesswork. This is the single most disruptive UX problem with the shipped feature.

**Independent Test**: With a pending gate card open, scroll the terminal up to read earlier output, then scroll back and click Approve. Both scroll and button actions work without interaction interference. Delivers standalone value even without the status panel.

**Acceptance Scenarios**:

1. **Given** a phase has completed and a gate card is pending, **When** the card appears, **Then** the terminal remains fully scrollable and interactive while the card is visible.
2. **Given** the gate card is open, **When** the user types in the terminal or clicks within the terminal pane, **Then** those interactions are not captured or blocked by the card.
3. **Given** the gate card is open, **When** the user presses Escape or clicks the dismiss (✕) button, **Then** the card closes without submitting a decision (existing failsafe behaviour preserved).
4. **Given** the gate card is open, **When** the user submits a decision, **Then** the card closes and the terminal remains in its current scroll position.
5. **Given** the gate card is open on a narrow viewport, **Then** the card does not horizontally compress the terminal pane below a usable width.

---

### User Story 3 — Artifact Preview in Decision Card (Priority: P3)

As a developer at a pipeline gate, I want to see the key content of the artifact produced by the just-completed phase directly inside the decision card, so I can read it without separately navigating to the file, and then choose Approve / Reject / Clarify based on what I actually read.

**Why this priority**: US1 and US2 remove the structural barriers; US3 brings the content to the decision point itself. It completes the loop but is not required for the structural improvements to deliver value.

**Independent Test**: At the Plan gate card, an expandable or inline section shows the content of `plan.md`. The user reads it and clicks Approve, all within the card. Delivers standalone value independent of US1/US2.

**Acceptance Scenarios**:

1. **Given** a gate card is pending for a file-detected phase (Specify, Clarify, Plan), **When** the card renders, **Then** it includes a scrollable preview section containing the artifact's text content.
2. **Given** the artifact file does not exist or cannot be read, **When** the card renders, **Then** the preview section shows a graceful message ("Artifact not yet available") rather than an error or blank space.
3. **Given** a gate card is pending for a pty-quiet phase (Validate, Implement) that produces no artifact file, **When** the card renders, **Then** no artifact preview section is shown; the card summarises the phase completion signal instead.
4. **Given** the artifact exceeds the configured line limit (default: 200 lines), **When** the card renders the preview, **Then** the preview is truncated with an indication of how much content was omitted and the file path so the user can read the full file.
5. **Given** the user collapses the artifact preview, **When** the card is dismissed and reopened (for the same gate), **Then** the preview defaults to collapsed state.

---

### Edge Cases

- What happens when the WebSocket connection drops while a gate card is open? The card remains visible with its last-known state; the user can still dismiss it with ✕ or Escape.
- What happens when two tabs bind to the same feature? Each tab's status panel reflects its own pipeline state; they do not interfere.
- What happens when the user collapses/hides the status panel and then a new phase completes? A visual indicator (e.g. badge or colour change on the panel toggle) alerts the user without forcing the panel open.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display a persistent pipeline status panel showing all five SDD phases (Specify, Clarify, Plan, Validate, Implement) and the current status of each (pending, active, awaiting-decision, complete, rejected).
- **FR-002**: The status panel MUST update within 2 seconds of a phase completing, without requiring a page reload or manual refresh.
- **FR-003**: The status panel MUST be collapsible by the user and MUST NOT overlay or obstruct the terminal pane when visible.
- **FR-004**: The pipeline status panel MUST show an idle or hidden state when no speckit pipeline is active for the current session.
- **FR-005**: The decision card MUST be presented as a non-overlapping side panel or anchored drawer rather than a full-screen modal, leaving the terminal pane accessible.
- **FR-006**: The decision card MUST NOT capture keyboard input or pointer events directed at the terminal pane while the card is open.
- **FR-007**: The existing failsafe dismiss behaviour (✕ button, Escape key, local close with no backend call) MUST be preserved in the new non-blocking layout.
- **FR-008**: For file-detected phases, the decision card MUST include a scrollable preview section displaying the text content of the phase artifact, delivered as part of the `SDD_PHASE_GATE` WebSocket event payload.
- **FR-009**: The backend MUST truncate the artifact content to a configurable line limit (default: 200 lines) before embedding it in the event payload, and MUST include the total line count and full file path so the frontend can communicate what was omitted.
- **FR-010**: The artifact preview section MUST be omitted entirely (not shown as empty) when no artifact file is associated with the completed phase.
- **FR-011**: When the artifact cannot be read (file missing, read error), the backend MUST embed a structured error marker in the payload; the frontend MUST display a user-friendly fallback message rather than an error state or blank block.
- **FR-012**: The status panel and decision card MUST receive live data from the existing WebSocket event stream; no polling is permitted. Artifact content is delivered atomically with the gate event, not fetched separately. A single best-effort HTTP fetch to `GET /api/sdd/status` on panel mount is permitted for page-reload recovery of pipeline state.

### Key Entities

- **Pipeline Status**: The set of five phase rows, each with a name, status enum (idle / active / awaiting-decision / complete / rejected), and a link to the artifact path if one exists.
- **Decision Card**: The existing gating component (phase, summary, actions, artifact preview section) now rendered as a non-blocking drawer.
- **Artifact Preview**: The truncated text content of a phase artifact, with metadata (line count, total lines, file path).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can identify the current pipeline phase and all previously completed phases within 5 seconds of opening Forge Terminal, without scrolling the terminal or running any command.
- **SC-002**: A developer can read the terminal output produced by a completed phase while the gate decision card is open (measured by scroll position being reachable with the card visible).
- **SC-003**: A developer can read the phase artifact and submit a gate decision in a single uninterrupted interaction — no window switching, no file navigation — for all file-detected phases.
- **SC-004**: The decision card appears within 3 seconds of the pipeline detecting a completed phase (same latency target as the existing gate card, preserved).
- **SC-005**: Zero instances of "trapped session" — a state in which neither the terminal nor the decision card is interactable — after the dashboard is shipped. The failsafe dismiss must work in all layout states.

## Assumptions

- The WebSocket hub already delivers `SDD_PHASE_GATE` events; the status panel will subscribe to these and a new `SDD_PHASE_STATUS` event (or reuse existing event types) rather than requiring a new transport.
- The five SDD phases and their names are stable; no new phases will be added in the scope of this feature.
- Artifact files are plain text (Markdown); no binary or large structured-data artifacts need to be previewed.
- The status panel is scoped to the current session; multi-tab state is not aggregated into a single cross-tab view.
- Mobile or narrow-viewport layouts are out of scope for v1; the panel is designed for a standard desktop terminal window.
- The artifact preview truncation limit (default: 200 lines) is configurable at the component level but does not require a user-facing settings UI in this iteration.

## Clarifications

### Session 2026-06-15

- Q: How does artifact content reach the frontend for preview? → A: Embedded in the existing `SDD_PHASE_GATE` WebSocket event; the backend reads and truncates the artifact (default 200 lines) before broadcasting — no new HTTP endpoint required.
