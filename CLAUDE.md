# forge-terminal — Forge Agent Instructions

> Claude Code reads this file automatically at every session start.
> The binding rules for this project live in the tool-agnostic constitution,
> imported below. This file intentionally does NOT import Copilot's
> `.github/copilot-instructions.md` — a Claude session is never routed through
> another tool's instruction file (FR-011, consistent with PR #162).

@.specify/memory/constitution.md

<!-- SPECKIT START -->
## Active Spec Kit feature

- **004-sdd-pipeline-dashboard** — Non-blocking gate card (side drawer) + persistent pipeline
  status panel (bottom, all 5 phases) + artifact preview embedded in the gate event.
  Plan: `specs/004-sdd-pipeline-dashboard/plan.md`. US delivery order: US2 (non-blocking card)
  → US1 (status panel) → US3 (artifact preview). Branch: `feature/004-sdd-pipeline-dashboard`.
<!-- SPECKIT END -->
