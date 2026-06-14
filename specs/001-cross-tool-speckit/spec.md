# Feature Specification: Cross-Tool Spec-Driven Development

**Feature Branch**: `feature/cross-tool-speckit`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "Make the speckit-* SDD pipeline runnable under Copilot and Google, not just Claude. Today they can read the constitution but can't execute specify→plan→tasks→implement. Vendor the pipeline skills + invocation for each tool so SDD works cross-tool."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the SDD pipeline under Copilot (Priority: P1)

A developer working in a Forge-managed project with the GitHub Copilot CLI as their active tool runs the full Spec-Driven Development pipeline — specify, then plan, then tasks, then implement — and gets the same per-feature artifacts (`spec.md`, `plan.md`, `tasks.md`) that a Claude user gets today.

**Why this priority**: Copilot is the most-used non-Claude tool in this environment, and the SDD pipeline is the core workflow. Without it, Copilot users can read the rules (constitution) but cannot actually *do* the governed workflow — the central gap this feature closes.

**Independent Test**: Switch the active tool to Copilot, run the four pipeline stages in order on a small feature, and confirm each stage produces the same artifact files in `specs/<feature>/` as the Claude pipeline does.

**Acceptance Scenarios**:

1. **Given** a project with the cross-tool pipeline installed and Copilot as the active tool, **When** the developer invokes the "specify" stage with a feature description, **Then** a `specs/<feature>/spec.md` is created from the spec template, identical in structure to the Claude-produced spec.
2. **Given** a completed spec, **When** the developer invokes plan, then tasks, then implement in order under Copilot, **Then** each stage reads the prior stage's artifact and produces its own, and each stage reads and obeys `.specify/memory/constitution.md`.
3. **Given** Copilot is the active tool, **When** the developer looks for how to start the pipeline, **Then** the stages are invocable through Copilot's own native command/skill mechanism without the developer needing to know Claude-specific syntax.

---

### User Story 2 - Run the SDD pipeline under Google (Priority: P2)

A developer with the Google (Gemini) CLI as their active tool runs the same four-stage pipeline and gets the same artifacts and constitution enforcement.

**Why this priority**: Completes the "every tool inherits the workflow" goal. Lower than Copilot only because Copilot has the larger user base here; the requirement is otherwise identical.

**Independent Test**: Switch the active tool to Google, run the four stages on a small feature, and confirm artifacts and constitution adherence match the Claude/Copilot result.

**Acceptance Scenarios**:

1. **Given** the cross-tool pipeline is installed and Google is the active tool, **When** the developer runs each pipeline stage, **Then** the same artifacts are produced and the constitution is read at each stage.
2. **Given** a stage that has no equivalent native trigger in the Google CLI, **When** the developer follows the documented invocation for that tool, **Then** the stage still runs to completion.

---

### User Story 3 - Cross-tool pipeline is installed everywhere Claude's is (Priority: P3)

When a project is scaffolded through Forge — and when an existing project is set up via the Workflow card — the pipeline is installed for Copilot and Google in addition to Claude, honoring the existing conflict strategy so a developer's edited pipeline files are never clobbered.

**Why this priority**: Without installation parity, the capability exists but never reaches projects. Depends on US1/US2 defining what "installed for a tool" means.

**Independent Test**: Scaffold a fresh project, then confirm the pipeline is present and runnable for all three tools; re-scaffold and confirm edited pipeline files are preserved.

**Acceptance Scenarios**:

1. **Given** a newly scaffolded project, **When** scaffolding completes, **Then** the SDD pipeline is present and runnable for Claude, Copilot, and Google without any further manual setup.
2. **Given** a project whose pipeline files were locally edited, **When** the project is re-scaffolded or re-set-up, **Then** the developer's edits are preserved according to the active conflict strategy.
3. **Given** a project set up before this feature shipped (Claude-only pipeline), **When** the developer re-runs workflow setup, **Then** the Copilot and Google pipeline is added without disturbing the existing Claude pipeline.

---

### Edge Cases

