# Feature Specification: SDD Phase Orchestrator with In-Terminal HITL Decision Cards

**Feature Branch**: `003-sdd-phase-orchestrator`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "Build a Spec-Driven Development phase orchestrator for Forge Terminal. When I run Claude Code with gh-speckit inside Forge Terminal, it produces artifact files in a specs/NNN-feature-name/ directory at the end of each of the 5 SDD phases (Specify, Clarify, Plan, Validate, Implement). Right now I see nothing but a wall of terminal output and I blindly approve things because the output is too dense to process. I want a file watcher that detects when speckit phase artifacts are written and a HITL decision card that renders in the terminal TUI — no browser, no context switching — after each phase completes. The card shows only what I need to make a decision: what phase just completed, what was produced, any risks or gaps flagged, and a clear approve/reject/clarify choice. Approving advances to the next phase. Rejecting stops. Clarifying lets me add a prompt before the next phase runs. When a phase completes, the file watcher also fires a small HTTP POST to a locally running AzureWorkflowPOC service with the phase name and artifact path. That is the only external dependency. The user is ADHD. Decision cards must be scannable in under 10 seconds. No walls of text. Status, output summary, flags, and a single clear action — nothing else."

## Clarifications

### Session 2026-06-14

- Q: When the developer Approves a phase, how does the next phase start? → A: Auto-run — the orchestrator advances the pipeline by issuing the next phase's command into the active terminal session (reusing Forge's in-terminal command/macro mechanism); no manual typing.
- Q: Where do the card's output summary and flagged risks/gaps come from? → A: Derived deterministically from the phase's own artifacts (checklist pass/fail, unresolved `[NEEDS CLARIFICATION]` markers, analysis findings) — not from a separate generative summarization step.
- Q: Where does the decision card render? → A: As a panel/overlay within the Forge Terminal application UI, beside the active terminal session — no browser, no separate window.
- Q: How do the five named phases map to the speckit pipeline? → A: Exactly five gated phases; "Validate" corresponds to the analyze/consistency gate; the tasks step is folded into Plan→Implement and does not get its own decision card.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Approve or stop at a glance after each phase (Priority: P1)

A developer runs the Spec-Driven Development pipeline inside Forge Terminal. The terminal output during a phase is dense and unreadable. When a phase finishes and writes its artifacts, a compact decision card appears inside Forge Terminal summarizing what just happened: which phase completed, a short summary of what was produced, and any flagged risks or gaps. The developer reads the card in a few seconds and chooses **Approve** (continue to the next phase) or **Reject** (stop the pipeline). They never have to scroll back through raw output to decide.

**Why this priority**: This is the core problem. Today the developer approves blindly because the output is too dense to process, which defeats the purpose of human-in-the-loop review. A scannable card that replaces the wall of text with a decision-ready summary is the minimum viable product — on its own it stops blind approvals and delivers the whole value of the feature.

**Independent Test**: Run a single phase to completion so its artifact is written; verify a decision card appears within the Forge Terminal interface, shows the phase name and a non-empty output summary, and that choosing Approve advances the pipeline while choosing Reject halts it — with no browser window or external tab ever opened.

**Acceptance Scenarios**:

1. **Given** a phase is running and producing dense terminal output, **When** the phase finishes and writes its artifact(s) to the feature directory, **Then** a decision card appears inside Forge Terminal showing the completed phase, an output summary, and any flagged risks/gaps.
2. **Given** a decision card is displayed, **When** the developer chooses Approve, **Then** the pipeline advances to the next phase and the card is dismissed.
3. **Given** a decision card is displayed, **When** the developer chooses Reject, **Then** the pipeline stops, no further phase begins, and the card records that the pipeline was rejected at that phase.
4. **Given** a decision card is displayed, **When** the developer reads it, **Then** it contains only status, output summary, flags, and the action choices — with no raw phase log or wall of text.

---

### User Story 2 - Steer the next phase with a clarifying prompt (Priority: P2)

After reviewing a phase's decision card, the developer is not ready to reject outright but wants to adjust direction before the next phase runs. They choose **Clarify**, type a short prompt (for example, "narrow scope to the watcher only"), and confirm. The clarifying text is handed to the next phase as additional guidance, and the pipeline then advances with that steer applied.

**Why this priority**: Approve/Reject is binary; real review often needs a middle path that corrects course without throwing away progress. This makes the gate genuinely useful rather than a stop/go switch, but it builds on the P1 card and is not required for the MVP.

