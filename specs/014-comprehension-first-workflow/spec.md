# Feature Specification: Comprehension-First Workflow

**Feature Branch**: `feature/014-comprehension-first-workflow`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "I need a better way to work than what I'm doing right now. I essentially give you a command, agree with everything you recommend, and then test it to see if it's what I like or not. This is not a scalable approach as I begin applying for real AI Development jobs. I need a way to force myself to look at the code and understand it. I have no interest in reading code though. I don't want to look at walls of text. I need something to look at that engages sort of like a comic book or a billboard — bright colors, big fonts that are simple to read and don't immediately trigger my ADHD brain to say that's too much to read, just agree and move on. I need there to be proper global implementation and enforcement of the way that Claude works. We had built some of this and then I think Claude just moved it into its own Claude folder, but I get walls of text as responses all the time. I don't want that. I want graphs and charts, tables with icons etc. — just the important information, the info that will make me ask the right questions to actually develop understanding, or the minimum details will suffice already because I DO understand it. How can we make sure that Forge Terminal properly enforces this style of work? I would like to ensure that the code that gets created by my projects from this point forward is written in a way that helps the code read like English. So not 'increment n times' — n needs to be a value that when I read it I have context to what I may actually see if I was looking at the UI."

---

## Problem

The developer's current loop is: issue a command, accept the agent's recommendation, then test the result to find out whether it was right. Understanding is never established — only outcome is checked. This does not scale to professional work, where being able to explain a change matters as much as shipping it.

Three things block understanding today, and they are separate problems that look like one:

1. **Nothing forces a look at the change.** Approval is the default and costs nothing. There is no moment in the loop where comprehension is required before proceeding.
2. **The agent's output defeats the reader.** A wall of prose triggers avoidance rather than attention, so even a correct explanation goes unread. A response-format rule exists but is *advisory*: it is re-injected as a reminder each turn and can be ignored without consequence. Nothing detects or blocks a violation.
3. **The code itself does not read like English.** Names like `n` carry no connection to what appears on screen, so reading the code cannot build understanding even when the reader tries.

A prior specification, `specs/012-compact-visual-style/`, described the response-format half of this and was never planned or implemented. What shipped instead was an advisory reminder hook outside this repository. This feature supersedes it.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A change cannot be accepted without being seen (Priority: P1)

The developer asks for a change. When the work is done, the agent does not present a prose summary and a request to proceed. It presents a **visual change brief**: a small number of large, high-contrast panels showing what changed, why, and what could break — sized to be read in under a minute, not scrolled.

**Why this priority**: This is the whole point. Without a moment that requires looking, every other improvement is decoration on a loop that still ends in reflexive agreement.

**Independent Test**: Complete any code change. Verify a visual change brief is produced without being asked for, and that it is legible at a glance rather than requiring reading.

**Acceptance Scenarios**:

1. **Given** a completed code change, **When** the agent reports it, **Then** a visual change brief is produced automatically
2. **Given** a change brief, **When** the developer views it, **Then** no panel requires scrolling to read, and body text is large enough to read from normal seating distance
3. **Given** a change touching several files, **When** the brief is produced, **Then** it names the one or two decisions that mattered rather than listing every file
4. **Given** a change with a risk or an assumption, **When** the brief is produced, **Then** that risk is a distinct, visually prominent panel rather than a sentence inside a paragraph

---

### User Story 2 — The brief provokes a question rather than an answer (Priority: P1)

The change brief does not only report. It surfaces the specific decision points where a reasonable alternative existed, phrased so the developer can interrogate the choice. Where the developer already understands an area, the brief stays minimal and does not belabour it.

**Why this priority**: The stated goal is "the info that will make me ask the right questions." A brief that only reports produces nodding; a brief that exposes a fork produces a question. This is what converts review into understanding.

**Independent Test**: Make a change involving a genuine trade-off. Verify the brief names the alternative that was not taken and why.

