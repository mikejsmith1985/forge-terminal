# Feature Specification: SDD Authoritative State & Concise Phase Reports

**Feature Branch**: `feature/010-sdd-authoritative-state`

**Created**: 2026-06-21

**Status**: Draft

**Input**: User description: "The SDD phase bar shows wrong/stale state and conflates multiple concurrent sessions because phase state is inferred from a file watcher + terminal-quiet heuristics + disk reconciliation rather than reported authoritatively. Drive phase transitions from the authoritative Skill hook, give each tab a reliable identity so concurrent pipelines never conflate, scope the gate so one session never pollutes another, and replace the wall-of-markdown gate document with a concise phase report card (files touched, scope, decisions) — keeping the full speckit output as opt-in documentation."

---

## Problem Statement

The SDD phase dashboard has shipped across more than ten releases and has never reliably shown the truth. The phase bar (Specify → Clarify → Plan → Tasks → Validate → Implement) routinely displays the wrong phase, shows a completed phase as still running, and — when more than one pipeline runs at once — mixes the state of unrelated sessions together. The developer cannot trust what the bar says.

The root cause is that phase state is **inferred** by observing side-effects — watching files appear, watching the terminal fall quiet, and reconciling against disk — instead of being **reported** by the one component that already knows the exact phase: the agent's own phase-command invocation. Observation from the outside is inherently racy, so the displayed state drifts from reality. Compounding this, there is no reliable per-session identity, so the gate check and dashboard cannot tell which pipeline a signal belongs to and fall back to global, first-match behaviour.

A secondary failure is presentation: between phases the developer is shown a wall of verbose Markdown rather than a scannable summary of what actually changed. The developer stops reading after roughly 100 words, so the gate document is effectively ignored.

This feature makes the dashboard authoritative, correctly scoped per session, and concise.

---

## Clarifications

### Session 2026-06-21

- Q: Where does the report card's "decisions made" content come from? → A: Each phase command explicitly emits its own short decisions list as part of the authoritative completion signal; phases with no decisions emit an empty list and the card omits that group.
- Q: What is the developer experience when per-tab identity injection fails (the highest-risk case)? → A: Degrade gracefully — dashboard shows an "unbound — SDD inactive" indicator, terminal works normally, gate enforcement disabled for that tab only; never block the tab or fall back to a global pipeline.
- Q: What baseline defines "files touched" for the report card? → A: Snapshot captured at phase start; report only changes within that phase's execution window. Pre-existing uncommitted changes are not attributed to the phase.
- Q: How should the existing inference engine be migrated? → A: Retrofit in place — keep the existing orchestrator state machine and disk reconciliation, redirect its trigger from the file-watcher to the authoritative signal, and demote the watcher to fallback. No parallel rewrite.
- Q: How do the artifact-less phases (Validate, Implement) get an authoritative signal? → A: They emit explicit start/complete signals at their own skill-invocation boundaries, same as all other phases; quiet-detection is demoted to fallback for them too. No phase relies on quiet-detection as its primary signal.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Phase Bar Always Shows the True Phase (Priority: P1)

A developer runs an SDD pipeline. At every moment, the phase bar for that session shows exactly which phase has just completed and which decision is awaited — never a stale or guessed state. When a phase command finishes, the bar reflects it immediately and correctly, because the completion was reported by the phase command itself, not inferred from file changes.

**Why this priority**: This is the core promise that has failed every release. Without a trustworthy bar, nothing else matters.

**Independent Test**: Run a phase command end-to-end. Confirm the bar advances to exactly the right phase the moment the command completes, with no transient wrong state and no dependence on the terminal falling quiet.

**Acceptance Scenarios**:

1. **Given** a developer completes the Specify phase, **When** the phase command finishes, **Then** the bar shows Specify as awaiting decision (not Clarify, not "running"), driven by the authoritative completion signal.
2. **Given** the Clarify phase edits the same artifact file multiple times, **When** those edits occur, **Then** the bar does not flip between phases — the displayed phase changes only when an authoritative phase-completion signal is received.
3. **Given** the authoritative signal is somehow missed, **When** the next status refresh occurs, **Then** disk-based reconciliation acts as a fallback so the bar still converges to the correct phase rather than staying permanently wrong.
4. **Given** a phase command is mid-execution, **When** the developer views the bar, **Then** that phase shows as "running" and no false "complete" state appears until the authoritative completion signal arrives.

---

### User Story 2 — Concurrent Pipelines Never Conflate (Priority: P1)

A developer has two (or more) terminal tabs open, each running an independent SDD pipeline in a different repository. Each tab's phase bar shows only its own pipeline's state. A gate opening in one tab never blocks or alters the other tab, and the two bars can show different phases simultaneously without interference.

**Why this priority**: The user explicitly runs true concurrent pipelines. Cross-session conflation is the most visible current defect and makes the feature unusable for their workflow.