**Independent Test**: From a displayed decision card, choose Clarify, enter a prompt, and confirm; verify the next phase receives the entered text as additional input and that the pipeline advances rather than stops.

**Acceptance Scenarios**:

1. **Given** a decision card is displayed, **When** the developer chooses Clarify, **Then** they are prompted for a short free-text steer before any next phase begins.
2. **Given** the developer has entered clarifying text, **When** they confirm, **Then** the next phase runs with that text supplied as additional guidance.
3. **Given** the developer chooses Clarify but cancels without entering text, **Then** the pipeline remains paused on the same card with no phase advanced.

---

### User Story 3 - Notify the local automation service on phase completion (Priority: P3)

Each time a phase completes, a small notification is sent to a locally running AzureWorkflowPOC service carrying the phase name and the artifact path, so external local automation can react to pipeline progress. This happens in the background and never gets in the developer's way.

**Why this priority**: This is an integration nicety for downstream local automation, valuable but orthogonal to the developer's in-terminal decision experience. The decision card must work whether or not this service is running.

**Independent Test**: With the local service running, complete a phase and verify it receives one notification containing the phase name and artifact path; with the service stopped, complete a phase and verify the decision card still appears and the pipeline is unaffected.

**Acceptance Scenarios**:

1. **Given** the local AzureWorkflowPOC service is running, **When** a phase completes, **Then** exactly one notification is sent containing the completed phase's name and the artifact path.
2. **Given** the local service is unreachable or returns an error, **When** a phase completes, **Then** the decision card still appears, the pipeline is not blocked, and the failed notification is recorded without interrupting the developer.

---

### Edge Cases

- **Partial / multi-file writes**: A phase may write several files or rewrite a file mid-phase. The orchestrator must treat a phase as complete only once, after writes have settled — not fire a card per file or mid-write.
- **Phase produces no artifact or fails**: If a phase ends without producing its expected artifact (error, crash, or empty output), the card must surface that as a flagged gap rather than silently advancing.
- **Reject mid-pipeline**: After a Reject, re-running or resuming the pipeline must not auto-advance past the rejected phase without a fresh decision.
- **External service down**: AzureWorkflowPOC being unreachable must never block, delay perceptibly, or hide the decision card (see US3).
- **Rapid successive phases**: If two phases complete in quick succession, each must get its own card in order; a later phase must not begin until the earlier card is resolved.
- **Scannability under load**: A phase that flags many risks must still present a card that stays scannable — the card summarizes/counts flags rather than dumping them all as a wall of text.
- **Stale / unrelated file changes**: Edits to files in the feature directory that are not phase artifacts (e.g., an editor swap file) must not trigger a decision card.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect when a Spec-Driven Development phase has completed by observing artifact files written under the active feature directory (`specs/NNN-feature-name/`).
- **FR-002**: System MUST treat a phase as complete exactly once per phase, after file writes have settled, so partial or multi-file writes do not produce duplicate or premature notifications.
- **FR-003**: System MUST recognize exactly five gated pipeline phases in order — Specify, Clarify, Plan, Validate, Implement — and associate each completion with the phase that produced it, where "Validate" corresponds to the analyze/consistency gate and the intermediate tasks step is folded into Plan→Implement without its own decision card.
- **FR-004**: Upon phase completion, System MUST present a decision card as a panel/overlay within the Forge Terminal application UI, beside the active terminal session, without opening a browser, external window, or separate application.
- **FR-005**: The decision card MUST contain only: the completed phase (status), a short summary of what was produced, any flagged risks or gaps, and the available actions — and MUST NOT include the raw phase log or unbounded text.
- **FR-006**: The decision card MUST offer exactly three actions: Approve, Reject, and Clarify.
- **FR-007**: Users MUST be able to choose Approve to advance the pipeline to the next phase; on Approve, System MUST advance automatically by issuing the next phase's command into the active terminal session, without the developer typing it.
- **FR-008**: Users MUST be able to choose Reject to stop the pipeline so that no subsequent phase begins.
- **FR-009**: Users MUST be able to choose Clarify to supply a short free-text steer that is provided as additional guidance to the next phase before it runs.
- **FR-010**: System MUST pause the pipeline at each phase boundary and advance only in response to an explicit Approve or Clarify decision — never automatically.
- **FR-011**: When a phase completes, System MUST send a single notification to the locally configured AzureWorkflowPOC service containing the phase name and the artifact path.
- **FR-012**: System MUST treat the AzureWorkflowPOC notification as best-effort: a failure or unreachable service MUST NOT block, delay perceptibly, or suppress the decision card or pipeline.
- **FR-013**: System MUST surface a phase that produced no expected artifact (or otherwise failed) as a flagged gap on the card rather than advancing silently.
- **FR-014**: System MUST process phase completions in order, presenting one unresolved decision card at a time and not beginning the next phase until the current card is resolved.
- **FR-015**: System MUST record each decision (which phase, which action, and any clarifying text) so the pipeline's review history is auditable.
- **FR-016**: System MUST ignore changes to files in the feature directory that are not recognized phase artifacts, so noise does not trigger decision cards.
- **FR-017**: System MUST derive the card's output summary and flagged risks/gaps deterministically from the completed phase's own artifacts (for example: checklist pass/fail counts, unresolved `[NEEDS CLARIFICATION]` markers, and analysis findings), rather than from a separate generative summarization step.
- **FR-018**: When the developer chooses Clarify, System MUST supply the entered steer as additional guidance carried into the next phase's command when it advances the pipeline (consistent with FR-007's automatic advancement).

