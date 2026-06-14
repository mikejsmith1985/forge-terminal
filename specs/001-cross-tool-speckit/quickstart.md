# Quickstart: Validating Cross-Tool SDD

Run-the-pipeline validation that proves the feature works end-to-end, per Article X (evidence,
not "it compiles"). Implementation details live in `tasks.md`/implement; this is the proof guide.

## Prerequisites

- Forge Terminal build with this feature
- A scratch project scaffolded through Forge (so the cross-tool pipeline is installed)
- Each tool available: Claude, Copilot CLI, Google `agy`

## Scenario A — Copilot runs the full pipeline (P1, SC-001)

1. In the scratch project, set the active tool to **Copilot**.
2. Confirm install: `.github/skills/speckit-specify/SKILL.md` exists and the
   `.github/copilot-instructions.md` FORGE-SKILLS block lists the speckit stages.
3. Invoke `skill: speckit-specify` with a one-line feature description.
4. **Expected**: `specs/<feature>/spec.md` is created with the same section structure as a
   Claude-produced spec.
5. Run plan → tasks → implement in order.
6. **Expected**: `plan.md`, `tasks.md` produced; each stage references the constitution.

**Pass**: artifact file names + section headings match the Claude pipeline 1:1.

## Scenario B — Google runs the pipeline (P2, SC-002)

1. Set the active tool to **Google** (`agy`).
2. Confirm the Gemini stage surface is present (`GEMINI.md`/`.gemini/` per research R2).
3. Invoke the specify stage (exact invocation confirmed during implement).
4. **Expected**: same `spec.md` produced; constitution read.
5. **If `agy` cannot invoke discrete stages**: the documented fallback pattern runs and a
   `warnings` entry explains the degraded mode (acceptable for P2 per research R2).

**Pass**: either full parity, or graceful documented fallback with a visible warning.

## Scenario C — Install parity & no clobber (P3, SC-003/004)

1. Scaffold a brand-new project; **expected**: pipeline runnable for all three tools, zero manual steps.
2. Edit one projected stage file; re-run setup under `ConflictSkip`.
3. **Expected**: the edited file is preserved (byte-identical to your edit); `filesSkipped` lists it.

## Scenario D — Cross-tool handoff (SC-006)

1. Start a feature under Claude (`/speckit-specify`), then switch active tool to Copilot and run plan.
2. **Expected**: Copilot's plan reads the Claude-authored `spec.md` without incompatibility.

## Scenario E — Visible gap (FR-009)

1. In a project where only Claude's pipeline is installed, set active tool to Copilot.
2. **Expected**: the system surfaces the missing pipeline and how to install it — not a silent no-op.
