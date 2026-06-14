# Implementation Plan: Cross-Tool Spec-Driven Development

**Branch**: `feature/cross-tool-speckit` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-cross-tool-speckit/spec.md`

## Summary

Make the `speckit-*` SDD pipeline runnable under Copilot and Google, not just Claude, by
**extending Forge's existing install/scaffold framework** rather than building a new one. One
source of truth for stage content (the vendored `speckit/claude-skills/speckit-*` payload) is
projected into each tool's native skill/command surface, honoring the existing conflict strategy.
The two per-tool invocation/consumption mechanisms that are not yet confirmed (Copilot native
resolution; Gemini/`agy` skill consumption) are resolved in Phase 0 research before any code.

The plan also closes a coherence gap surfaced during planning (FR-011): each tool must have a
project context file routed to the **tool-agnostic constitution**, never another tool's file.
Concretely — create forge-terminal's missing root `CLAUDE.md` (the repo's own scaffolder already
generates one for every other project), and fix `RenderClaudeMD` so the generated `CLAUDE.md`
imports the constitution and drops the `copilot-instructions.md` import (mirroring merged PR #162).

## Technical Context

**Language/Version**: Go (backend, `internal/workflow`), PowerShell 7 (deploy/sync scripts), React (frontend, Workflow card only if a status surface is needed)

**Primary Dependencies**: stdlib `embed`/`io/fs`/`os`/`path/filepath`; existing `internal/workflow` package (`ScaffoldSpecKit`, `globalCLITargets`, conflict strategy); `scripts/deploy-skills.ps1` marker-block embedder

**Storage**: filesystem — per-project (`.claude/skills/`, `.github/skills/`, `.github/copilot-instructions.md`, possibly `.gemini/`) and machine-wide (`~/.claude`, `~/.copilot`, `~/.gemini`)

**Testing**: `go test ./...` — unit (path mapping, per-tool projection, conflict handling) 100% mocked <10ms; integration (scaffold into a temp dir, assert per-tool files written). Red→Green→Refactor per Article V.

**Target Platform**: Windows 11 primary; cross-platform (LF-pinned `.sh`, `pty_*` already cross-OS)

**Project Type**: Desktop app — Go HTTP backend + React frontend (Forge Terminal)

**Performance Goals**: Scaffold/install latency unchanged within noise (<200ms added for the extra per-tool projection); fully offline (no network/CLI dependency to install), matching Claude today

**Constraints**: Offline-capable; never clobber edited pipeline files; single content source (no hand-maintained per-tool copies that can drift)

**Scale/Scope**: 3 tools × ~10 stages; one project payload; existing global-install path

**NEEDS CLARIFICATION (→ Phase 0 research)**:
1. Does the GitHub Copilot CLI natively resolve `.github/skills/speckit-*/SKILL.md` as invocable stages, or must stages be embedded in the `.github/copilot-instructions.md` FORGE-SKILLS block to be invocable? What is the exact invocation a developer types?
2. How does the Google/Gemini `agy` CLI consume per-repo skills/commands? Is there a `.gemini/` per-repo convention, a commands directory, or only the `GEMINI.md` instruction file? (Today it receives only the constitution via global hoist.)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| I — Prime Directive (BEST route) | Reuse framework; parallelize per-tool projection | ✅ Plan reuses embed/scaffold/deploy; no quick-and-dirty parallel installer |
| III — Branching | On a feature branch | ✅ `feature/cross-tool-speckit` |
| IV — Code Quality | Naming/comments/≤40-line funcs | ✅ Enforced during implement |
| V — Testing (three-layer, TDD) | Unit + integration, test-first | ✅ Required by tasks; see Testing above |
| VI — Documentation | CHANGELOG updated; no aux docs (specs/ exempt) | ✅ Planned |
| VII — Framework-First | Confirm framework lacks it before custom build | ✅ **PASS** — verified Claude-only today; custom limited to per-tool projection + the Gemini gap; justification in research.md |
| X — Verification & Proof | Evidence, not "it compiles" | ✅ quickstart.md defines run-under-each-tool validation |

No unjustified violations. **Gate passes.** Article VII is the load-bearing gate and is satisfied by the recon: the per-tool speckit install does not exist; the install *machinery* does and is reused.

## Project Structure

### Documentation (this feature)

```text
specs/001-cross-tool-speckit/
├── plan.md              # This file
├── research.md          # Phase 0: resolves the two NEEDS CLARIFICATION items
├── data-model.md        # Phase 1: entities (tool, stage, projection, install result)
├── quickstart.md        # Phase 1: run-the-pipeline-under-each-tool validation
├── contracts/
│   └── pipeline-install.md   # Per-tool projection contract (source → destination → invocation)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
internal/workflow/
├── speckit_scaffold.go      # EXTEND: project payload for all active tools (today: Claude only)
├── speckit_project.go       # NEW (candidate): per-tool projection of the single stage source
├── scaffold.go              # EXTEND: ModuleSpecKit replay calls per-tool projection
├── global_install.go        # REFERENCE/EXTEND: globalCLITargets() pattern for machine-wide stages
├── templates.go             # EXTEND (FR-011): RenderClaudeMD drops copilot-instructions import, routes to constitution
├── types.go                 # EXTEND: tool enum + module wiring if needed
└── *_test.go                # NEW: unit + integration tests (TDD)

CLAUDE.md                    # NEW (FR-011): forge-terminal's own root context file — SPECKIT markers + @.specify/memory/constitution.md

scripts/
└── deploy-skills.ps1        # REFERENCE: marker-block embed precedent for Copilot

frontend/src/components/
└── ForgeWorkflowCard.jsx    # OPTIONAL: surface per-tool pipeline status (FR-009)
```

**Structure Decision**: Single Go project (Forge Terminal). The feature lives in `internal/workflow`, extending the existing scaffold/install code paths. A new `speckit_project.go` is the candidate home for the per-tool projection logic so `speckit_scaffold.go` stays focused on embed→disk replay. The single content source remains the embedded `speckit/claude-skills/speckit-*` payload; per-tool surfaces are *derived*, never hand-copied.

## Complexity Tracking

> No constitution violations require justification. The one custom component — per-tool projection of stage content — is justified by a documented framework gap (no Copilot/Gemini speckit install exists), recorded in research.md per Article VII.