### Key Entities *(include if feature involves data)*

- **Phase**: One stage of the Spec-Driven Development pipeline (Specify, Clarify, Plan, Validate, Implement). Has a name, an order position, and an expected artifact.
- **Phase Artifact**: The file(s) a phase writes under the feature directory that signal its completion (e.g., the specification, the plan). Has a path and an owning phase.
- **Decision Card**: The compact, in-terminal review surface shown after a phase. Holds the phase status, an output summary, a set of flagged risks/gaps, and the three available actions.
- **Decision**: The developer's response to a card — Approve, Reject, or Clarify — optionally carrying clarifying text. Tied to a phase and timestamped for the review history.
- **Notification Event**: The best-effort message sent to AzureWorkflowPOC on phase completion, carrying the phase name and artifact path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can read a decision card and reach an Approve/Reject/Clarify decision in under 10 seconds without scrolling back through terminal output.
- **SC-002**: 100% of completed phases present exactly one decision card, and the pipeline never advances past a phase without an explicit decision.
- **SC-003**: Developers report that decisions are made based on the card's summary and flags rather than blind approval, on at least 9 of 10 phase reviews.
- **SC-004**: When the AzureWorkflowPOC service is unavailable, 100% of decision cards still appear and no pipeline run is blocked by the missing service.
- **SC-005**: Every flagged gap (a phase that produced no artifact or failed) is shown to the developer rather than silently skipped, in 100% of such cases.
- **SC-006**: The review experience requires zero context switches outside Forge Terminal — no browser or external window is opened at any point in the pipeline.

## Assumptions

- **Phase model** *(resolved — see Clarifications)*: Exactly five gated phases (Specify, Clarify, Plan, Validate, Implement); "Validate" is the analyze/consistency gate, and the intermediate tasks step is folded into Plan→Implement with no card. The specific artifact filename(s) that signal each phase's completion are a planning detail.
- **"Advance to the next phase"** *(resolved — see Clarifications)*: Approving (or confirming a Clarify) advances automatically by issuing the next phase's command into the active terminal session via Forge Terminal's existing in-terminal command/macro mechanism. The orchestrator is therefore an active controller, not a passive viewer.
- **Card rendering surface** *(resolved — see Clarifications)*: The card renders as a panel/overlay within the Forge Terminal application UI, adjacent to the active terminal session — no browser tab or external app. Literal ANSI-in-buffer rendering is explicitly not required.
- **Card content source** *(resolved — see Clarifications)*: The summary and flags are derived deterministically from the phase's artifacts (checklists, unresolved clarification markers, analysis findings); no separate generative summarization call is assumed.
- **Single active pipeline**: One feature pipeline is in flight at a time for v1; concurrent multi-feature orchestration is out of scope for the initial version.
- **AzureWorkflowPOC**: The notification target is a locally running service whose endpoint is configurable; it is the only external dependency, and the feature degrades gracefully (best-effort) when it is absent.
- **Completion detection**: A phase is considered complete when its expected terminal artifact appears and file writes settle (a brief quiet period), not on the first byte written.
- **Scope boundary**: The orchestrator observes and gates the pipeline and summarizes artifacts; it does not itself generate the spec/plan/tasks content — that remains the work of the underlying speckit phases.
