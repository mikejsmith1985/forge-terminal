# Tasks: Cross-Tool Spec-Driven Development

**Input**: Design documents from `specs/001-cross-tool-speckit/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pipeline-install.md
**Tests**: INCLUDED — the constitution (Article V) mandates three-layer TDD, so test tasks precede implementation.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no incomplete dependency)
- **[Story]**: US1/US2/US3 for user-story phases; setup/foundational/cross-cutting/polish carry no story label

## Path Conventions

Single Go project (Forge Terminal). Feature code lives in `internal/workflow/`; tests are `*_test.go` siblings.

---

## Phase 1: Setup

**Purpose**: Branch and tool enumeration in place.

- [ ] T001 Confirm work is on `feature/cross-tool-speckit` and record the `branch-created` workflow gate
- [ ] T002 [P] Add a `SupportedTool` representation (claude/copilot/google) aligned with `globalCLITargets()` in `internal/workflow/types.go`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The single-source projection engine every user story depends on. MUST complete before US1–US3.

- [X] T003 Write failing unit test for stage enumeration over the embedded `speckit/claude-skills/*` payload in `internal/workflow/speckit_project_test.go`
- [X] T004 Implement `SpecKitStage` enumeration (`EnumerateSpecKitStages`, reads embedded source) in `internal/workflow/speckit_project.go`
- [X] T005 Write failing unit test for stage path resolution per tool in `internal/workflow/speckit_project_test.go`
- [X] T006 Implement the per-tool projection function (`ProjectSpecKitForTool` + `specKitStageDestPath`) in `internal/workflow/speckit_project.go`, with the Article VII drift justification comment
- [X] T007 Write failing unit test that `ConflictSkip` preserves an existing destination file in `internal/workflow/speckit_project_test.go`
- [X] T008 Implement conflict-honoring write by reusing `FileConflictStrategy`/`writeFileEnsuringDir` in `internal/workflow/speckit_project.go`

**Checkpoint**: projection engine is unit-tested and conflict-safe.

---

## Phase 3: User Story 1 — Copilot runs the pipeline (Priority: P1) 🎯 MVP

**Goal**: A Copilot user can run specify→plan→tasks→implement and get the same artifacts as Claude.
**Independent test**: Quickstart Scenario A — invoke `skill: speckit-specify` under Copilot, confirm `spec.md` structure matches Claude's.

- [X] T009 [US1] Write failing integration test asserting stages project to `.github/skills/speckit-*/SKILL.md` in `internal/workflow/speckit_project_test.go`
- [X] T010 [US1] Implement Copilot skill-directory projection (`.github/skills/<stage>/SKILL.md`) in `internal/workflow/speckit_project.go`
- [X] T011 [US1] Embed the speckit stages into `.github/copilot-instructions.md` via a dedicated `FORGE-SPECKIT` marker block (kept separate from the PS-managed FORGE-SKILLS block), reusing `upsertMarkerBlock` in `internal/workflow/speckit_project.go`
- [X] T012 [US1] Write failing test asserting the FORGE-SPECKIT block lists each stage and the `skill: speckit-specify` invocation in `internal/workflow/speckit_project_test.go`
- [ ] T013 [US1] Verify per Quickstart Scenario A: run the pipeline under Copilot in a scratch project and read the produced artifacts (Article X evidence) *(manual — requires a live Copilot session)*

**Checkpoint**: Copilot pipeline is runnable end-to-end — MVP deliverable.

---

## Phase 4: User Story 2 — Google runs the pipeline (Priority: P2)

**Goal**: A Google/`agy` user can run the pipeline with the same artifacts, or a documented graceful fallback.
**Independent test**: Quickstart Scenario B.

- [ ] T014 [US2] Write failing integration test for Gemini surface projection (`GEMINI.md`/`.gemini/`) in `internal/workflow/speckit_project_test.go`
- [ ] T015 [US2] Implement Gemini projection (provisional per research R2) in `internal/workflow/speckit_project.go`
- [ ] T016 [US2] EMPIRICAL VERIFICATION (research R2 risk): launch `agy` in a scaffolded project, attempt a stage invocation, read output to confirm execution + constitution adherence (Article X)
- [ ] T017 [US2] If `agy` cannot invoke discrete stages, implement the documented fallback pattern and emit an `InstallResult.warnings` entry explaining the degraded mode in `internal/workflow/speckit_project.go`

**Checkpoint**: Google pipeline runs, or degrades gracefully with a visible warning.

---

## Phase 5: User Story 3 — Install parity & no-clobber (Priority: P3)

**Goal**: Scaffolding and existing-project setup install the runnable pipeline for all three tools, honoring conflict strategy.
**Independent test**: Quickstart Scenarios C and E.

- [X] T018 [US3] Write failing integration test: scaffolding writes Copilot stage files + the FORGE-SPECKIT block (`TestScaffoldProject_ProjectsCopilotSpecKit`) in `internal/workflow/speckit_scaffold_test.go` *(Google deferred to US2)*
- [X] T019 [US3] Extend the `ModuleSpecKit` replay (`internal/workflow/scaffold.go`) to call `ProjectSpecKitForTool` for Copilot after the Claude payload
- [ ] T020 [US3] Write failing test: re-scaffold under `ConflictSkip` preserves an edited stage file in `internal/workflow/speckit_scaffold_test.go`
- [ ] T021 [US3] Wire the existing-project workflow-setup path to install the per-tool pipeline without disturbing installed Claude files in `internal/workflow/scaffold.go`
- [ ] T022 [US3] Implement `InstallResult.warnings` for absent/partial tool surfaces (FR-009) in `internal/workflow/scaffold.go`

**Checkpoint**: every project — new and existing — gets the cross-tool pipeline, edits preserved.

---

## Phase 6: Context-File Coherence (FR-011 / SC-007) — cross-cutting

**Purpose**: Each tool has a project context file routed to the tool-agnostic constitution, never another tool's file. Independent of the projection engine; can start after Phase 2.

- [X] T023 [P] Write failing test: `RenderClaudeMD` output imports `@.specify/memory/constitution.md` and does NOT import `copilot-instructions.md` in `internal/workflow/templates_test.go`
- [X] T024 Fix the `RenderClaudeMD` template in `internal/workflow/templates.go` to drop the `@.github/copilot-instructions.md` import (consistent with merged PR #162)
- [X] T025 [P] Create forge-terminal's root `CLAUDE.md` with `<!-- SPECKIT START -->`/`<!-- SPECKIT END -->` markers and `@.specify/memory/constitution.md`
- [ ] T026 Write failing test asserting each supported tool resolves to a project context file routed to the constitution (FR-011) in `internal/workflow/templates_test.go` *(partial — Claude covered; Copilot/Gemini await the projection phases)*
- [X] T027 Ensure the agent-context update target (`CLAUDE.md`) exists so the post-plan step is not silently inert (SC-007) — markers added to template + repo `CLAUDE.md`, verified by `TestRenderClaudeMD_IncludesAgentContextMarkers`

**Checkpoint**: no tool routes through another tool's file; agent-context step has a real target.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T028 [P] Update `CHANGELOG.md` `[Unreleased]` with the cross-tool SDD feature
- [ ] T029 [P] Run Quickstart Scenarios A–E end-to-end and capture evidence
- [ ] T030 Run `go build ./cmd/forge/` and `go test ./...` to green; record `tests-written` and `tests-passed` gates
- [ ] T031 [P] (Optional, FR-009) Surface per-tool pipeline status in `frontend/src/components/ForgeWorkflowCard.jsx`

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** → then user stories.
- **Phase 2 (Foundational) blocks Phase 3/4/5** — the projection engine is shared.
- **US1 (P1) is the MVP.** US2 and US3 build on Phase 2 but are independent of US1.
- **Phase 6 (FR-011)** depends only on Phase 1/2 and can run in parallel with US1–US3.
- **Phase 7** last.

## Parallel Opportunities

- T002 [P] alongside Phase 2 test authoring.
- Within Phase 6: T023/T025 [P] (different files).
- Polish: T028/T029/T031 [P].
- TDD pairs (e.g. T003→T004) are sequential by design — failing test first.

## Implementation Strategy

- **MVP = Phase 1 + 2 + 3 (US1 Copilot).** Ship cross-tool SDD for Copilot first; it's the highest-value, lowest-risk tool.
- **Increment 2 = US3** (install parity) so the MVP actually reaches projects.
- **Increment 3 = US2 Google**, gated on the T016 empirical `agy` check — degrade gracefully if needed.
- **Phase 6 (FR-011)** can land early and independently (it's also a standalone correctness fix).

## Format Validation

All 31 tasks use `- [ ] T### [P?] [US#?] description + file path`. Story labels present on US1–US3 phases only; setup/foundational/cross-cutting/polish carry none, per the format rules.
