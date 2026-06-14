# Phase 0 Research: Cross-Tool Spec-Driven Development

Resolves the two `NEEDS CLARIFICATION` items from the plan's Technical Context, plus the
Article VII framework-gap justification.

## R1 — Copilot stage invocation mechanism

**Question**: Does Copilot CLI natively resolve `.github/skills/speckit-*/SKILL.md`, or must stages be embedded in the `.github/copilot-instructions.md` FORGE-SKILLS block? What does a developer type?

**Decision**: Project each stage to **both** surfaces — write `.github/skills/speckit-*/SKILL.md` (canonical, identical frontmatter format to Claude) **and** include the stages in the `.github/copilot-instructions.md` FORGE-SKILLS marker block — and invoke as `skill: speckit-specify` (Copilot's skill syntax), with the feature description following.

**Rationale**: This is exactly how Forge already ships `workflow-enforcer`, `code-quality`, etc. to Copilot (`.github/skills/` canonical source + `deploy-skills.ps1` embedding into the FORGE-SKILLS block, invoked `skill: <name>`). Reusing the proven path means zero new invocation infrastructure and guaranteed consistency with the skills Copilot already runs.

**Alternatives considered**:
- *Slash commands (`/speckit-specify`)* — rejected: that is Claude Code's resolution mechanism, not Copilot's.
- *Instruction-block only (no `.github/skills/` files)* — rejected: loses the canonical per-skill source that `deploy-skills.ps1` and re-sync depend on.

## R2 — Gemini / `agy` stage consumption (HIGHEST RISK)

**Question**: How does the Google/Gemini `agy` CLI consume per-repo skills/commands? Today it receives only the constitution via the global hoist to `~/.gemini/GEMINI.md`.

**Decision (provisional, must be empirically validated in implement)**: Project stages into the Gemini instruction surface by mirroring the Copilot approach — a project-level `GEMINI.md` (and/or `.gemini/` commands directory if `agy` supports one) carrying the stage definitions, with the constitution already present globally. Invocation form to be confirmed against `agy`.

**Rationale**: No per-repo Gemini skill-directory convention is confirmed in the codebase or by recon — only the global `GEMINI.md` target exists (`globalCLITargets()`). The lowest-risk extension is to reuse the instruction-embed pattern that already works for the constitution on Gemini.

**Residual risk & mitigation (Article X — verify with evidence)**:
- This is the one assumption I cannot confirm without running `agy`. The implement phase MUST include a verification task: launch `agy` in a scaffolded project, attempt to invoke a stage, and read actual output to confirm it executes and obeys the constitution.
- **Fallback if `agy` cannot invoke discrete stages**: document a single tool-neutral "run SDD stage <N> from the constitution + spec" instruction pattern for Gemini, and mark full per-stage parity for Gemini as a follow-up. US2 (P2) degrades gracefully without blocking US1 (Copilot, P1).

## R3 — Article VII framework-gap justification

**Decision**: Build a per-tool *projection* of the single embedded stage source; reuse everything else.

**Reused (no custom build)**: `go:embed` payload + `ScaffoldSpecKit` replay; `FileConflictStrategy` (skip/overwrite/merge); `deploy-skills.ps1` marker-block embedder; `globalCLITargets()` for machine-wide reach; tool-neutral `specs/<feature>/` artifacts.

**Custom (justified gap)**: there is no Copilot/Gemini speckit install today (`ModuleSpecKit` maps only to `.claude/skills/`). The minimum custom piece is a projection function that derives each tool's surface from the one stage source. Justification recorded here and to be echoed as a one-line comment at the projection function per Article VII.

## R4 — Single-source-of-truth to prevent drift

**Decision**: Keep the embedded `speckit/claude-skills/speckit-*` payload as the *only* authored copy. Copilot/Gemini surfaces are derived at install time (like `deploy-skills.ps1` derives `.claude/commands/` from `.github/skills/`). No hand-maintained second/third copies.

**Rationale**: Three hand-edited copies of 10 stages each would inevitably drift — the exact failure mode the constitution's single-source discipline exists to prevent.
