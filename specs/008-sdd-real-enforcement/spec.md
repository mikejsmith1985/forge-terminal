# Feature Specification: SDD Real Enforcement

**Feature Branch**: `feature/008-sdd-real-enforcement`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "SDD process enforcement — the HITL gate system, phase dashboards, and speckit pipeline must be genuinely enforced, not cosmetic. The agent must be blocked from proceeding to the next phase without explicit human approval via the gate. This includes: real gate enforcement (not advisory), working phase dashboard that reflects true state, and the broken updater reconnection bug where the app loses connection after every release and cannot reconnect automatically."

---

## Problem Statement

The SDD gate system has been shipped across five releases without delivering its core promise: that the developer controls when each pipeline phase runs. The current implementation is observational — gates appear *after* artifacts are produced, not *before* the agent acts. This means:

- The agent runs the next speckit command whether a gate is open or not
- The dashboard reflects orchestrator-driven state, not disk reality
- "Approving" a gate that already completed is meaningless
- After every update the app loses its WebSocket connection permanently

This spec defines the minimum changes to make the gates real and the dashboard truthful.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Gate Blocks the Agent (Priority: P1)

A developer runs `/speckit-specify`. The agent produces `spec.md`. A gate card appears on the dashboard. The developer has NOT approved yet. If the agent attempts to run `/speckit-plan`, it is physically stopped — the gate is not open. Only after the developer clicks Approve does the next phase run.

**Why this priority**: This is the entire point of the SDD system. Without this, everything else is cosmetic.

**Independent Test**: Open a gate card (trigger any speckit phase that produces an artifact). Without clicking Approve, observe whether the agent is able to begin the next phase. Pass = agent stops and tells the user to approve the gate. Fail = agent proceeds regardless.

**Acceptance Scenarios**:

1. **Given** a gate card is open for the Specify phase, **When** the agent internally attempts to invoke `/speckit-plan`, **Then** the attempt is intercepted before it executes, the agent outputs a message explaining the gate is open and awaiting approval, and no plan.md is produced.
2. **Given** a gate card is open, **When** the developer clicks Approve on the dashboard, **Then** the gate closes, the orchestrator injects the next phase command, and the agent proceeds normally.
3. **Given** no gate is open (pipeline is idle or complete), **When** the agent invokes any speckit phase, **Then** no interception occurs — normal execution proceeds.
4. **Given** a gate is open, **When** the developer clicks Reject, **Then** the pipeline halts, no next command is injected, and the dashboard shows Rejected status.
5. **Given** a gate is open, **When** the developer clicks Clarify with steering text, **Then** the gate closes, the next command is injected with the steering text appended, and the pipeline advances.

---

### User Story 2 — Dashboard Reflects Disk Reality (Priority: P2)

At any point the developer opens the SDD dashboard. The phase statuses shown match what files actually exist on disk — not what the orchestrator believes from event history. If `plan.md` exists on disk but the orchestrator missed the event, the dashboard still shows Plan as complete.

**Why this priority**: The dashboard has been "done" across three specs but has never shown reliable state because its data source (orchestrator events) can diverge from disk truth. This user story makes disk the source of truth.

**Independent Test**: Start a session, manually copy `spec.md` and `plan.md` into a feature directory without going through the gate flow. Open the dashboard. Pass = Specify and Plan show as complete. Fail = dashboard shows them as pending or unknown.

**Acceptance Scenarios**:

1. **Given** `spec.md` exists on disk but the orchestrator has no record of it, **When** the dashboard is viewed, **Then** the Specify phase shows complete.
2. **Given** `plan.md` and `tasks.md` exist on disk, **When** the dashboard is viewed, **Then** Plan and Tasks both show complete regardless of orchestrator history.
3. **Given** the orchestrator shows Specify complete but `spec.md` was deleted, **When** the dashboard is viewed, **Then** Specify shows incomplete (disk is authoritative in both directions).
4. **Given** a pipeline is running normally through gates, **When** the dashboard is viewed at any point, **Then** the displayed state matches the artifact files actually present — no divergence is possible.

---

### User Story 3 — App Reconnects After Update (Priority: P3)

A developer is using Forge Terminal. An update is released. The app updates and the new binary starts. The developer's terminal session reconnects automatically within 10 seconds — no manual download, no manual restart.

**Why this priority**: Every release has required the user to manually recover from a broken update. This is a reliability regression on every ship.

**Independent Test**: Trigger an in-place update while a terminal session is open. Measure time until WebSocket reconnects and terminal responds to input again. Pass = reconnects within 10 seconds with no user action. Fail = connection permanently lost, requires manual intervention.

**Acceptance Scenarios**:

