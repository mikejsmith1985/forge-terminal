# Feature Specification: Compact Visual Output Style

**Feature Branch**: `012-compact-visual-style`

**Created**: 2026-06-23

**Status**: Draft

**Input**: User description: "I want to implement a skill or something that will persist as part of the forge workflow process so that you will always interact with me like this. Visually, tables and emojis, dividers, context clarity, bullets. No section ever exceeds 75 words unless I ask for more context."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Automatic Visual Format in Every Response (Priority: P1)

The developer opens Forge Terminal and asks Claude anything — a code question, a task, an explanation. Every response automatically uses the visual style: emoji section headers, dividers, bullets, and comparison tables. No setup or invocation is needed each session.

**Why this priority**: The style must be ambient, not opt-in. A response without it is a regression.

**Independent Test**: Start a new session. Ask a question. Verify the response uses the visual format without any invocation.

**Acceptance Scenarios**:

1. **Given** a fresh Forge Terminal session, **When** the user asks any question, **Then** the response uses emoji headers, dividers, and bullets
2. **Given** a multi-part answer, **When** any section is rendered, **Then** it does not exceed 75 words
3. **Given** a comparison topic (two tools, two approaches), **When** Claude responds, **Then** a markdown table is used

---

### User Story 2 — 75-Word Section Cap with Opt-In Expansion (Priority: P1)

Every distinct section of a response stays at or under 75 words. If the developer wants deeper coverage, they ask "more detail" or "expand" and that section grows.

**Why this priority**: The 75-word cap is the core density contract — it prevents wall-of-text responses regardless of topic complexity.

**Independent Test**: Ask a complex architectural question. Count words in each response section. All ≤ 75 unless expansion was requested.

**Acceptance Scenarios**:

1. **Given** a complex question, **When** Claude answers, **Then** each named section is ≤ 75 words
2. **Given** a section that needs expansion, **When** the user says "expand" or "more detail", **Then** that section may exceed 75 words
3. **Given** a one-line factual question, **When** Claude answers, **Then** the response is appropriately brief (not padded to 75)

---

### User Story 3 — Visual Format Persists Across Forge Workflow Stages (Priority: P2)

The style applies uniformly whether Claude is answering a code question, outputting a speckit plan, reviewing a PR, or explaining a bug fix. No stage of the Forge workflow reverts to prose-heavy output.

**Why this priority**: Consistency across contexts prevents the developer from mentally context-switching between response styles.

**Independent Test**: Trigger responses from at least three distinct workflow contexts (coding question, speckit stage, code review). Verify format is consistent.

**Acceptance Scenarios**:

1. **Given** a speckit planning response, **When** rendered, **Then** phases are shown as a table or bulleted structure
2. **Given** a code review result, **When** rendered, **Then** findings use emoji severity markers and bullets
3. **Given** a bug fix explanation, **When** rendered, **Then** root cause, fix, and test are distinct ≤75-word sections

---

### Edge Cases

- What happens when the answer is inherently a single sentence? → No sections needed; respond directly without forced structure.
- What if a code block (not prose) exceeds 75 words? → Code blocks are exempt from the word cap; only prose sections are counted.
- What if the user asks Claude to stop using the format? → The style should be suppressible per-session without permanently removing it.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The output style MUST activate automatically at every session start without user invocation.
- **FR-002**: Every prose section in a response MUST be ≤ 75 words unless the user explicitly requests expansion.
- **FR-003**: Responses MUST use markdown structural elements: emoji section headers, `---` dividers, bullet lists.
- **FR-004**: Comparison content (two tools, approaches, options) MUST be rendered as a markdown table.
- **FR-005**: Code blocks MUST be exempt from the 75-word prose cap.
- **FR-006**: The style MUST apply consistently across all Forge workflow contexts: coding, speckit stages, reviews, explanations.
- **FR-007**: The style definition MUST survive app restarts and session resets without re-configuration.
- **FR-008**: The style MUST be suppressible for a session via an explicit user request (e.g., "plain text mode").

### Key Entities

- **Output Style**: A named configuration that defines response formatting rules, word caps, and required visual elements. Loaded at session start.
- **Section**: A named prose block within a response, delimited by a header or divider. The unit to which the 75-word cap applies.
- **Expansion Request**: An explicit user signal (e.g., "expand", "more detail", "go deeper") that waives the 75-word cap for the targeted section.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of responses in a session use emoji headers, dividers, or bullets — measurable by scanning response output.
- **SC-002**: Zero prose sections exceed 75 words unless an expansion was explicitly requested in the same conversation turn.
- **SC-003**: The style loads without any user action across 5 consecutive fresh sessions.
- **SC-004**: Developers can identify the "section type" (code question, comparison, review finding) from visual structure alone — no guessing from prose tone.
- **SC-005**: Suppression request ("plain text") takes effect within the same response.

---

## Assumptions

- The Forge Terminal skills system (global Claude Code skills directory) is the appropriate persistence mechanism — a skill file in `~/.claude/skills/` is loaded per-session via CLAUDE.md or settings.
- The 75-word cap applies to prose only; code blocks, tables, and lists are structural and exempt.
- The style is not a one-off prompt injection but a durable configuration that outlives individual conversations.
- Emoji selection follows a fixed palette per section type (e.g., 🔍 for analysis, ✅ for completion, ⚠️ for warnings) rather than ad-hoc choices.
- "Forge workflow" includes speckit stages, code review, task output, and ad-hoc coding assistance.
