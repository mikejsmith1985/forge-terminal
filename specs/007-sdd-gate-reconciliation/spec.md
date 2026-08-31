# Feature Specification: SDD Gate Reconciliation

**Feature Branch**: `feature/007-sdd-gate-reconciliation`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "Three targeted changes to the SDD pipeline HITL gate system: (1) automatic reconciliation when execution outruns gate state, (2) auto-approve with veto window for optional phases like Clarify, (3) bulk Approve semantics that jump to the furthest completed phase rather than cascading through intermediate gates."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Pipeline Recovers Automatically When Phases Run Out of Order (Priority: P1)

A developer is working through the SDD pipeline. Their agent tells them to skip directly from Tasks to Implement (bypassing the Analyze gate click). They run `/speckit-implement` in the terminal. When they next look at the SDD Dashboard, the pipeline shows the true state — all completed phases are marked complete — without them needing to manually click through each skipped gate.

**Why this priority**: This is the most frequent stuck-state scenario and the one that currently leaves the pipeline in a permanently inconsistent state. Fixing it eliminates the most common support/confusion path.

**Independent Test**: Can be fully tested by verifying the dashboard phase rail reflects accurate completion status after a manual slash-command run that bypasses one or more gate approvals. Delivers value even without the other two stories because it prevents pipeline lockout.

**Acceptance Scenarios**:

1. **Given** the pipeline is awaiting approval on Phase N, **When** the user runs the slash command for Phase N+2 directly in the terminal and its artifact appears on disk, **Then** the dashboard automatically advances past Phases N and N+1 and shows Phase N+2 as active without any user click.

2. **Given** implementation is fully complete (all phase artifacts exist on disk) but the Clarify gate is still showing AWAITING, **When** the user opens the dashboard (or within one status broadcast cycle), **Then** all phases show their correct completion status and the pipeline is no longer stuck.

3. **Given** no phases have run yet (pipeline is idle), **When** the reconciliation logic runs, **Then** all phases remain Pending and no state is changed.

4. **Given** the pipeline is mid-run and Phases 1–3 are complete with Phase 4 actively running, **When** a status event fires, **Then** reconciliation does not disturb the in-progress phase.

---

### User Story 2 — Optional Phases Self-Advance When the Agent Determines They Are Not Needed (Priority: P2)

A developer runs `/speckit-clarify`. The agent reviews the spec, determines it is already clear and well-defined, and outputs a response indicating no changes are needed. Instead of blocking the pipeline on a gate-approval click, a brief countdown appears in the decision bar. If the developer does nothing for 20 seconds, the phase auto-approves and the pipeline advances. If the developer wants to redirect the agent, they can click a single "Stop — I want to add input" button to keep the gate open.

**Why this priority**: Eliminates the primary token-waste path (running Clarify only to manually approve a no-op result) and removes the temptation to bypass the gate entirely, which causes Story 1's stuck-state problem.

**Independent Test**: Can be tested independently by mocking the Clarify completion signal and verifying the countdown timer appears, fires correctly after the configured interval, and is cancelled when the veto button is clicked.

**Acceptance Scenarios**:

1. **Given** Clarify completes with a "no changes needed" signal, **When** the gate fires, **Then** a countdown timer (default 20 seconds) is shown in the decision bar alongside a single "Stop — I want to add input" veto button, with no Approve/Reject buttons visible.

2. **Given** the countdown is running, **When** the developer does not interact for 20 seconds, **Then** the Clarify phase auto-approves, the pipeline advances to Plan, and a brief "Auto-approved — no clarification needed" confirmation appears before the decision bar clears.

3. **Given** the countdown is running, **When** the developer clicks "Stop — I want to add input", **Then** the countdown cancels, the full gate card appears (Approve / Reject / Clarify buttons), and the developer can interact normally.

4. **Given** Clarify completes with actual changes to the spec (not a "no changes needed" signal), **When** the gate fires, **Then** no countdown appears — the standard gate card is shown immediately and the user must click Approve or Reject.

5. **Given** the auto-approve countdown fires, **When** the developer was temporarily away from the screen, **Then** the pipeline simply continues; no undo action is required (the next gate is Plan, which they will still review).