**Independent Test**: Open two tabs in two different repos. Drive each to a different phase. Confirm each bar shows its own correct phase, and that opening a gate in tab A leaves tab B fully operational.

**Acceptance Scenarios**:

1. **Given** tab A is awaiting a decision on Plan and tab B is running Tasks, **When** the developer views each bar, **Then** each shows its own phase with no bleed-through from the other.
2. **Given** a gate is open in tab A, **When** the developer acts in tab B, **Then** tab B is not blocked by tab A's open gate — the gate check is scoped to the originating session.
3. **Given** two pipelines are active, **When** a decision is approved in tab A, **Then** only tab A's pipeline advances; tab B is unaffected.
4. **Given** the developer closes tab A, **When** tab B continues, **Then** tab B's state and gate behaviour remain correct and unaffected by the closure.

---

### User Story 3 — Concise Phase Report Instead of a Wall of Text (Priority: P2)

When a phase completes, the developer is shown a short, scannable report card describing what that phase delivered: which files were touched (with how much changed), the scope of the change, and the decisions made. The card is brief enough to read at a glance. The full verbose phase output is not forced on the developer — it is available on demand if they choose to open it.

**Why this priority**: The developer stops reading after ~100 words. A concise card is the difference between the gate being used and being ignored. It depends on US1/US2 being correct first, hence P2.

**Independent Test**: Complete a phase. Confirm the gate presents a concise grouped-bullet card (files touched with change counts, scope, decisions) rather than a wall of Markdown, and that the full output is reachable through an explicit opt-in action.

**Acceptance Scenarios**:

1. **Given** a phase completes, **When** the gate card appears, **Then** it shows grouped, scannable bullets covering files touched (with per-file change magnitude), scope of changes, and decisions made.
2. **Given** the report card is displayed, **When** the developer reads it, **Then** the essential content fits within roughly 100 words and does not require scrolling through verbose prose.
3. **Given** the developer wants the full detail, **When** they choose the opt-in "view full output" action, **Then** the complete verbose phase documentation is shown, sourced from the phase artifact.
4. **Given** a phase touched no files (e.g., a no-op validation), **When** the card appears, **Then** it clearly states that no files changed rather than showing an empty or broken card.
5. **Given** the standard phase skills remain installed, **When** a phase runs, **Then** their full Markdown output is preserved as opt-in documentation and is not presented as the default gate document.

---

### Edge Cases

- What happens if the authoritative phase-completion signal cannot be delivered (the reporting channel is unreachable)? The system must fail safe — fall back to disk reconciliation for state, and keep the gate closed/blocking rather than silently advancing.
- What happens if a session has no reliable identity (identity injection failed for that tab)? The tab degrades gracefully: the dashboard shows a clearly-marked "unbound — SDD inactive" indicator, normal terminal work continues unaffected, and gate enforcement is disabled for that tab only. The pipeline must never borrow or pollute another session's state, and the broken-identity condition is visible rather than silent.
- What happens if two tabs are opened in the *same* repository? Each tab is still a distinct session with its own identity and its own pipeline state; they do not share a gate.
- What happens if the file-change magnitude cannot be computed for the report card (e.g., no baseline to diff against)? The card still lists the touched files and notes that change magnitude is unavailable, rather than omitting the files.
- What happens if a phase is re-run after a rejection? The report card reflects the most recent run, and the run count is visible so the developer knows this is an iteration.
- What happens to an in-flight gate when the backend restarts? On reconnect, each session's gate state is restored for its own identity, with no cross-session leakage.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST derive each phase's running/complete/awaiting state from an authoritative phase-completion signal emitted by the phase command itself, not from inference over file changes or terminal quiet periods.
- **FR-001b**: ALL phases MUST emit authoritative start/complete signals at their own command-invocation boundaries — including the artifact-less phases (Validate and Implement). No phase may depend on terminal-quiet detection as its primary completion signal; quiet-detection is retained only as a fallback alongside disk reconciliation.
- **FR-002**: Disk-based reconciliation MUST remain available as a fallback so that a missed authoritative signal converges to the correct state rather than leaving the bar permanently wrong; it MUST NOT be the primary driver.
- **FR-003**: Each terminal session MUST have a stable, unique identity that is reliably associated with its pipeline, so that all phase signals, gate checks, and dashboard updates are attributable to exactly one session.
- **FR-004**: The system MUST support multiple concurrent pipelines, each scoped to its own session identity, with no shared or global state that allows one pipeline's signals to affect another.
- **FR-005**: The gate check that blocks the agent MUST evaluate only the gate state of the requesting session's pipeline, never returning another session's open gate.
- **FR-006**: Dashboard updates MUST be delivered only to the session they belong to; a client MUST ignore or never receive updates intended for a different session.
- **FR-007**: When a phase completes, the system MUST present a concise report card summarising files touched (with per-file change magnitude), the scope of the changes, and the decisions made, grouped as scannable bullets.
- **FR-007a**: The "decisions made" content on the report card MUST come from a short decisions list emitted explicitly by the phase command as part of its authoritative completion signal — not inferred from artifact contents. A phase with no decisions emits an empty list, and the card omits the decisions group for that phase.
- **FR-008**: The essential content of the report card MUST be brief — targeting roughly 100 words or fewer — so it can be read at a glance without scrolling through verbose prose.
- **FR-009**: The full phase artifact (the generated specification, plan, or tasks file the phase produced) MUST be reachable via an explicit opt-in action and MUST NOT be the default content presented at the gate. The verbose skill narration is not separately persisted — the artifact file is the canonical full record that the opt-in action opens.
- **FR-010**: The standard phase skills MUST remain installed and functional, with their normal behaviour unaffected by the addition of the authoritative-signal emit step; their full output is preserved in the phase artifact files (the canonical record), reachable on demand, rather than shown as the default gate document.
- **FR-011**: When a session lacks a reliable identity, the system MUST treat its pipeline as unbound and MUST NOT attribute its signals to, or borrow state from, any other session.
- **FR-011a**: An unbound session MUST degrade gracefully: the dashboard displays a clearly-marked "unbound — SDD inactive" indicator, normal terminal use continues without disruption, and gate enforcement is disabled for that tab only (it does not block the agent or fall back to a global pipeline).
- **FR-012**: On backend restart or client reconnect, each session's gate and phase state MUST be restored for its own identity only, with no cross-session leakage.
- **FR-013**: If the report card cannot compute change magnitude for a touched file, it MUST still list the file and indicate the magnitude is unavailable rather than omitting it.
- **FR-014**: "Files touched" MUST be scoped to changes that occur within the phase's execution window, computed against a baseline snapshot captured at phase start. Pre-existing uncommitted changes present before the phase began MUST NOT be attributed to that phase.

