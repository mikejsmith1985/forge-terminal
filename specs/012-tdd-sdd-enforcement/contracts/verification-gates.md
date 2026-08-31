# Contract: Verification Gates — TDD (Red→Green) & Playwright UX

**Feature**: `012-tdd-sdd-enforcement` | Covers US2/US3/US4, FR-006–FR-020, SC-003–SC-007

This contract governs the phase-completion gate. It is evaluated server-side at the completion seam
(`applySddPhaseEvent` "complete", before `HandlePhaseComplete`). Evidence is read from the existing
workflow ledger (`.forge/workflow-ticket.json`) and the Playwright run output. The decision is a
**pure function** of the assembled `PhaseVerificationRecord` (determinism, FR-019).

---

## C1 — Behavior classification gates the requirements

**Given** a completing phase with a known set of touched files,
**when** the gate evaluates,
**then** it classifies `{behaviorChanging, userFacing, exemptReason}` from the file list.
`userFacing` is true for frontend surfaces **and** backend paths that alter user-visible output
(terminal/prompt text, gate/report messages). **Both** axes fail safe: an ambiguous change is treated
as `behaviorChanging` **and** `userFacing`, so it can skip neither gate (FR-006/FR-011/R4).
`exemptReason` is set only by the classifier (docs/refactor/test-only surfaces), never self-asserted.

## C2 — TDD Red→Green gate (behavior-changing phases)

**Given** `behaviorChanging && exemptReason == ""`,
**when** the gate evaluates,
**then** it requires the ledger to show a test **observed failing** (`test-failed-first`, Red) with a
timestamp **earlier** than the test **observed passing** (`tests-passed`, Green).

- Missing Red, or Green-without-prior-Red ⇒ **block** with "a failing-then-passing test is required" (FR-007/008, SC-003).
- A documentation-only or refactor/test-only phase with a recorded `exemptReason` ⇒ **exempt** (FR-009).

## C3 — Playwright UX gate (user-facing phases)

**Given** `userFacing == true`,
**when** the gate evaluates,
**then** it requires a Playwright result with `ran == true && passed == true` from the `tests/e2e` harness
(launched via `run-dev-clean.ps1`), where terminal-output assertions read `window.term.buffer.active`
(Article X), not the DOM.

- Evidence consisting solely of text-search / HTTP request / HTTP status / log / compile success ⇒ **block** as non-UX (FR-013, SC-004).
- `ran == false` (Playwright could not launch) ⇒ **block**, fail closed (FR-016) — never interpreted as pass.
- Failing UX test ⇒ **block** with the failing output surfaced (FR-015).
- **Buffer-read trust boundary (FR-014)**: terminal-output UX tests MUST use the shared e2e buffer-reading fixture (`tests/fixtures/forge.js` → `window.term.buffer.active`). The gate treats use of that fixture as the buffer-read evidence; a passing test that bypasses the fixture to assert on the DOM is a reviewable violation, surfaced by a polish-phase lint task, not a silent pass.

## C4 — Honest reporting

**Given** any required check did not run or did not pass,
**when** the gate evaluates,
**then** the phase is **never** reported complete; it stays open for fix-and-retry and the actual
failing output is shown (FR-017/018, SC-006).

## C5 — Determinism

**Given** the same `PhaseVerificationRecord`,
**when** the gate evaluates any number of times,
**then** it yields the same `GateDecision` (FR-019, SC-007).

## C6 — Audited bypass (escape hatch)

**Given** a genuine emergency,
**when** the developer sets the existing ledger bypass (`FORGE_BYPASS=1` + `FORGE_BYPASS_REASON`),
**then** a would-be `block` becomes `pass`, the bypass + reason are recorded to `.forge/bypasses.log`
and shown in the report card (FR-020). No silent path around the gate exists.

---

## Decision table

| classification | Red→Green | UX result | bypass | Decision |
|---|---|---|---|---|
| docs/refactor (exempt) | — | — | — | `exempt` |
| behaviorChanging, !userFacing | present, ordered | n/a | — | `pass` |
| behaviorChanging, !userFacing | missing | n/a | — | `block` |
| userFacing | present, ordered | ran & passed | — | `pass` |
| userFacing | present, ordered | non-UX only / not run / failed | — | `block` |
| any required missing | — | — | set + reason | `pass` (audited) |

## Acceptance checks (map to tasks/tests)

| Check | Type | Asserts |
|---|---|---|
| Classifier labels code/docs/test-only/UI file sets correctly; ambiguous ⇒ behaviorChanging | Go unit | C1 |
| Behavior phase with no Red ledger entry ⇒ block | Go unit | C2 |
| Green-without-prior-Red ⇒ block | Go unit | C2 |
| Red-then-Green ⇒ pass | Go unit | C2 |
| User-facing phase with only a curl/200 evidence ⇒ block | Go unit | C3, FR-013 |
| User-facing phase with passing Playwright (buffer-read) ⇒ pass | Playwright + Go unit | C3 |
| Playwright cannot launch ⇒ block (fail closed) | Go unit | C3, FR-016 |
| Failed required check never yields complete | Go unit | C4 |
| Same record ⇒ same decision across repeated evaluation | Go unit | C5 |
| Bypass converts block→pass and is logged/shown | Go unit | C6 |
