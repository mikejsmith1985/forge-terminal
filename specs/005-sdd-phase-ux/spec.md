# Feature Specification: SDD Phase UX — Glanceable State + Action Guidance

**Feature Branch**: `feature/005-sdd-phase-ux`

**Created**: 2026-06-16

**Status**: Shipped (v7.16.3 — 2026-06-17)

**Input**: User description: "I hate everything about the SDD Phase and monitoring solution we just implemented. I want to use the speckit and I want to do SDD but the way that the TUI shows me where we are and what we've done I'm never really clear if the current SDD phase is being iterated on again, should be iterated on again, or is complete. I don't read about 90% or more of what you write to me. I have no patience for it. I need punchy details with visuals to show me where I am in the process and guide me to how to respond. Is there any way to do that?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Glanceable Phase State (Priority: P1)

A developer glances at the pipeline panel and instantly knows — without reading prose — exactly which phase is running, which are done, which need re-running, and which have never started.

Each of the five SDD phases displays a distinct icon + short label pair covering these six states:

| State | Meaning |
|-------|---------|
| `◌ Waiting` | Phase has not been started yet |
| `⟳ Running` | Phase is currently executing |
| `⏳ Awaiting` | Phase complete; gate card open — decision pending |
| `✓ Done` | Phase completed and approved |
| `⚠ Redo` | Phase completed but was rejected — must re-run |
| `↻ Iterating` | Phase completed again after a prior rejection — gate is open for the second (or later) time |

**Why this priority**: Without being able to distinguish "running for the first time" from "re-running after rejection" from "complete," every other UX improvement is noise. This is the single root cause of the user's confusion.

**Independent Test**: Run `/speckit-specify`, reject at the gate, then re-run. The Specify phase shows `⟳ Running` → `⚠ Redo` → `↻ Iterating` → `✓ Done` across the four transitions. A new observer seeing only the panel at any moment can name the correct state without prompting.

**Acceptance Scenarios**:

1. **Given** a phase has never been run, **When** the user views the panel, **Then** that phase shows `◌ Waiting` (greyed out, visually receding).
2. **Given** a phase is executing for the first time, **When** the user views the panel, **Then** that phase shows `⟳ Running` with a spinner animation.
3. **Given** a phase completed and was approved, **When** the user views the panel, **Then** that phase shows `✓ Done` (green, static).
4. **Given** a phase was rejected at the gate, **When** the user views the panel, **Then** that phase immediately changes to `⚠ Redo` (amber, static) without requiring a page action.
5. **Given** a rejected phase has completed again and the gate is open for the second (or later) time, **When** the user views the panel, **Then** that phase shows `↻ Iterating` (amber spinner), visually distinct from `⟳ Running` (blue spinner). While actually re-running, the phase shows `⟳ Running` — `↻ Iterating` fires at the gate, not during execution, because no "phase started" event exists in the current architecture.
6. **Given** any state transition occurs, **When** the user's eye is on the panel, **Then** the transition is animated so the change is noticed peripherally — no transition is silent.

---

### User Story 2 — Single-Sentence Action Prompt (Priority: P2)

After every gate event (phase complete, phase rejected, pipeline idle), the TUI displays exactly one sentence telling the developer what to do right now. Nothing else.

**Why this priority**: The developer described reading less than 10% of the agent's text output. An action prompt replaces paragraphs with one directive. This is the highest-leverage text reduction possible.

**Independent Test**: With the Clarify phase gate card open, the footer of the card shows exactly one sentence — e.g., "Review the questions above, then choose Approve, Reject, or type a clarification." — and no other instructional text appears elsewhere in the UI.

**Acceptance Scenarios**:

