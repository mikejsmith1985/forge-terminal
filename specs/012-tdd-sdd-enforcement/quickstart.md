# Quickstart & Validation: Repeatable SDD — Deterministic Resume + Enforced TDD & Playwright UX

**Feature**: `012-tdd-sdd-enforcement` | **Date**: 2026-06-24

This guide validates the feature end-to-end. It does not contain implementation code — it is the
run/verify checklist. See [data-model.md](./data-model.md) and the
[contracts](./contracts/) for the rules being validated.

## Prerequisites

- Dev harness: `./run-dev-clean.ps1` (rebuilds frontend + Go, launches `forge-dev.exe` on port 9999). UX validation MUST use this, never a built binary (Article V).
- Go toolchain for unit/integration (`go test ./...`; integration via `-tags=integration`).
- Playwright installed (`@playwright/test`, repo root `playwright.config.js → tests/e2e`).

## Scenario 1 — No recursive nesting (US1, contract C2/C3, SC-002)

Goal: provisioning never produces `.forge/worktrees/X/.forge/worktrees/Y`.

1. Run the integration test that provisions an isolated worktree twice against a temp repo.
2. **Expected**: two **sibling** worktrees directly under `<main>/.forge/worktrees/`; zero nested levels.
3. **Expected**: `git.MainCheckout()` invoked from inside a linked worktree returns the **main** root, not the worktree.

```
go test -tags=integration ./cmd/forge/... -run Worktree_NoNesting
```

## Scenario 2 — Deterministic resume (US1, contract C5, SC-001/008)

Goal: a reopened session lands in the same directory; a vanished worktree falls back to main.

1. `./run-dev-clean.ps1`; open a tab, confirm cwd is the main checkout.
2. Opt into isolation (feature 011 action); confirm cwd is `<main>/.forge/worktrees/<token>`.
3. Restart the app (stop the dev PID, `./run-dev-clean.ps1 -NoBuild`); reopen the tab.
4. **Expected**: cwd is the **same** worktree path — read from `window.term.buffer.active`, not the DOM.
5. Remove that worktree on disk; restart; reopen.
6. **Expected**: cwd is the main checkout **and** one message states the prior worktree is gone — no new/nested dir.

```
npx playwright test tests/e2e/sdd-tdd-enforcement.spec.js -g "resume"
```

## Scenario 3 — TDD Red→Green gate (US2, contract C2, SC-003)

Goal: a behavior-changing phase cannot complete without a test that failed then passed.

1. Drive a phase that adds backend behavior with **no** test. Attempt completion.
2. **Expected**: phase is **blocked**, message: a failing-then-passing test is required.
3. Add a test; run it and observe it **fail** (records Red in the ledger); implement; run and observe **pass** (Green).
4. Attempt completion.
5. **Expected**: phase **passes**; the report card shows the Red and Green timestamps.
6. Reuse a pre-existing always-green test (no prior Red) for a new behavior. Attempt completion.
7. **Expected**: **blocked** — Green-without-Red does not satisfy TDD.

```
go test ./cmd/forge/... -run Verification_TDD
```

## Scenario 4 — Playwright UX gate (US3, contract C3, SC-004/005)

Goal: user-facing changes pass only on real-UI proof; grep/curl/200 are rejected; tooling failure fails closed.

1. Drive a user-facing (frontend) phase whose only evidence is `curl … → 200`. Attempt completion.
2. **Expected**: **blocked** as non-UX evidence.
3. Provide a Playwright test that drives the UI with real input and asserts on rendered output (xterm buffer for terminal). Run it green. Attempt completion.
4. **Expected**: **passes**; report card shows the UX result.
5. Make the Playwright launch fail (simulate harness unavailable). Attempt completion.
6. **Expected**: **blocked**, fail-closed message — never reported as passed.

```
go test ./cmd/forge/... -run Verification_UX
npx playwright test tests/e2e/sdd-tdd-enforcement.spec.js -g "ux gate"
```

## Scenario 5 — Honest failure + determinism (US4, contract C4/C5, SC-006/007)

1. Force a required test to fail mid-phase.
2. **Expected**: phase reported **not complete** with the failing output shown; no auto-advance.
3. Evaluate the same phase record twice.
4. **Expected**: identical decision both times.

```
go test ./cmd/forge/... -run Verification_Determinism
```

## Scenario 6 — Audited bypass (contract C6, FR-020)

1. Set `FORGE_BYPASS=1` and `FORGE_BYPASS_REASON="…"`; complete an otherwise-blocked phase.
2. **Expected**: completes; the bypass + reason appear in the report card and `.forge/bypasses.log`. No silent path exists without the env vars.

## Done when

- [ ] Scenarios 1–6 pass.
- [ ] `go test ./...` and `go test -tags=integration ./...` green.
- [ ] `npx vitest run` (frontend) green.
- [ ] `npx playwright test tests/e2e/sdd-tdd-enforcement.spec.js` green.
- [ ] This feature's own implementation passed the gates it introduces (dogfooded).
