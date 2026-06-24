# Implementation Plan: Repeatable SDD — Deterministic Resume + Enforced TDD & Playwright UX Validation

**Branch**: `012-tdd-sdd-enforcement` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-tdd-sdd-enforcement/spec.md`

## Summary

Make the SDD pipeline **repeatable and predictable** by fixing the two failures that destroy trust in it. First, **deterministic session resume**: stop worktrees from nesting recursively and re-attach every reopened session to the exact directory it left. The nesting is a confirmed `git rev-parse --show-toplevel` semantics bug — run inside a linked worktree it returns that worktree's own root, so provisioning anchored to it builds `.forge/worktrees/X/.forge/worktrees/Y`. The fix anchors provisioning to the repository's **main checkout** (the first entry of `git worktree list --porcelain`, which git always lists first) and adds a hard guard that refuses any path that would nest. Second, **enforced TDD and Playwright UX validation**: turn Constitution Articles V (Red→Green→Refactor) and X (real behavioral proof, xterm.js buffer not DOM) from documentary rules into mechanical phase-completion gates. A behavior-changing phase cannot complete without recorded Red→Green test evidence; a user-facing phase cannot complete on grep/curl/HTTP-status/compiles — only a passing Playwright run that drives the real UI counts. Both reuse existing seams: the worktree wrapper and `resolveSddWorkspace` for resume; the per-phase completion seam (`applySddPhaseEvent` → `HandlePhaseComplete`), the report-card change-detection (`captureWorkTree`/`diffWorkTrees`), the workflow-ledger (`.forge/workflow-ticket.json` + `workflow_gate_record`), and the `tests/e2e/` Playwright harness for enforcement.

## Technical Context

**Language/Version**: Go (backend: `cmd/forge`, `internal/sdd`, `internal/git`, `internal/terminal`); JavaScript/React (frontend: `frontend/src`); PowerShell (hooks, dev harness).

**Primary Dependencies**: existing only (Framework-First, Article VII) — the `git` CLI (`worktree list`/`--git-common-dir`); the SDD orchestrator + per-session pipeline model (specs/008, 010); the PreToolUse enforcement hook (`scripts/sdd-gate-check.ps1`) and `/api/sdd/gate-check`; the workflow gate ledger (`.forge/workflow-ticket.json`, MCP `workflow_gate_record`, `scripts/install-workflow-hooks.ps1`); the report-card snapshot/diff (`cmd/forge/sdd_report_card.go`); the Playwright harness (`playwright.config.js`, `tests/e2e/`, `tests/fixtures/forge.js`) launched via `run-dev-clean.ps1`. No new runtime libraries.

**Storage**: git itself (worktree registry via `git worktree list --porcelain`); the existing in-memory `sddPipelines` `sync.Map` for session→workspace binding; the existing on-disk workflow ledger `.forge/workflow-ticket.json` for Red→Green and UX evidence. No new persisted store.

**Testing**: Go unit (mocked git/runner, <10 ms) for the main-checkout resolver, nesting guard, and behavior classifier; Go integration (real `git worktree` on a temp repo) proving no nesting across repeated provisioning; Playwright UX (via `run-dev-clean.ps1`, reading `window.term.buffer.active`) proving resume lands in the right directory and that the gates block on missing evidence. Red→Green→Refactor: the failing test precedes each change (this feature must itself pass the gates it introduces).

**Target Platform**: Windows 11 desktop (primary; ConPTY `cd` injection); Unix path kept correct (`cmd.Dir`/`cd`).

**Project Type**: Desktop application (Go backend + React frontend in a web/Electron shell).

**Performance Goals**: a resumed session re-attaches and is usable within 10 s of an app update (SC-008); gate evaluation adds no perceptible latency to phase completion (the diff/ledger reads are already on the completion path).

**Constraints**: localhost-only, no new auth; retrofit-in-place (extend the per-session pipeline and the existing gate seams, do not fork them); worktree dir stays out of git status (`.forge/` already gitignored); never destroy unmerged work (FR in 011); never wildcard-kill processes (Article II); gates fail **closed** (a check that cannot run blocks, never auto-passes — FR-016).

**Scale/Scope**: a handful of concurrent worktrees per repo; a single local developer; the six-phase speckit pipeline.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| I — Prime Directive (BEST route) | Fixes the real root cause (worktree-list-anchored main checkout) instead of patching symptoms; enforces testing mechanically rather than by agent discipline. | PASS |
| II — Process Protection | No process kills introduced; resume/cleanup target specific paths/branches. | PASS (enforced in tasks) |
| III — Branching | Work on `feature/012-tdd-sdd-enforcement`; reintegrates via PR. | PASS |
| IV — Code Quality | Self-documenting names, file purpose comments, functions <40 lines, guard clauses; thin additions to the git wrapper and classifier. | PASS (enforced in tasks) |
| V — Testing (three-layer) | This feature **operationalizes** Article V: unit (mocked git) <10 ms, integration (real worktree), Playwright UX via `run-dev-clean.ps1`; Red→Green→Refactor enforced — including on this feature itself. | PASS |
| VI — Documentation | CHANGELOG.md updated in the PR; `specs/012/` is the exempt pipeline artifact. | PASS |
| VII — Framework-First | Reuses git, the orchestrator/gate seam, the workflow ledger, and the Playwright harness. Only the main-checkout resolver, nesting guard, behavior classifier, and evidence-verification glue are new — justified in research.md (R1, R5). | PASS |
| VIII — Release | Local pipeline only (`scripts/local-release.ps1`). | PASS |
| IX — Vault Zero-Knowledge | No secrets involved. | N/A |
| X — Verification & Proof | This feature **operationalizes** Article X: UX evidence must read `window.term.buffer.active`, never the DOM; grep/curl/200/compiles are rejected as proof. | PASS |
| XI — Output/Dashboard Restraint | Reuses the sanctioned report-card surface; adds a small per-phase verification indicator; no new dashboard files; no phase-name narration. | PASS |

**No violations** → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/012-tdd-sdd-enforcement/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R7
├── data-model.md        # Phase 1 — entities & state transitions
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   ├── deterministic-resume.md     # main-checkout anchoring + no-nesting + re-attach contract
│   └── verification-gates.md       # TDD (Red→Green) + Playwright UX gate contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root) — touch points

```text
internal/git/
└── worktree.go          # ADD MainCheckout(repoDir) — first entry of `worktree list --porcelain`;
                         #   the authoritative main-checkout resolver replacing Toplevel() for anchoring.