**Acceptance Scenarios**:

1. **Given** a change where an alternative approach was viable, **When** the brief is produced, **Then** it names the alternative and the reason it was rejected
2. **Given** a change that is mechanical with no real decision, **When** the brief is produced, **Then** it says so briefly rather than manufacturing significance
3. **Given** a brief, **When** the developer reads it, **Then** each decision panel ends in something answerable — a question or an explicit assumption — not a closed statement

---

### User Story 3 — The response format is enforced, not merely requested (Priority: P1)

The visual response style — emoji-prefixed section headers, dividers, tables for comparative content, bullets, and a hard cap of roughly 75 words per section — is applied to every response. A violation is **detected and reported**, rather than depending on the agent's willingness to comply.

**Why this priority**: The rule already exists and is already broken regularly. The developer's own description — "I get walls of text as responses all the time" — is the evidence. An advisory rule that is violated is worse than no rule, because it creates the belief that the problem is handled.

**Independent Test**: Produce a response containing a section well over the word cap and no section header. Verify the violation is detected rather than passing silently.

**Acceptance Scenarios**:

1. **Given** any response, **When** it contains a section exceeding the word cap, **Then** the violation is detected and surfaced
2. **Given** any response, **When** it lacks emoji section headers or dividers, **Then** the violation is detected and surfaced
3. **Given** comparative content — two options, a before/after, a set of results — **When** the response is produced, **Then** it is rendered as a table
4. **Given** the enforcement mechanism, **When** the developer starts a session in any project, **Then** it applies without per-project setup

---

### User Story 4 — Code is named so it reads like English (Priority: P2)

New code names values after what the reader would recognise on screen or in the domain, not after their mechanical role. A counter over search results is not `n`; it is the thing a person would point at in the interface. Violations are caught before the code is committed, not noticed later during reading.

**Why this priority**: This is the durable half. A brief helps the developer understand one change; readable code makes every future reading cheaper. It is P2 only because a brief delivers value immediately, whereas naming compounds over time.

**Independent Test**: Introduce a single-letter or role-named variable outside the permitted loop-iterator cases. Verify it is rejected before the commit completes.

**Acceptance Scenarios**:

1. **Given** new code containing a single-letter variable outside a permitted case, **When** the change is committed, **Then** the commit is refused with the offending name identified
2. **Given** a boolean not prefixed with `is`/`has`/`can`/`should`/`was`, **When** the change is committed, **Then** the commit is refused
3. **Given** a function whose name is not verb-first, **When** the change is committed, **Then** the commit is refused
4. **Given** a name that satisfies every mechanical rule but still carries no domain meaning, **When** the change is reviewed, **Then** the change brief surfaces it for a human judgement rather than passing it silently

---

### Edge Cases

- **A trivial change.** A one-line typo fix should not produce a full brief. The brief scales down to a single panel rather than manufacturing content.
- **A very large change.** A brief that would exceed a screen must summarise to the few decisions that mattered rather than growing without limit.
- **The developer already understands the area.** The brief must be capable of being minimal on request, and must not repeat context already established in the session.
- **A conversational turn.** A greeting or a one-word answer must not trigger a change brief, but must still obey the response format.
- **Enforcement disagrees with a deliberate choice.** A justified exception must be possible and must leave an auditable record, rather than being silently bypassed or forcing a bad name.
- **A generated or vendored file.** Naming enforcement must not fire on code the developer did not write.
- **The visual surface is unavailable.** If a brief cannot be rendered, the change must still be reportable in a degraded but legible form rather than blocking the work.

---

## Requirements *(mandatory)*

### Functional Requirements

**Visual change brief**