1. **Given** a gate card appears, **When** the card renders, **Then** a single action sentence appears in a visually prominent position (e.g., bold, coloured, or in a dedicated footer strip) at the bottom of the card.
2. **Given** the action prompt is visible, **When** the user reads it, **Then** the sentence contains exactly one imperative verb and names the specific next action (the available button labels or keyboard shortcut).
3. **Given** a phase is running (no gate card open), **When** the user views the pipeline panel, **Then** a single passive status line appears below the panel — e.g., "Specify is running…" — replacing any previous action prompt.
4. **Given** the pipeline is idle (no phase running, no gate open), **When** the user views the panel, **Then** the action prompt reads the next logical command to run — e.g., "Run /speckit-plan to continue."
5. **Given** a phase is rejected, **When** the gate closes, **Then** the action prompt updates to: "Run [/speckit-{phase}] to retry this phase."
6. **Given** all phases are complete, **When** the user views the panel, **Then** the action prompt reads "Pipeline complete." and no further directive is shown.

---

### User Story 3 — Iteration Counter per Phase (Priority: P3)

Each phase in the pipeline panel shows how many times it has run. A phase that has been iterated more than once displays a compact counter (e.g., `×2`) next to its state icon, making re-work visible without having to read scrollback.

**Why this priority**: The counter is the proof-of-state: it disambiguates "this phase ran once cleanly" from "this phase took 3 attempts." Without it, `✓ Done` looks identical regardless of iteration count. This builds on P1 and P2 being in place.

**Independent Test**: Reject Specify twice, then approve it on the third attempt. The Specify row shows `✓ Done ×3` in the panel. No scrollback reading required.

**Acceptance Scenarios**:

1. **Given** a phase completes for the first time, **When** the user views the panel, **Then** no counter is displayed (clean first-run is the default/zero state — no noise added).
2. **Given** a phase has run and been rejected at least once, **When** the user views the panel, **Then** the phase row shows `×N` where N is the total number of completed runs (not attempts).
3. **Given** a phase is currently iterating, **When** the user views the panel, **Then** the counter shows the count of completed runs so far, not the in-progress run.
4. **Given** the pipeline resets (new feature bound), **When** the user views the panel, **Then** all counters reset to the hidden (zero) state.

---

### Edge Cases

- What happens when the agent posts a very long action prompt? The prompt MUST be truncated to a single sentence of ≤ 100 characters; any trailing content is dropped, not wrapped.
- What happens on a very narrow viewport where icons and labels cannot all fit on one row? The icon alone is retained; the label text is hidden. State is never lost.
- What happens if the backend sends an unknown phase state? The panel displays `? Unknown` in the phase row and the action prompt reads "Unexpected pipeline state. Check the terminal."
- What happens when a phase transitions during a gate card interaction? The panel updates but the gate card remains open and usable — no forced close.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each of the five SDD phases MUST display one of six distinct visual states: Waiting, Running, Awaiting, Done, Redo, Iterating — each with a unique icon and colour, with no two states sharing the same icon. ("Awaiting" is the gate-card-open state, distinct from Running because the phase has completed but not yet been decided.) See data-model.md for the mapping to display-status enum values.
- **FR-002**: The transition between any two phase states MUST trigger a visible animation so the change is noticeable without the user actively watching the panel.
- **FR-003**: The `↻ Iterating` state MUST be visually distinct from `⟳ Running` — at minimum, different icon and different colour, so a developer who rejected a phase can confirm re-execution at a glance without reading any text.
- **FR-004**: After every gate event (phase complete, phase rejected, phase running, pipeline idle, pipeline complete), the system MUST display exactly one action sentence in a designated prompt area — never more than one sentence, never zero sentences when an action is available.
- **FR-005**: The action prompt MUST use the exact command name or button label the user should interact with next (e.g., `/speckit-plan`, "Approve", "Reject") so the user can act without inferring.
- **FR-006**: "Prose output" — defined as multi-sentence agent narration, phase summary paragraphs, or instructional text blocks outside the `ActionPromptStrip` — MUST NOT appear inside the pipeline panel or gate card body. Prose belongs to the terminal scrollback only. *Implementation note*: satisfied by spec-004's clean BEM-based panel implementation, which never added prose text to the panel body. The only text elements in the panel are state icons, phase name labels, the `×N` counter, and the single `ActionPromptStrip` sentence. No task was required to remove prose because the panel was built fresh without it.
- **FR-007**: Each phase row MUST display an iteration counter (`×N`) when N ≥ 2 (i.e., the phase has completed at least twice). The counter MUST be omitted when N = 1 (clean first-run).
- **FR-008**: The iteration counter MUST reflect completed runs only; an in-progress re-run does not increment the counter until it completes.
- **FR-009**: All state, counter, and action prompt data MUST derive from the existing WebSocket event stream — no polling permitted, no new transport required (extending FR-012 of spec-004).
- **FR-010**: When the pipeline has no active feature bound (idle state), the panel MUST show a compact idle indicator rather than five Waiting rows, to reduce visual noise.

