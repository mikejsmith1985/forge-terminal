# Implementation Plan: Recovery-First Worktrees — Re-attach by Default, Provision Only on Explicit Opt-In

**Branch**: `feature/013-worktree-recovery-first` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-worktree-recovery-first/spec.md`

## Summary

Invert the worktree design so **recovery is the default and worktree creation is explicit**. Today `handleSddBind` (`cmd/forge/sdd_wiring.go:201`) eager-binds every tab the moment the frontend reports its directory, and `resolveSddWorkspace` (`cmd/forge/sdd_worktree.go:82-99`) **auto-provisions a worktree whenever another pipeline already runs in the same repo**. That is why a second tab on a busy repo silently spawns `.forge/worktrees/...` — and why specs/012 (which only fixed the *already-inside-a-worktree* re-attach branch and recursive nesting) never stopped the reported symptom.

This feature makes three changes against existing seams:

1. **Remove concurrency-as-a-trigger.** `resolveSddWorkspace` stops provisioning on concurrency. A bind defaults to the directory the session is recovered to, or the main checkout — never a freshly created worktree (FR-001, FR-003).
2. **Make recovery durable and server-authoritative.** Persist a small per-session binding record (`sessionId → worktreePath/branch/base`) under `~/.forge/sdd/`. On bind, re-attach from that record when the worktree still exists; fall back to the main checkout with one message when it does not (FR-002, FR-004, FR-005). This removes recovery's hidden dependence on the frontend re-reporting the worktree cwd after restart.
3. **Provision only on explicit consent.** Add a deliberate provision-on-request path: a proactive **per-tab action** (`POST /api/sdd/worktree`) and a reactive **collision prompt** pushed over the existing WS hub when a genuine second concurrent SDD pipeline is detected. Both reuse `provisionWorktreeForSession` + `assertNoNesting` + `MainCheckout` unchanged (FR-007–FR-011).

The guarantee is certified by a **Playwright behavioral test** that opens N tabs through real input, reads each tab's directory from `window.term.buffer.active`, and asserts the on-disk directory count is unchanged — demonstrated Red (fails on today's auto-provision) → Green (passes after the fix) per Article X and FR-014–FR-017.

## Technical Context

**Language/Version**: Go (backend: `cmd/forge`, `internal/git`, `internal/sdd`); JavaScript/React (frontend: `frontend/src`); PowerShell (dev harness, hooks).

**Primary Dependencies**: existing only (Framework-First, Article VII) — the `git` CLI worktree wrapper (`internal/git/worktree.go`: `MainCheckout`, `WorktreeAdd`, `WorktreeList`, `CurrentBranch`); the per-session pipeline model and bind seam (`handleSddBind` / `resolveSddWorkspace` / `startSddPipeline`); the WebSocket hub (`termHandler.BroadcastJSONToSession`) already used to push `SDD_PHASE_GATE`; the tab model and `useSddGate`/`useTabManager` hooks; the Playwright harness (`playwright.config.js`, `tests/e2e/`, `tests/fixtures/forge.js`) launched via `run-dev-clean.ps1`. No new runtime libraries.

**Storage**: git itself (worktree registry); the existing in-memory `sddPipelines` `sync.Map` for live session→pipeline binding; **one new tiny persisted file** `~/.forge/sdd/worktree-bindings.json` (the durable session→worktree record that makes recovery survive restart). No database.

**Testing**: Go unit (mocked git/runner, <10 ms) for the recovery-first resolver, the no-auto-provision guarantee, and the binding store load/save/evict; Go integration (real `git worktree` on a temp repo) proving repeated binds create zero worktrees and that an explicit request creates exactly one un-nested worktree; **Playwright UX** (via `run-dev-clean.ps1`, reading `window.term.buffer.active`) proving N tabs → 0 new directories and that recovery re-lands a tab in its prior directory. Red→Green→Refactor, with the directory-counting test demonstrated to fail against the pre-fix behavior (FR-016).

**Target Platform**: Windows 11 desktop (primary; ConPTY tab restoration is the fragile case this feature hardens); Unix path kept correct.

**Project Type**: Desktop application (Go backend + React frontend in a web/Electron shell).

**Performance Goals**: a resumed tab re-attaches and is usable within 10 s of an app update (SC-005); the binding-store read on the bind path is a single small-file read and adds no perceptible latency.

**Constraints**: localhost-only, no new auth; retrofit-in-place (extend the bind seam and the git wrapper, do not fork them); the binding file lives under the already-gitignored `~/.forge/`; never destroy unmerged work (the existing `safeCleanupWorktree` is unchanged); never wildcard-kill processes (Article II); provisioning happens **only** on explicit consent — there is no silent path.

**Scale/Scope**: a handful of tabs and at most a few concurrent worktrees per repo; a single local developer; the six-phase speckit pipeline.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| I — Prime Directive (BEST route) | Fixes the true root cause (concurrency-triggered auto-provision at the bind seam) and makes recovery durable rather than accidental, instead of patching the symptom. | PASS |
| II — Process Protection | No process kills introduced; provisioning/cleanup target specific paths and branches. | PASS (enforced in tasks) |
| III — Branching | Work on `feature/013-worktree-recovery-first`; reintegrates via PR. | PASS |
| IV — Code Quality | Self-documenting names, file purpose comments, functions <40 lines, guard clauses; thin additions to the bind seam, a small store, and one endpoint. | PASS (enforced in tasks) |
| V — Testing (three-layer) | Unit (mocked git) <10 ms, integration (real worktree), Playwright UX via `run-dev-clean.ps1`; Red→Green→Refactor enforced — including the directory-counting test shown Red against the current behavior. | PASS |
| VI — Documentation | CHANGELOG.md updated in the PR; `specs/013/` is the exempt pipeline artifact. | PASS |
| VII — Framework-First | Reuses the git wrapper, the bind seam, the WS hub, the tab hooks, and the Playwright harness. New units are justified in research.md (R1–R5): the binding store, the provision-on-request endpoint, the collision prompt, the per-tab action, the behavioral test. | PASS |
| VIII — Release | Local pipeline only (`scripts/local-release.ps1`). | PASS |
| IX — Vault Zero-Knowledge | No secrets involved. | N/A |
| X — Verification & Proof | The guarantee is proven by a Playwright test reading `window.term.buffer.active` and counting directories on disk — never grep/curl/compiles. This feature's own acceptance is gated on that test passing (FR-017). | PASS |
| XI — Output/Dashboard Restraint | Reuses the existing binding indicator and gate-card surfaces; adds only the collision prompt and a per-tab action; no new dashboard files; no phase-name narration. | PASS |

**No violations** → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/013-worktree-recovery-first/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R5
├── data-model.md        # Phase 1 — entities & state transitions
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   ├── recovery-first-binding.md   # bind defaults to recover; never auto-provisions; durable re-attach
│   └── explicit-worktree-optin.md  # proactive per-tab action + reactive collision prompt; consent-only
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root) — touch points

```text
cmd/forge/
├── sdd_worktree.go        # resolveSddWorkspace: DELETE the concurrency→provision branch (lines ~82-99);
│                          #   default to recovered dir or main checkout. ADD provisionWorktreeOnRequest
│                          #   (explicit-consent provisioning, reusing MainCheckout + assertNoNesting +
│                          #   provisionWorktreeForSession). KEEP reattach + no-nesting (specs/012).
├── sdd_binding_store.go   # NEW — durable session→worktree record: load/save/lookup/evict over
│                          #   ~/.forge/sdd/worktree-bindings.json. Makes recovery survive restart (FR-002/004).
├── sdd_wiring.go          # handleSddBind: consult the binding store first (re-attach if the worktree
│                          #   still exists); detect a genuine concurrent-pipeline collision and push the
│                          #   collision prompt; persist the binding when an isolated worktree is created.
└── handlers_sdd.go        # NEW endpoint POST /api/sdd/worktree (explicit provision-on-request) +
                           #   the collision-prompt envelope type; route registration.