---

### User Story 3 — Single Approve Click Resolves All Pending Gates (Priority: P3)

A developer clicks Approve on a gate that is several phases behind the actual completion state (because they manually ran later phases). Instead of being presented with a cascade of four consecutive gate cards, the pipeline silently reconciles all intermediate phases and lands on the true current state in a single operation.

**Why this priority**: This is the "last mile" fix for the scenario addressed by Story 1 — for cases where the user proactively clicks Approve before the reconciliation fires automatically. Without this, Story 1 alone fixes the auto-case; this fixes the manual-click case.

**Independent Test**: Can be tested independently by placing the orchestrator in a state where Phase 2's gate is AWAITING but Phases 3–6 are all complete, then submitting an Approve decision and asserting the resulting state reflects all phases complete with no additional gate cards emitted.

**Acceptance Scenarios**:

1. **Given** Clarify is AWAITING and Plan/Tasks/Validate/Implement are all complete, **When** the developer clicks Approve on Clarify, **Then** the dashboard immediately shows all phases complete and no intermediate gate cards appear for Plan, Tasks, Validate, or Implement.

2. **Given** Plan is AWAITING and Tasks/Validate/Implement are all complete, **When** the developer clicks Approve on Plan, **Then** the pipeline resolves all completed phases in one operation and the dashboard shows the pipeline as fully complete.

3. **Given** Clarify is AWAITING and only Plan is additionally complete (Tasks not yet run), **When** the developer clicks Approve on Clarify, **Then** the pipeline advances to Plan's gate (showing it as complete) and then presents Tasks as the active next step — it does not overshoot.

---

### Edge Cases

- What happens when reconciliation fires during the 20-second auto-approve countdown — does the countdown survive correctly or get cancelled?
- What happens if a phase artifact is deleted from disk after the reconciliation has already marked it complete — does the pipeline degrade gracefully or get stuck in the opposite direction?
- What happens if the network drops mid-countdown? **Resolved**: The countdown is client-side and continues running; the resulting Approve action is queued and delivered on reconnect. The gate does not stay open due to a transient disconnection.
- What happens when the auto-approve Approve action fails (server error, session expired)? **Resolved**: Retry up to 3 times with short backoff; if all fail, revert to the standard gate card so the user can approve manually on return. No permanent stuck state.
- What happens when two browser tabs are open and Approve is clicked in one — does the other tab reflect the reconciled state on the next status broadcast?
- What happens when the pipeline is already fully complete and reconciliation runs again — is it idempotent?

## Requirements *(mandatory)*

### Functional Requirements

**Reconciliation (US1)**

- **FR-001**: The pipeline MUST automatically advance gate state to match artifact reality on every status broadcast cycle, without any user action.
- **FR-002**: Reconciliation MUST be idempotent — running it multiple times on the same state produces the same result.
- **FR-003**: Reconciliation MUST NOT disturb a phase that is actively running (artifact not yet produced).
- **FR-004**: The dashboard MUST reflect the reconciled state within one status broadcast cycle (≤ the existing broadcast interval).

**Auto-Approve with Veto Window (US2)**

- **FR-005**: Phases marked as optionally skippable MUST support a configurable auto-approve timeout (in seconds), with a default of 20 seconds. The countdown timer MUST run client-side in the browser; if the network drops during the countdown, the timer continues and the resulting Approve action is queued and sent when the connection restores. No server-side timer management is required.
- **FR-006**: During the countdown, the decision bar MUST display a countdown indicator and a single "Stop — I want to add input" veto button; the Approve / Reject / Clarify buttons MUST NOT be shown.
- **FR-007**: When the countdown expires without a veto, the system MUST auto-approve the phase and advance the pipeline identically to a manual Approve click.
- **FR-008**: When the veto button is clicked, the countdown MUST cancel and the standard gate card MUST appear immediately.
- **FR-009**: Auto-approve MUST only fire when the phase completion signal explicitly contains a recognizable skip marker phrase (e.g., `<!-- clarify:skip -->`) in the agent's terminal output, detected via the existing `signalContentMarker` mechanism; a standard completion signal without this marker MUST show the normal gate card without a countdown. No new tool call or backend mechanism is required.
- **FR-010**: Auto-approve events MUST be recorded with a reason ("auto-approved: no clarification needed") in the pipeline's decision history for auditability.
- **FR-014**: If the Approve action sent after a countdown expiry receives an error response, the system MUST retry up to 3 times with a short backoff. If all 3 attempts fail, the system MUST revert the decision bar to the standard gate card (Approve / Reject / Clarify) so the user can approve manually on return. The failure MUST NOT leave the pipeline in a permanently stuck state.