- What happens when only one non-Claude tool's pipeline is installed (e.g., Copilot present, Google absent) and the developer switches to the uninstalled tool? The system should make the absence visible rather than silently doing nothing.
- How does the system handle a tool whose native invocation cannot express a slash-style command — is there a documented alternative trigger for that tool?
- What happens when the constitution is missing for a project — does each tool's pipeline degrade the same way Claude's does today?
- What happens when a developer starts a feature under one tool and continues it under another — are the artifacts tool-neutral enough to hand off?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The four core pipeline stages — specify, plan, tasks, implement — MUST be executable by a developer whose active tool is Copilot, producing the same per-feature artifacts as the Claude pipeline.
- **FR-002**: The four core pipeline stages MUST be executable by a developer whose active tool is Google, producing the same per-feature artifacts.
- **FR-003**: Each pipeline stage, under every supported tool, MUST read and obey `.specify/memory/constitution.md` as the binding ruleset.
- **FR-004**: Each stage MUST be invocable through the active tool's own native command/skill mechanism; the developer MUST NOT need to type another tool's invocation syntax.
- **FR-005**: The supporting quality-gate stages that Claude has today (e.g., clarify, analyze, checklist, tasks-to-issues, agent-context update) MUST be available to Copilot and Google at the same parity, OR any intentionally excluded stage MUST be explicitly documented as out of scope.
- **FR-006**: Newly scaffolded projects MUST receive the runnable pipeline for Claude, Copilot, and Google with no manual setup.
- **FR-007**: Existing projects MUST be able to gain the Copilot/Google pipeline through the same workflow-setup path that installs the Claude pipeline today, without disturbing already-installed Claude pipeline files.
- **FR-008**: Installation MUST honor the existing conflict strategy so locally edited pipeline files are never overwritten.
- **FR-009**: When a developer's active tool lacks an installed pipeline, the system MUST surface that absence (rather than silently failing) and indicate how to install it.
- **FR-010**: Pipeline artifacts (`spec.md`, `plan.md`, `tasks.md`) MUST remain tool-neutral so a feature started under one tool can be continued under another.
- **FR-011**: Each supported tool MUST have a project-level context file that the tool reads at session start (Claude → `CLAUDE.md`; Copilot → `AGENTS.md`/`.github/copilot-instructions.md`; Google → `GEMINI.md`), and each MUST route to the tool-agnostic constitution (`.specify/memory/constitution.md`). A tool's context file MUST NOT route that tool through another tool's instruction file (e.g. `CLAUDE.md` MUST NOT depend on `copilot-instructions.md`). This includes the agent-context update target: the file the SDD pipeline refreshes after planning MUST exist for each tool, so the step is not silently inert.

### Key Entities *(include if feature involves data)*

- **Pipeline Stage**: A single step of the SDD workflow (specify, clarify, plan, tasks, analyze, implement, etc.), with a tool-specific invocation and a tool-neutral artifact output.
- **Supported Tool**: An AI CLI a developer can make active in Forge (Claude, Copilot, Google), each with its own native skill/command invocation mechanism.
- **Pipeline Installation**: The set of stage definitions and supporting files placed into a project for a given tool, subject to a conflict strategy on (re)install.
- **Constitution**: The tool-neutral binding ruleset every stage must read; already installed cross-tool today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer using Copilot can take a feature from description to implementation through all four pipeline stages with a 100% match of produced artifact files (names and section structure) against the Claude pipeline.
- **SC-002**: A developer using Google can complete the same four-stage run with the same artifact match.
- **SC-003**: 100% of newly scaffolded projects have a runnable pipeline for all three tools with zero manual setup steps.
- **SC-004**: Re-running setup on a project with locally edited pipeline files preserves 100% of those edits (no clobbering).
- **SC-005**: A developer can discover and start the pipeline under any supported tool without consulting another tool's syntax — measured by the invocation being available through that tool's own command list.
- **SC-006**: Switching active tools mid-feature and continuing the pipeline yields no artifact incompatibility (a feature handed off between tools completes successfully).
- **SC-007**: For every supported tool, the project context file exists and resolves to the constitution; the post-planning agent-context update writes to a real target (0 silently-inert runs), and no context file references another tool's instruction file.

## Assumptions

- "Google" refers to the Gemini-based CLI that Forge already supports as the `google` tool (the `agy` invocation seen in existing tool variants).
- Parity means the same set of pipeline stages Claude has today; if a particular tool cannot express a given stage natively, a documented alternative invocation is acceptable rather than dropping the stage.
- The constitution is already installed cross-tool (per the global-install capability shipped earlier) and is not re-solved by this feature.
- "Active tool" selection already exists in Forge and is the signal used to determine which tool's pipeline a developer is driving.
- The per-feature `specs/<feature>/` artifacts are already tool-neutral in format; this feature must keep them so.
- Offline operation (no external CLI/network dependency to run the pipeline) is expected to match Claude's current offline behavior.
- "Project context file" means the file each CLI reads automatically at session start; forge-terminal currently has `AGENTS.md` (Copilot) but no root `CLAUDE.md`, even though its own scaffolder (`RenderClaudeMD`) generates one for every project it creates — that inconsistency is in scope to fix.
- Routing CLAUDE.md to the constitution rather than `copilot-instructions.md` mirrors the session-macro fix already merged (PR #162); the `RenderClaudeMD` template's `copilot-instructions` import is expected to be corrected as part of this work.
