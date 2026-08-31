# Feature Specification: SDD Pipeline Dashboard

**Feature Branch**: `feature/006-sdd-pipeline-dashboard`

**Created**: 2026-06-18

**Status**: Draft

**Input**: Replace the collapsible SddPipelinePanel and floating PhaseDecisionCard with a single, always-visible SDD Pipeline Dashboard that gives developers an at-a-glance view of all pipeline phases and inline decision controls.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Glanceable Pipeline State (Priority: P1)

A developer is mid-conversation in the terminal. Without interrupting their flow, they can look at the bottom of the screen and instantly know: which phases are done, which is running, and which needs a decision — without clicking, scrolling, or expanding anything.

**Why this priority**: This is the core value of the dashboard. If this fails, everything else is irrelevant. The previous design required interaction to understand state; this story eliminates that friction entirely.

**Independent Test**: Open Forge Terminal with a pipeline active. The dashboard is visible at the bottom of the screen. Without clicking anything, a tester can correctly answer: "What is the current phase? What is its status? How many times has it run?" in under 5 seconds.

**Acceptance Scenarios**:

1. **Given** a pipeline is running the Tasks phase for the first time, **When** the developer looks at the dashboard, **Then** they see 6 phase cells in a horizontal row — Specify, Clarify, and Plan marked complete, Tasks marked running, Validate and Implement marked pending — with no user interaction required.

2. **Given** a phase has been rejected and re-run twice, **When** the developer looks at the dashboard, **Then** the phase cell shows an "iterating" visual state and a "×2" run-count badge alongside the phase name.

3. **Given** no feature pipeline is active, **When** the developer looks at the dashboard, **Then** they see an idle state with a brief prompt explaining how to start a pipeline.

4. **Given** a phase gate is open awaiting a decision, **When** the developer looks at the dashboard, **Then** the awaiting phase cell is visually distinct from all other phase states, and a single sentence below the rail tells them exactly what to do next.

---

### User Story 2 — Inline Decision at the Gate (Priority: P2)

When a phase completes and opens a decision gate, the developer approves, rejects, or requests a clarification directly within the dashboard — no separate card or overlay opens over the terminal.

**Why this priority**: The previous floating card interrupted the terminal context. Inline decision controls eliminate that disruption and keep the developer oriented.

**Independent Test**: Trigger a phase completion (e.g., complete the Plan phase). The decision controls appear in the dashboard below the phase rail. Approve, Reject, and Clarify buttons are all reachable and functional without any modal opening.

**Acceptance Scenarios**:

1. **Given** a phase gate is open, **When** the developer clicks Approve, **Then** the pipeline advances to the next phase, the gate closes, the decision controls disappear, and the action prompt updates — all within the dashboard, with no overlay.

2. **Given** a phase gate is open, **When** the developer clicks Reject, **Then** the gate closes with a rejected status shown on the phase cell, and the action prompt tells the developer to re-run that phase.

3. **Given** a phase gate is open, **When** the developer clicks Clarify, **Then** a small focused dialog opens for the developer to type their steer; submitting the steer advances the pipeline and closes the dialog.

4. **Given** a phase gate is open and the developer clicks Clarify but types only whitespace, **Then** the Confirm button in the dialog remains disabled and the decision cannot be submitted.

5. **Given** a decision is submitted and the backend returns an error, **When** the error is received, **Then** an error message appears inline below the decision controls; the gate remains open and the developer can retry.

---

### User Story 3 — Phase Detail Drill-Down (Priority: P3)

A developer wants to review the outcome of a completed phase without navigating away from the terminal. They click the completed phase cell to see a structured summary — headline, produced files, and any flags.

**Why this priority**: After inline decisions, the most common follow-up is "what did that phase produce?" This replaces the previous wall-of-text artifact preview with a structured, scannable summary.

**Independent Test**: Complete the Plan phase and approve it. Click the Plan phase cell. A summary panel expands below the rail showing the headline, a list of produced files as chips, and a flag indicator. Click "View artifact →" — the file opens in the in-app editor.

**Acceptance Scenarios**:

1. **Given** a phase is complete, **When** the developer clicks its cell, **Then** a detail strip expands below the phase rail showing: the outcome headline, produced file names as individual chips, and flag badges (or "No flags" if clean).

2. **Given** a phase detail strip is open, **When** the developer clicks "View artifact →", **Then** the phase artifact opens in the in-app file editor without closing the dashboard or navigating away.

3. **Given** a phase detail strip is open, **When** the developer clicks the same phase cell again, **Then** the detail strip collapses.

4. **Given** a phase detail strip is open for Phase A, **When** the developer clicks a different completed phase cell (Phase B), **Then** the detail strip updates to show Phase B's summary (only one detail strip is open at a time).

5. **Given** a phase produced no files, **When** its detail strip is opened, **Then** the strip shows "No artifacts produced" rather than an empty list.

---

### User Story 4 — Always-On Action Prompt (Priority: P4)

Below the phase rail, a single sentence always tells the developer what to do next. This sentence updates automatically as the pipeline state changes and is never absent.

**Why this priority**: Eliminates the cognitive load of "what now?" at every pipeline state transition. Lower priority because it existed in the previous design (ActionPromptStrip); this story requires it to remain functional after the redesign.

**Independent Test**: Watch the dashboard through a full pipeline run. At every state change — phase starts, phase awaits decision, phase is approved — the sentence below the rail reflects the new required action within one screen refresh.