**Bulk Approve Semantics (US3)**

- **FR-011**: When Approve is submitted on a gate that is behind the actual completion state, the pipeline MUST resolve all intermediate completed phases in a single operation and emit one consolidated status broadcast.
- **FR-012**: Bulk resolution MUST NOT advance past the last phase for which an artifact exists on disk — it MUST stop at the true current frontier.
- **FR-013**: The user MUST NOT see intermediate gate cards for phases that are already complete during a bulk Approve operation.

### Key Entities

- **Gate State**: The orchestrator's record of which phase is current and which decisions have been made; can lag behind artifact state when phases run out of order.
- **Artifact State**: The on-disk reality of which phase output files exist; always authoritative.
- **Reconciliation Pass**: The process of scanning artifact state and advancing gate state to match; runs on every status broadcast.
- **Auto-Approve Timeout**: A per-phase configurable duration after which a "no changes needed" gate self-approves if not vetoed.
- **Veto Window**: The UI countdown period during which the user can interrupt an auto-approve.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A pipeline stuck at Clarify AWAITING with all subsequent phases complete resolves to accurate state within one status broadcast cycle — with zero user interaction required.
- **SC-002**: A developer who clicks Approve on a gate that is N phases behind reality sees the correct final state after exactly one click, with no additional gate cards appearing.
- **SC-003**: When Clarify auto-approves, the end-to-end time from "no changes needed" signal to pipeline-advanced state is ≤ the configured timeout plus one broadcast cycle.
- **SC-004**: Zero new stuck-state scenarios are introduced by any of the three changes (verified by the existing and new test suite).
- **SC-005**: Reconciliation is idempotent — running it 100 times on a stable state produces the same result each time.
- **SC-006**: Auto-approve events are distinguishable from manual approvals in pipeline history, enabling future audit queries.

## Assumptions

- The three changes are independent enough to be implemented and tested separately; they ship together in one feature branch but each can be verified in isolation.
- The Clarify phase is the primary candidate for auto-approve in the initial implementation; other phases (e.g., Validate) may be added in future iterations but are out of scope here.
- The configurable auto-approve timeout is a server-side setting per phase definition, not a per-user preference.
- The auto-approve countdown is client-side and unaffected by transient network drops; the queued Approve action is sent on reconnect. Behavior under sustained disconnection (where reconnect never occurs) is handled by the existing reconnect/recovery path and is out of scope.
- The existing `SDD_PHASE_STATUS` broadcast interval is sufficient for reconciliation delivery; no new broadcast events or reduced intervals are needed.
- Clicking Reject on a gate that is behind reality (rather than Approve) follows the standard Reject path for the current gate only; bulk semantics apply to Approve only.

## Clarifications

### Session 2026-06-19

- Q: How is the "no changes needed" signal defined for auto-approve? → A: Extend the existing `signalContentMarker` mechanism — the agent outputs a specific recognizable marker phrase (e.g., `<!-- clarify:skip -->`) in its terminal response; no new tool call or backend mechanism required.
- Q: Is the auto-approve countdown timer client-side or server-side? → A: Client-side — countdown runs in the browser, continues through network drops, and queues the Approve action for delivery on reconnect; no server-side timer management needed.
- Q: What happens when the auto-approve Approve action fails (server error or session expired)? → A: Retry up to 3 times with short backoff; if all retries fail, revert to the standard gate card so the user can approve manually; failure MUST NOT cause a permanent stuck state.