- **FR-001**: The system MUST produce a visual change brief automatically whenever a code change is completed, without the developer asking for one.
- **FR-002**: The brief MUST be readable in under one minute, with no panel requiring scrolling.
- **FR-003**: The brief MUST use large type, high contrast, and colour that carries meaning consistently — one colour for verified evidence, another for risk or assumption.
- **FR-004**: The brief MUST show what changed, why it changed, and what could break, as visually distinct panels rather than continuous prose.
- **FR-005**: The brief MUST name the decisions that mattered rather than enumerate every file touched.
- **FR-006**: The brief MUST scale to the change: a trivial change yields a single panel; a large change summarises rather than growing without bound.

**Provoking understanding**

- **FR-007**: Where a viable alternative approach existed, the brief MUST name it and the reason it was not taken.
- **FR-008**: Each decision panel MUST end in something answerable — an open question or an explicitly stated assumption.
- **FR-009**: The brief MUST be able to render in a minimal form when the developer indicates they already understand the area.
- **FR-010**: The brief MUST NOT manufacture significance for a mechanical change; it must be capable of saying a change was routine.

**Response format enforcement**

- **FR-011**: The response format — emoji section headers, dividers, tables for comparative content, bullets, and a per-section word cap — MUST apply to every response in every project without per-project setup.
- **FR-012**: A response that violates the format MUST be detected and the violation surfaced, rather than passing silently.
- **FR-013**: Enforcement MUST distinguish a genuine violation from a case where the developer explicitly asked for more detail.
- **FR-014**: The enforcement mechanism MUST survive the agent's own non-compliance — it MUST NOT depend solely on the agent choosing to follow an instruction.

**Code that reads like English**

- **FR-015**: New code MUST be checked, before a commit completes, for single-letter variables outside permitted loop-iterator cases, non-prefixed booleans, and functions that are not verb-first.
- **FR-016**: A violation MUST refuse the commit and identify the offending name and location.
- **FR-017**: Enforcement MUST NOT fire on generated, vendored, or third-party code.
- **FR-018**: A deliberate exception MUST be possible and MUST leave an auditable record of who allowed it and why.
- **FR-019**: The change brief MUST surface names that pass every mechanical rule but still carry no domain meaning, for human judgement.

**Scope and governance**

- **FR-020**: The rules MUST live in one place that every project inherits, so a new project is covered without being configured.
- **FR-021**: The system MUST supersede `specs/012-compact-visual-style/`, which specified the response-format half and was never implemented.

---

### Key Entities

- **Change Brief** — the visual artefact produced per completed change. Holds: what changed, why, the decisions that mattered, alternatives rejected, risks and assumptions, and open questions.
- **Format Rule Set** — the response-style contract: section headers, dividers, tables, bullets, word cap. Applies to every response in every project.
- **Naming Rule Set** — the code-readability contract: no bare single letters outside permitted cases, boolean prefixes, verb-first functions, domain-meaningful names.
- **Exception Record** — an audited note that a rule was deliberately not applied, with its reason.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The developer can explain, in their own words and without re-reading the code, what a change did and why — for at least 8 of 10 changes sampled a day later.
- **SC-002**: A change brief is read to completion in under one minute.
- **SC-003**: The developer asks at least one substantive question about the approach on a majority of non-trivial changes, where the current baseline is approximately zero.
- **SC-004**: Zero responses in a working session contain a section exceeding the word cap without the developer having asked for more detail.
- **SC-005**: No new code reaches the main line carrying a name that violates the naming rules, measured across a full month of commits.
- **SC-006**: A newly created project inherits both rule sets with no configuration step.
- **SC-007**: The developer reports that reviewing a change no longer feels like something to avoid — the qualitative outcome the whole feature exists for.

---

## Assumptions

- The developer is the sole user; this is a personal working system, not a team process.
- "Comic book or billboard" describes information density and legibility — few elements, large type, strong colour, meaning carried visually — not literal illustration or a specific art style.
- The existing response-format reminder is advisory and is the mechanism currently failing. This feature does not assume it must be kept.
- The existing constitution already mandates readable naming (Article IV); the gap is mechanical enforcement, not policy.
- The existing pre-commit workflow-gate mechanism demonstrates that commit-time blocking works in this repository and is an acceptable pattern for naming enforcement.
- The word cap is approximately 75 words per section, matching the rule already in use.
- A brief describes a change already made; this feature does not require approving changes before they are written.