1. **Given** the app is running with an open terminal session, **When** an update is applied and the new binary starts, **Then** the frontend reconnects to the new backend process within 10 seconds.
2. **Given** the WebSocket connection drops for any reason (update, crash, network blip), **When** reconnection is attempted, **Then** the frontend retries with exponential backoff (max 10 seconds between attempts) until the backend responds.
3. **Given** reconnection succeeds after an update, **When** the developer interacts with the terminal, **Then** the session responds normally — no stale state or ghost sessions.
4. **Given** reconnection has failed for 60 seconds, **When** the user is still waiting, **Then** a visible indicator shows the connection is lost and a manual reconnect button is available.

---

### Edge Cases

- What happens if the gate API is unreachable when the hook calls it? The agent must fail safe: assume the gate is OPEN (blocked) and tell the user to check the dashboard, not proceed blindly.
- What happens if a gate is approved while the agent is already mid-execution (race condition)? The orchestrator must be idempotent — double-approval does not inject a duplicate command.
- What happens if the developer manually runs a speckit command in the terminal without going through the agent? The gate check hook only fires for agent-initiated Skill invocations; manual terminal input is not intercepted (out of scope).
- What happens if `spec.md` is deleted mid-session? The dashboard reconciliation detects this on the next broadcast and shows the phase as incomplete.
- What happens if the backend process crashes (not just updates)? The same WebSocket reconnect loop handles this — the updater case is not special.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST prevent the agent from invoking any speckit phase Skill while a gate for the preceding phase is open and awaiting the developer's decision.
- **FR-002**: The enforcement check MUST fire before the Skill executes, not after the artifact is produced.
- **FR-003**: When the enforcement check blocks the agent, the agent MUST output a clear message to the developer naming the open gate and instructing them to approve, reject, or clarify before the next phase can run.
- **FR-004**: When the developer approves a gate, the orchestrator MUST inject the next phase command so the agent does not need to be re-prompted manually.
- **FR-005**: The phase dashboard MUST derive each phase's completion status by checking whether the expected artifact file exists on disk, not from in-memory event history alone.
- **FR-006**: Dashboard state MUST be re-derived from disk on every status broadcast cycle, so missed events never cause permanent drift.
- **FR-007**: The frontend WebSocket client MUST automatically attempt reconnection when the connection drops, with exponential backoff, without any user action required.
- **FR-008**: Reconnection MUST succeed within 10 seconds when the backend is available.
- **FR-009**: When reconnection fails for longer than 60 seconds, the UI MUST show a visible disconnected indicator and a manual reconnect button.
- **FR-010**: Gate enforcement and dashboard truth MUST both work in the same session — enforcement prevents bypass, dashboard confirms what was actually completed.

### Key Entities

- **Gate**: A decision point opened after a phase artifact is detected. States: open (blocking), approved, rejected, clarified. One gate open at a time.
- **Phase Artifact**: A file on disk (e.g. `spec.md`, `plan.md`) whose existence proves a phase completed. The canonical completion signal.
- **Enforcement Hook**: A pre-execution check wired into the agent's tool-invocation path. Calls the gate API; blocks if gate is open.
- **Reconnect Loop**: A client-side WebSocket reconnection mechanism with exponential backoff, started immediately on connection loss.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero instances of the agent advancing past an open gate without human approval — measured across 10 consecutive speckit pipeline runs.
- **SC-002**: Dashboard phase statuses match the actual files on disk within one broadcast cycle (≤ 2 seconds) in 100% of test scenarios where artifacts are added or removed.
- **SC-003**: After an app update, the terminal session reconnects without user action in under 10 seconds in all update scenarios tested.
- **SC-004**: Developers do not need to manually download or restart the app following any routine update — zero manual recovery actions required.
- **SC-005**: The gate flow (specify → approve → plan → approve → tasks → approve → ...) completes end-to-end without the agent bypassing any gate, across five consecutive pipeline runs driven by the Playwright test suite.

---

## Assumptions

- The Claude Code hook system (`PreToolUse`) can be used to intercept Skill invocations before they execute; this is the enforcement point for FR-001.
- The gate enforcement hook communicates with Forge Terminal via a local HTTP call to an existing or new gate-state endpoint; no new authentication is required since it is localhost-only.
- Disk-based reconciliation (FR-005, FR-006) reads only artifact existence (`os.Stat`), not artifact content, keeping it sub-millisecond.
- The WebSocket reconnection loop (FR-007) is implemented in the existing frontend WebSocket client; no new library is needed.
- The updater already restarts the backend process; the frontend just needs to reconnect to it rather than assuming the connection is permanent.
- Manual terminal input (developer typing speckit commands directly) is out of scope for gate enforcement — only agent-initiated Skill invocations are intercepted.
- A gate that is open for phase N blocks phases N+1 through N+6; it does not block unrelated non-speckit work in the terminal.
