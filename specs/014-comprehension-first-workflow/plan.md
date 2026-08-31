# Implementation Plan: Comprehension-First Workflow

**Branch**: `feature/014-comprehension-first-workflow` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-comprehension-first-workflow/spec.md`

## Summary

Make understanding a required step rather than an optional one, without asking the developer to
read code or prose.

The design turns on a single distinction, established in [research.md](./research.md) R1 and
identified by the developer before the specification was written: **what an agent says cannot be
reliably enforced; what an agent does can.** An agent CLI is a full-screen program, so what reaches
Forge's scrollback buffer is screen redraws rather than a transcript. Parsing an answer out of it is
heuristic, and a heuristic cannot be a gate.

So the change brief becomes an **artefact the agent publishes through an MCP tool**, not text it
prints. Forge then receives it exactly, renders it as a billboard-style panel, and — because
absence of an artefact is detectable — **refuses the commit when no brief was published**, using
the same ledger that already refuses a commit whose tests were never recorded.

Three deliverables, in dependency order:

1. **Brief published and gated** — a `change_brief_publish` MCP tool, one new entry in
   `RequiredGates`, and the pre-commit hook refusing a change with no brief. This is the enforcement
   spine; everything else hangs off it.
2. **Brief rendered** — a panel fed over the existing WebSocket hub, using the message-type and
   reload-restore pattern the SDD gate card already proves. Large type, few panels, colour that
   means something.
3. **Naming gated, prose warned** — a changed-files naming check in the pre-commit path (hard), and
   a scrollback-based format detector that warns and is honest about being heuristic (soft).

## Technical Context

**Language/Version**: Go (backend: `internal/mcp`, `internal/workflow`, `internal/terminal`);
JavaScript/React (frontend: `frontend/src`); Bash (the generated pre-commit hook body).

**Primary Dependencies**: existing only. The MCP `ToolHandler` interface (`Definition()` /
`Execute()`, `internal/mcp/tools_workflow_gate.go:29-48`); the gate ledger and `RequiredGates`
(`internal/workflow/ticket.go:31-49`); the generated pre-commit hook and its audited
`FORGE_BYPASS` path (`internal/workflow/hooks.go:105-131`); the WebSocket push
(`internal/terminal/mcp_bridge.go:119`, `BroadcastJSONToSession`); the panel-plus-hook pattern of
`frontend/src/hooks/useSddGate.js`; the scrollback ring buffer
(`internal/mcp/tools_terminal.go:253`). No new runtime libraries.

**Storage**: the existing `.forge/workflow-ticket.json` ledger for the gate record; a small
per-change brief document beside it under `.forge/`, stored in a renderer-independent form so a
browser view can be added later without changing what agents publish (FR-026). No database.

**Testing**: Go unit (mocked, <10 ms) for the brief schema, the gate addition, and the naming
checker's rule set; Go integration against a real temp repository proving a commit is refused with
no brief and allowed with one; frontend unit (vitest + Testing Library) for the panel; Playwright
UX via `run-dev-clean.ps1`, reading `window.term.buffer.active`, proving a brief published by a
tool call appears in the panel. Red → Green → Refactor throughout.

**Target Platform**: Windows 11 desktop primary; Unix paths kept correct in the hook body.

**Performance Goals**: publishing a brief adds no perceptible latency to the agent's turn; the
panel renders a brief within one second of publication; the naming check runs only over changed
files so it does not lengthen a commit noticeably.

**Constraints**: localhost only, no new auth; provider-agnostic — nothing may assume a particular
assistant (R6); the prose detector must never block, only warn (FR-024); enforcement must not fire
on generated or vendored code (FR-017); the bypass must stay audited rather than silent (FR-018);
never wildcard-kill processes (Article II).

**Scale/Scope**: a single local developer; a handful of briefs per working session; one ledger per
project.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| I — Prime Directive (BEST route) | Fixes the actual cause — an advisory rule with no teeth — rather than restating the rule more firmly. The enforceability constraint is faced directly instead of promising enforcement that cannot be delivered. | PASS |
| II — Process Protection | No process kills introduced. | PASS |
| III — Branching | Work on `feature/014-comprehension-first-workflow`; reintegrates via PR. | PASS |
| IV — Code Quality | This feature *is* Article IV enforcement. Its own code is held to the rules it adds. | PASS (enforced in tasks) |
| V — Testing (three-layer) | Unit mocked <10 ms, integration against a real temp repo and real hook, Playwright UX via `run-dev-clean.ps1`. Red → Green. | PASS |
| VI — Documentation | CHANGELOG updated in the PR; `specs/014/` is the exempt pipeline artefact. Supersedes `specs/012-compact-visual-style/`, which is marked rather than deleted. | PASS |
| VII — Framework-First | Four of five concerns reuse an existing seam (R1–R5). The one custom unit — the naming checker — carries a documented gap: no linter in the toolchain enforces this rule set, and it stops at mechanical rules by design. | PASS |
| VIII — Release | Local pipeline only (`scripts/local-release.ps1`). | PASS |
| IX — Vault Zero-Knowledge | No secrets involved. | N/A |
| X — Verification & Proof | The guarantee is proven by an integration test that a real commit is refused, and a Playwright run reading the buffer model — not by "it compiles". | PASS |
| XI — Output/Dashboard Restraint | Adds one panel, which is the feature. No new dashboard files; no phase-name narration. | PASS |

**No violations** → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-comprehension-first-workflow/
├── plan.md              # This file
├── spec.md              # The specification, clarifications resolved
├── research.md          # Phase 0 — decisions R1–R7
├── data-model.md        # Phase 1 — the brief, the ledger entry, the rule sets
├── quickstart.md        # Phase 1 — how to prove it works
├── checklists/
│   └── requirements.md  # 16/16 passing
├── contracts/
│   ├── change-brief-tool.md    # the MCP tool the agent calls
│   └── brief-gate.md           # what the commit gate requires
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root) — touch points

```text
internal/workflow/
├── ticket.go              # ADD GateBriefPublished constant; ADD it to RequiredGates.
│                          #   The slice is the documented extension point (R3).
├── hooks.go               # Pre-commit body: ADD the naming check step. Keep the existing
│                          #   FORGE_BYPASS path and the graceful skip when forge is absent.
└── naming.go              # NEW — the changed-files naming checker. Justified in R5: no
                           #   linter in the toolchain covers this rule set.