---

## Out of Scope

- Teaching programming concepts, or any tutorial mode. The goal is understanding a specific change, not general education.
- Retrofitting existing code to the naming rules. Enforcement applies to new and modified code.
- Enforcing the response format on agents other than the one in use, unless the shared rule location makes it free.
- Replacing the existing SDD workflow gates. This feature adds a comprehension gate alongside them.

---

## Clarifications Resolved

**Where the change brief lives** — the brief is a **structured artefact the agent publishes to
Forge**, not prose it prints. Forge renders it in a panel. A browser page remains possible later
as a second renderer over the same data; that choice is deliberately not foreclosed, because the
developer notes a browser gives the most room at the cost of a context switch.

**How hard enforcement bites** — deliberately split, because the two halves are not equally
enforceable:

| What | Level | Why |
|---|---|---|
| The agent's prose in the terminal | **Warn** | Best-effort only; see the constraint below |
| The change brief artefact | **Hard gate** | An artefact can be required; prose cannot |
| Code naming | **Hard gate** | Proven mechanism already in this repository |

**Scope** — Forge is the guardrail layer for **every CLI tool**, not for one assistant. Rules live
with Forge and apply regardless of which agent is running.

---

## The Enforceability Constraint

This is recorded because it shapes the whole design, and because the developer identified it
before the specification did.

Forge owns the terminal and keeps a scrollback buffer of everything a CLI emits, so it sees all
output whatever the provider. But an agent CLI is a full-screen program: what reaches that buffer
is escape sequences and screen redraws, not a clean transcript. Recovering "the assistant's
answer" from it is heuristic, and a heuristic that is wrong sometimes cannot be a gate.

So the design does not try. **What an agent says is warned about; what an agent does is gated.**
The brief is therefore an artefact published through a tool call rather than text on a screen —
Forge receives it exactly, can render it faithfully, and can detect its absence. Detecting absence
is what makes a gate possible, and it is the same mechanism that already refuses a commit whose
tests were never recorded.

---

## Requirements added by these answers

- **FR-022**: The change brief MUST be published by the agent as structured data through a Forge
  tool call, not inferred from terminal output.
- **FR-023**: Forge MUST refuse a commit for a code change that has no published brief, using the
  existing gate-ledger mechanism.
- **FR-024**: Format enforcement over terminal prose MUST be advisory (a visible warning) and MUST
  be honest about being heuristic — it MUST NOT block work on a detection it cannot guarantee.
- **FR-025**: The guardrails MUST apply to any CLI agent Forge runs, not to one assistant.
- **FR-026**: The brief's stored form MUST be renderer-independent, so a browser view can be added
  later without changing what agents publish.

---

## Risks

- **Provider tool-call support — CLOSED 2026-08-31.** The design rests on the agent being able to
  call a Forge tool, and the open question was Grok. Its CLI, Grok Build, became generally
  available on 2026-05-25 with native Model Context Protocol support: it discovers a
  standards-compliant local server and consumes what that server exposes without adapter code, and
  xAI's own material states that a server wired for Claude Code works unchanged. The assumption
  therefore holds across every assistant under consideration, and no fallback capture path is
  needed. Confirmed against published documentation only — not exercised against a running Grok
  installation, which the developer explicitly deferred.
- **A gate that is easy to satisfy badly is not a gate.** If publishing an empty brief passes,
  the mechanism becomes a formality. The brief's required content must be substantive enough that
  producing a hollow one is more work than producing a real one.
- **Specified twice, built never.** `specs/012-compact-visual-style/` covered the response-format
  half in June 2026 and was never planned. That is the failure mode this feature exists to avoid.
