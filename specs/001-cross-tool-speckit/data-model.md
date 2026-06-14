# Phase 1 Data Model: Cross-Tool Spec-Driven Development

Entities are conceptual (filesystem + in-memory projection), not a database schema.

## SupportedTool

Represents an AI CLI a developer can make active in Forge.

| Field | Type | Notes |
|---|---|---|
| `name` | string | `"claude"` \| `"copilot"` \| `"google"` (a.k.a. gemini) |
| `skillSurface` | enum | how stages are consumed: `slashCommandDir` (Claude `.claude/skills/`) \| `skillDirPlusInstructionBlock` (Copilot `.github/skills/` + FORGE-SKILLS block) \| `instructionSurface` (Gemini `GEMINI.md`/`.gemini/`, provisional) |
| `invocation` | string | what the developer types, e.g. `/speckit-specify`, `skill: speckit-specify` |
| `projectTargets` | []path | project-relative destinations for this tool's stage files |

Validation: `name` must be one of the three known tools (mirrors `globalCLITargets()`); an unknown tool is rejected, not silently skipped.

## PipelineStage

A single SDD stage, authored once and projected per tool.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `speckit-specify`, `speckit-plan`, … (10 stages) |
| `sourcePath` | path | the single embedded source under `speckit/claude-skills/<id>/SKILL.md` |
| `frontmatter` | map | `name`, `description`, `argument-hint`, `user-invocable`, … |
| `body` | markdown | stage instructions (tool-neutral) |

Validation: every stage MUST carry `name`, `description`; stages requiring input (e.g. specify) MUST carry `argument-hint`.

## StageProjection

The derivation of one stage onto one tool's surface (the custom piece, Article VII).

| Field | Type | Notes |
|---|---|---|
| `stage` | PipelineStage | source |
| `tool` | SupportedTool | target |
| `destination` | path | resolved per `tool.skillSurface` |
| `transform` | fn | identity for Claude/Copilot skill files; instruction-block insert for Copilot block + Gemini surface |

Invariant: projection is deterministic and idempotent — re-running produces byte-identical output for unchanged source.

## InstallResult

Outcome of projecting the pipeline into a project (extends the existing scaffold result shape).

| Field | Type | Notes |
|---|---|---|
| `filesWritten` | []path | per-tool stage files created/updated |
| `filesSkipped` | []path | preserved under `ConflictSkip` |
| `toolsInstalled` | []string | which tools now have a runnable pipeline |
| `warnings` | []string | e.g. Gemini invocation unverified; a tool surface absent |

## State / transitions

A project's pipeline install per tool: `absent → installed`. Re-install under `ConflictSkip` keeps edited files (`installed` stays, edits preserved). Under `ConflictOverwrite`, derived files are regenerated from source. There is no `partial` success that is silently hidden — partial installs surface via `warnings` (FR-009).