internal/git/
└── worktree.go            # unchanged (MainCheckout, WorktreeAdd, WorktreeList already present).

frontend/src/
├── App.jsx                # keep the bind effect; add handler to call POST /api/sdd/worktree from the
│                          #   per-tab action and to render the collision prompt from the WS message.
├── components/
│   ├── TabBar.jsx         # per-tab "Isolate this tab / New isolated workspace" action (FR-007).
│   └── SddDashboard.jsx   # render the collision prompt (offer isolate / stay shared) (FR-003).
└── hooks/useSddGate.js    # carry the collision-prompt message + isolate-request call into UI state.

tests/e2e/
└── worktree-recovery.spec.js  # NEW — N tabs → 0 new directories (reads window.term.buffer.active),
                               #   recovery re-lands a tab in its prior dir, explicit action creates exactly
                               #   one un-nested worktree. Demonstrated Red→Green (FR-014-017).
```

**Structure Decision**: Web/desktop split (Go backend + React frontend). Almost all change retrofits the existing bind seam and tab model. The genuinely new units are `cmd/forge/sdd_binding_store.go` (durable recovery record), `provisionWorktreeOnRequest` + the `POST /api/sdd/worktree` handler (explicit consent), the collision-prompt envelope, the per-tab UI action, and one Playwright spec — consistent with retrofit-in-place and Framework-First.

## Implementation Sequencing (for /speckit-tasks)

Ordered by the spec's priorities and risk:

1. **Behavioral proof harness first, demonstrated Red (US4 / P1, FR-014–017)** — `tests/e2e/worktree-recovery.spec.js`: open N tabs on one repo via real input, read each tab's cwd from `window.term.buffer.active`, snapshot the on-disk directory set before/after, assert unchanged. Run it against the **current** behavior and capture the failure (proves the test detects the regression). This is the Red that everything else turns Green.
2. **Remove concurrency-as-a-trigger (US1 / P1, FR-001/003)** — delete the concurrency→provision branch in `resolveSddWorkspace`; a bind defaults to the recovered directory or the main checkout. Unit-test that two binds on the same repo produce zero worktrees; integration-test the same against a real temp repo. This alone turns the directory-count test Green.
3. **Durable recovery binding store (US2 / P1, FR-002/004/005)** — `sdd_binding_store.go` + `handleSddBind` consulting it: re-attach from the persisted record when the worktree exists; fall back to the main checkout with one message when it is gone. Unit-test load/save/evict and the missing-worktree fallback; Playwright-prove a tab recovers to its prior directory across a restart.
4. **Explicit proactive opt-in (US3 / P2, FR-007/008/009/010/011)** — `provisionWorktreeOnRequest` + `POST /api/sdd/worktree` + the per-tab TabBar action + isolation indicator. Reuses `MainCheckout`/`assertNoNesting`/`provisionWorktreeForSession`; persists the new binding (step 3). Integration-prove exactly one un-nested worktree; Playwright-prove the action isolates only the requesting tab.
5. **Reactive collision prompt (US3 / P2, FR-003)** — detect a genuine second concurrent SDD pipeline on the same checkout (shared `workflow-ticket.json` risk) and push a prompt over the WS hub; provision only on explicit confirm, else stay shared. Playwright-prove the prompt appears and that dismissing it creates nothing.
6. **Honest acceptance (US4 / P1, FR-017)** — wire the feature's own completion to the passing behavioral run; surface no "fixed" claim without the Green directory-count evidence recorded.
7. **Edge & resilience** — corrupted/missing worktree → main-checkout fallback; provision failure → stay on main with a message, never a half-made dir; rapid concurrent tab opens → no tab slips into provisioning; pre-existing auto-created worktrees remain recoverable and safely reclaimable (existing sweep untouched).

## Complexity Tracking

No constitution violations — section intentionally empty.