**Acceptance Scenarios**:

1. **Given** a phase is running, **When** the developer reads the action prompt, **Then** it says "{Phase} is running…".

2. **Given** a gate is open for the first run of a phase, **When** the developer reads the action prompt, **Then** it says "Review the artifact above, then Approve, Reject, or Clarify."

3. **Given** a gate is open and the phase has run more than once, **When** the developer reads the action prompt, **Then** it says "Approve this iteration, or Reject to try again."

4. **Given** all phases are complete, **When** the developer reads the action prompt, **Then** it says "Pipeline complete."

---

### Edge Cases

- What happens when a phase summary has no produced files? The detail strip shows "No artifacts produced" instead of an empty chip list.
- What happens if a phase status update arrives while the detail strip is open? The strip updates its content without closing.
- What happens if all 6 phase cells cannot fit at narrow terminal widths? Cells reduce padding; below a defined minimum, cells show icon only (names hidden).
- What happens if the "View artifact" file no longer exists on disk? The in-app editor's existing file-not-found handling applies — no new error handling required in the dashboard.
- What happens if the backend gate error persists across multiple retries? The error message remains visible; the developer can always dismiss via the dashboard (no trap state).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The pipeline status view MUST always be visible on-screen in a fixed area at the bottom of the terminal window; it MUST NOT be collapsible or hideable.
- **FR-002**: The view MUST simultaneously display all 6 pipeline phases (specify, clarify, plan, tasks, validate, implement) in a single horizontal row.
- **FR-003**: Each phase cell MUST display: a status icon, the phase name, a one-word status label, and a run-count badge (shown only when the phase has run 2 or more times).
- **FR-004**: The view MUST render 6 visually distinct states per phase cell: pending, running, awaiting-decision (first run), iterating (awaiting on a re-run), rejected, and complete.
- **FR-005**: When a phase gate is open, decision controls (Approve, Reject, Clarify) MUST appear inline in the dashboard below the phase rail — no separate overlay or modal.
- **FR-006**: The Clarify control MUST open a focused dialog for steer input; the dialog MUST prevent submission if the steer is empty or whitespace-only.
- **FR-007**: A developer MUST be able to click any completed phase cell to expand a detail strip showing: the phase outcome headline, produced files as individual chips, and flag badges.
- **FR-008**: The detail strip MUST include a "View artifact →" control that opens the phase artifact in the in-app file editor.
- **FR-009**: Only one detail strip MUST be open at a time; opening a second phase's detail strip MUST close the first.
- **FR-010**: The view MUST display exactly one action-prompt sentence at all times that reflects the current pipeline state.
- **FR-011**: The view MUST display the active feature name and a pipeline-level status badge in a header area.
- **FR-012**: When no pipeline is active, the view MUST show an idle state with guidance on how to start a pipeline.
- **FR-013**: When a decision submission results in a backend error, the error MUST be shown inline below the decision controls; the gate MUST remain open so the developer can retry or dismiss.

### Key Entities

- **Pipeline**: The 6-phase Spec-Driven Development process bound to one feature. Has an overall status (idle, running, awaiting-decision, rejected, complete) and a feature name.
- **Phase**: One step in the pipeline. Has a display status (pending / running / awaiting-decision / iterating / rejected / complete) and a run count.
- **Phase Summary**: The structured outcome of a completed phase. Contains a headline, a list of produced artifact file names, and a list of flags (each with a severity: info, warn, or block).
- **Decision**: The developer's choice at a gate: approve, reject, or clarify. Clarify carries an additional plain-text steer.
- **Steer**: Non-empty plain text that the developer attaches to a Clarify decision to guide the next phase.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can determine the current pipeline state — what is done, what is running, what is awaiting a decision — without any clicks, scrolling, or expanding, in under 5 seconds from looking at the screen.
- **SC-002**: A developer can submit an approve, reject, or clarify decision in 2 or fewer interactions (clicks or keystrokes) from when the gate becomes visible.
- **SC-003**: A developer can view a completed phase's structured summary and open its artifact in the editor in 2 or fewer clicks.
- **SC-004**: The dashboard occupies a fixed screen area that does not grow, shift, or scroll during any pipeline state transition, including when a detail strip or decision controls appear.
- **SC-005**: Every pipeline state change is reflected in the dashboard within one screen-refresh cycle of the underlying event being received — no manual refresh is required.
- **SC-006**: At no pipeline state is the action prompt absent; it always shows exactly one sentence appropriate to the current state.

## Assumptions

- The active feature name is already present in the pipeline state data delivered by the existing WebSocket event; no new backend data source is required.
- The in-app file editor (Monaco) is already integrated and reachable via an existing open-file mechanism; the dashboard calls that mechanism directly.
- The developer is the sole user of a feature's pipeline session; no multi-user or shared-session scope applies to this feature.
- The "Clarify" steer is plain text only; rich text or markdown formatting in the steer input is out of scope.
- At narrow terminal widths where all 6 phase cells cannot display full labels, cells may degrade to icon-only display; this is acceptable and does not require a separate responsive breakpoint specification.
- Removing the previous collapsible panel and floating decision card is intentional; no backward-compatibility or feature-flag toggle is required.
- The existing `useSddGate` hook already delivers all required pipeline state (phases, gate status, decision submission function); no new backend APIs are needed.