### Terminology Note

The user-facing state labels in the table above (Waiting, Running, Awaiting, Done, Redo, Iterating) map to code-level enum values (`pending`, `active`, `awaiting-decision`, `complete`, `rejected`, `iterating`). The full label → enum mapping is defined in `specs/005-sdd-phase-ux/data-model.md`.

### Key Entities

- **Phase Row**: One of five named rows (Specify, Clarify, Plan, Validate, Implement), each carrying: state enum, iteration count, icon, colour, and label.
- **Action Prompt**: A single-sentence string, keyed to the current pipeline state, displayed in a fixed UI region separate from the terminal and gate card body.
- **Pipeline State Machine**: The aggregate of all five phase rows; determines which action prompt string to render.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can correctly name the state of every SDD phase within 3 seconds of looking at the pipeline panel — verified by a first-time observer identifying states correctly without prompting.
- **SC-002**: Zero ambiguity events between "running first time," "re-running after rejection," and "complete" — the three states the user reported as indistinguishable — verified by exercising all three state transitions sequentially and confirming each produces a distinct visual output a new observer can name correctly without prompting.
- **SC-003**: The action prompt region contains ≤ 1 sentence at all times; any gate card or panel state that previously showed multiple instructional paragraphs now shows exactly one sentence.
- **SC-004**: The iteration counter correctly reflects completed-run count for all reject-and-retry sequences (1×: no counter; 2×: `×2`; 3×: `×3`) with no off-by-one errors across all five phases.
- **SC-005**: A developer who has never used speckit can follow the action prompt alone — without reading scrollback — to advance the pipeline to the next phase, measured by task-completion rate in a first-use scenario.

## Clarifications

### Session 2026-06-16

- Q: Should `⏳ Awaiting` (gate-card-open state) appear as a named row in the US1 icon table alongside the other five states? → A: Yes — added as the 6th row; FR-001's six-state enumeration now aligns with the US1 acceptance table.
- Q: Does `⟳ Running` (first-time execution) also spin, or is only `↻ Iterating` animated? → A: Both spin; colour alone distinguishes them (blue for Running, amber for Iterating). Applied as recommended default when user advanced to `/speckit-plan`.

## Assumptions

- The five SDD phases and their names (Specify, Clarify, Plan, Validate, Implement) are stable — no new phases will be added in this feature's scope.
- The existing WebSocket event stream (from spec-004) already carries enough data to derive all five state enum values and iteration counts; if it does not, the backend event payload must be extended to include `run_count` per phase as part of this feature's implementation.
- The pipeline panel and gate card UI components built in spec-004 are the target surfaces for this redesign; no new layout containers are being introduced.
- Verbose prose output currently produced by the agent narration layer is suppressible without breaking any downstream functionality — suppression is scoped to the panel and gate card only, not the terminal scrollback.
- The iteration counter resets when a new feature is bound to the session (not when the app restarts), matching the lifecycle of the pipeline state itself.
- Keyboard shortcut guidance (e.g., "press A to Approve") is out of scope for this iteration; the action prompt references button labels only.