### Key Entities

- **Pipeline**: An independent SDD run scoped to a single session, holding the current phase, status, and pending gate. One per active session.
- **Session Identity**: A stable unique identifier associating a terminal tab with exactly one pipeline; the key that scopes all signals, gate checks, and dashboard updates.
- **Authoritative Phase Signal**: A completion (and start) event emitted by the phase command itself, naming the exact phase — the primary driver of dashboard state.
- **Disk Reconciliation**: A fallback that derives phase completion from the presence of artifact files, used only to recover from missed authoritative signals.
- **Phase Report Card**: The concise, scannable summary shown at the gate — files touched with change magnitude, scope, and decisions — replacing the verbose document as the default surface.
- **Full Phase Documentation**: The complete verbose phase output, preserved with the phase artifacts and reachable through an explicit opt-in action.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across 10 consecutive pipeline runs, the phase bar shows the correct phase for the session at every transition, with zero observed instances of a stale, wrong, or guessed phase.
- **SC-002**: With two or more concurrent pipelines active, zero instances of cross-session conflation occur — each bar reflects only its own session — measured across at least 10 concurrent-run scenarios.
- **SC-003**: An open gate in one session never blocks the agent in another session, verified across all concurrent-session test scenarios.
- **SC-004**: The displayed phase reflects an authoritative completion within 2 seconds of the phase command finishing, without relying on the terminal becoming quiet.
- **SC-005**: The phase report card's essential content fits within roughly 100 words and is presented as grouped bullets covering files, scope, and decisions, in 100% of completed phases.
- **SC-006**: The full verbose phase output is reachable via an explicit opt-in action in 100% of phases and is never the default content shown at the gate.
- **SC-007**: After a backend restart with an open gate, each session's gate is restored for its own identity with zero cross-session leakage, across all restart scenarios tested.

---

## Assumptions

- The agent's phase-command invocations can emit an authoritative start/complete signal that names the exact phase; this signal is reliable enough to be the primary state driver, with disk reconciliation only as a safety net.
- Each terminal tab can be given a stable unique identity that the phase signal, gate check, and dashboard can all reference; establishing this identity reliably on the desktop terminal is the highest-risk part of the work and is treated as such in planning.
- Files touched and their change magnitude during a phase can be determined from the repository's own change history relative to a baseline captured at phase start.
- The standard phase skills' verbose output is acceptable to retain as opt-in documentation; the goal is to change what is *presented by default*, not to remove the skills.
- Only the default gate presentation changes; the underlying phase artifacts (the specification, plan, and task files) remain the canonical record and are unaffected.
- "Roughly 100 words" is a presentation target for scannability, not a hard truncation that would drop essential file/scope/decision information.
- Manual terminal input (a developer typing phase commands directly) is out of scope for authoritative signalling, consistent with prior gate-enforcement scope — only agent-initiated phase invocations emit the signal.
- The existing orchestrator state machine and disk-reconciliation logic are retained and retrofitted in place: only the trigger source changes (from file-watcher inference to the authoritative signal), with the watcher demoted to a fallback. No parallel state machine is introduced, to minimise the risk of two systems diverging.