cmd/forge/
├── sdd_worktree.go      # resolveSddWorkspace/provisionWorktreeForSession: anchor sddWorktreesRoot to
│                        #   MainCheckout (NOT Toplevel); add assertNoNesting guard (refuse a path already
│                        #   under .forge/worktrees/); resume re-attach helper that falls back to main
│                        #   checkout when a recorded worktree is gone (FR-002,003,004).
├── sdd_resume.go        # NEW — record/restore the per-session bound directory across restart; re-attach
│                        #   deterministically (FR-001,005). Small, single-purpose.
├── sdd_verification.go  # NEW — behavior classification + TDD(Red→Green) + UX-evidence gate evaluation,
│                        #   invoked at the phase-completion seam; reads the workflow ledger + Playwright
│                        #   result; produces a PhaseVerificationRecord and a pass/block/exempt GateDecision.
├── handlers_sdd.go      # applySddPhaseEvent "complete": consult sdd_verification before HandlePhaseComplete;
│                        #   surface verification record + decision in the report card / status envelope.
└── sdd_report_card.go   # add verification fields (behavior class, Red/Green, UX result) to the card.

internal/sdd/
└── detector.go          # ADD ClassifyBehavior(touchedFiles) → {behaviorChanging, userFacing, exemptReason}.

frontend/src/
├── hooks/useSddGate.js  # carry the verification record from status into UI state.
└── components/
    └── SddDashboard.jsx # render a concise per-phase verification indicator (pass / blocked-needs-test /
                         #   blocked-needs-UX / exempt) inside the existing report-card surface (Article XI).

scripts/
└── sdd-gate-check.ps1   # extend the PreToolUse gate to also report a verification-blocked phase (fail-closed).

tests/e2e/
└── sdd-tdd-enforcement.spec.js  # NEW — resume-lands-in-right-dir, no-nesting, gate-blocks-without-evidence,
                                 #   reading window.term.buffer.active (Article X).
```

**Structure Decision**: Web/desktop split (Go backend + React frontend). Almost all change retrofits existing files. The genuinely new units are `cmd/forge/sdd_resume.go` (directory re-attach), `cmd/forge/sdd_verification.go` (gate evaluation glue), one method on the git wrapper (`MainCheckout`), one classifier function (`ClassifyBehavior`), and one Playwright spec — consistent with retrofit-in-place and Framework-First.

## Implementation Sequencing (for /speckit-tasks)

Ordered by the spec's priorities and risk:

1. **Main-checkout resolver + nesting guard (US1 / P1, highest reuse + highest pain)** — `internal/git/worktree.go` `MainCheckout()` and `cmd/forge/sdd_worktree.go` anchoring + `assertNoNesting`. Unit-tested with a fake runner (worktree-list ordering, worktree-as-input case); integration-tested by provisioning twice against a real temp repo and asserting exactly one `.forge/worktrees/` level. This is the direct fix for the captured bug and must prove out first.
2. **Deterministic resume / re-attach (US1 / P1)** — `cmd/forge/sdd_resume.go`: record the bound directory per session; on restart re-attach to it, or fall back to the main checkout with one clear message when the recorded worktree is gone (FR-004). Playwright proof that resume lands in the same dir across restarts.
3. **Behavior classification (US2/US3 foundation)** — `internal/sdd/detector.go` `ClassifyBehavior` over the report-card's already-computed touched-file list. Unit-tested against representative file sets (code vs docs vs test-only vs UI). Everything in the gate depends on this.
4. **TDD Red→Green gate (US2 / P1)** — `cmd/forge/sdd_verification.go`: for a behavior-changing phase, require ledger evidence of a test observed failing then passing; block otherwise; allow a recorded exemption for docs/refactor. Wired at the completion seam in `handlers_sdd.go`.
5. **Playwright UX gate (US3 / P1)** — extend `sdd_verification.go`: for a user-facing phase, require a passing Playwright result that exercised the real UI (and, for terminal output, asserted on the xterm buffer); reject non-UX evidence; fail closed when Playwright cannot run (FR-016).
6. **Honest reporting + surfacing (US4 / P2)** — never report complete on a failed/unrun check (FR-017); show the verification record + failing output in the report card and dashboard; extend `sdd-gate-check.ps1` to report a verification-blocked phase. Determinism test: same inputs → same decision (FR-019/SC-007).
7. **Resilience & edges** — corrupted/missing worktree → main-checkout fallback; Playwright launch failure → fail closed; audited single-use bypass via the existing ledger bypass (FR-020); long/hanging suite reaches a definitive outcome.

## Complexity Tracking

No constitution violations — section intentionally empty.
