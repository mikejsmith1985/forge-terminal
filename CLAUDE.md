# forge-terminal — Forge Agent Instructions

> Claude Code reads this file automatically at every session start.
> The binding rules for this project live in the tool-agnostic constitution,
> imported below. This file intentionally does NOT import Copilot's
> `.github/copilot-instructions.md` — a Claude session is never routed through
> another tool's instruction file (FR-011, consistent with PR #162).

@.specify/memory/constitution.md

<!-- SPECKIT START -->
## Active Spec Kit feature

- **003-sdd-phase-orchestrator** — In-terminal HITL decision cards that gate each SDD phase.
  Plan: `specs/003-sdd-phase-orchestrator/plan.md`. Reuses the macro injector (advance),
  `tutor/watcher.go` (detect), the WebSocket hub (card push), and the styled-modal pattern
  (card UI). Next: `/speckit-tasks`.
<!-- SPECKIT END -->