internal/mcp/
├── tools_change_brief.go  # NEW — change_brief_publish. Implements the existing ToolHandler
│                          #   interface; records the gate and pushes to the frontend.
└── tools_terminal.go      # unchanged (GetSessionScrollback is read, not modified).

internal/terminal/
└── mcp_bridge.go          # unchanged — BroadcastJSONToSession is reused as-is.

frontend/src/
├── components/
│   └── ChangeBriefPanel.jsx    # NEW — the billboard. Large type, few panels, colour that
│   └── ChangeBriefPanel.css    #   carries meaning: one for evidence, one for risk.
├── hooks/
│   └── useChangeBrief.js       # NEW — receives CHANGE_BRIEF over the hub and restores a
│                               #   pending brief after reload, mirroring useSddGate.js.
└── App.jsx                     # Mount the panel; route the message type.

tests/e2e/
└── change-brief.spec.js        # NEW — a brief published by a tool call appears in the panel.
```

**Structure Decision**: Go backend plus React frontend, retrofitting existing seams. The genuinely
new units are the brief tool, the naming checker, the panel and its hook — everything else is an
addition to a slice or a reuse of an established pattern.

## Implementation Sequencing (for /speckit-tasks)

Ordered so that the enforcement spine exists before anything decorative, and so each step is
independently provable.

1. **The brief, defined and published (US1 / P1, FR-022)** — the brief document shape, and
   `change_brief_publish` implementing `ToolHandler`. Unit-test the schema, including that a brief
   claiming "routine, no decision" is valid (FR-010) while an empty one is not (R7).
2. **The gate (US1 / P1, FR-023)** — `GateBriefPublished` added to `RequiredGates`. Integration-test
   against a real temp repository: a commit with no brief is **refused**, a commit with one is
   allowed, and `FORGE_BYPASS` still works and still writes to the audit log. This is the Red that
   proves the mechanism has teeth.
3. **The panel (US1, US2 / P1, FR-001–FR-010)** — `useChangeBrief.js` and `ChangeBriefPanel.jsx`,
   fed by `BroadcastJSONToSession`. Frontend unit tests for the panel; Playwright proof that a brief
   published by a tool call reaches the panel and that no panel needs scrolling. Include the
   decision-and-alternative and the ends-in-a-question rules (FR-007, FR-008).
4. **Naming gated (US4 / P2, FR-015–FR-019)** — `naming.go` and the hook step. Unit-test the rule
   set including the permitted `i`/`j`/`k` and `w`/`r` cases; integration-test that a violating
   commit is refused and that generated and vendored paths are skipped. Route the
   passes-the-rules-but-means-nothing case to the brief rather than the checker (FR-019).
5. **Prose warned (US3 / P1, FR-011–FR-014, FR-024)** — the scrollback-based format detector and its
   warning surface. Built last and deliberately soft: it must never block, and its own tests must
   assert that a false positive costs a warning and nothing more.
6. **Supersede and record** — mark `specs/012-compact-visual-style/` superseded; update CHANGELOG.
7. **Edge and resilience** — trivial change yields one panel; a large change summarises rather than
   growing; a conversational turn produces no brief; a brief that cannot render still reports in a
   degraded legible form (FR-006, edge cases).

## Complexity Tracking

No constitution violations — section intentionally empty.
