# Contract: Per-Tool Pipeline Projection

This CLI/desktop tool's "contract" is the deterministic mapping from the **single stage source**
to each tool's **consumption surface** and the developer-facing **invocation**. Implementation must
satisfy this table exactly.

## Source (one authored copy)

```
internal/workflow/speckit/claude-skills/<stage-id>/SKILL.md   (embedded via go:embed)
```

## Projection per tool

| Tool | Project destination | Embedded/instruction surface | Developer invocation |
|---|---|---|---|
| claude | `.claude/skills/<stage-id>/SKILL.md` | — (native dir resolution) | `/<stage-id>` e.g. `/speckit-specify` |
| copilot | `.github/skills/<stage-id>/SKILL.md` | `.github/copilot-instructions.md` FORGE-SKILLS marker block | `skill: <stage-id>` |
| google | `GEMINI.md` and/or `.gemini/commands/<stage-id>.*` (provisional — see research R2) | project `GEMINI.md` instruction surface | TBD — confirm against `agy` in implement |

## Behavioral contract

1. **Idempotent**: re-projecting unchanged source yields byte-identical destination files.
2. **Conflict-honoring**: under `ConflictSkip`, an existing destination is never overwritten; under `ConflictOverwrite`, derived files are regenerated; merge behaves as documented in `scaffold.go`.
3. **Single-source**: no destination is hand-authored; all are derived from the source. A test MUST assert Copilot/Gemini stage content is derivable from the Claude source (drift guard).
4. **Constitution-bound**: every projected stage retains the instruction to read `.specify/memory/constitution.md`.
5. **Tool-neutral artifacts**: projection changes *invocation surfaces only*; `spec.md`/`plan.md`/`tasks.md` formats are unchanged so features hand off between tools (FR-010).
6. **Visible gaps**: if a tool's surface cannot be written (or Gemini invocation is unverified), an entry is added to `InstallResult.warnings` (FR-009) — never a silent no-op.

## Acceptance (maps to spec Success Criteria)

- SC-001/002: a stage projected to Copilot/Google produces the same artifact files as Claude → assert in integration test + quickstart.
- SC-004: re-install with edits present preserves edits → conflict unit test.
- SC-005: invocation appears in each tool's own command surface → assert destination files/blocks exist.
