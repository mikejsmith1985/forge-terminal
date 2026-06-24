# Phase 1 Data Model: Repeatable SDD — Deterministic Resume + Enforced TDD & Playwright UX

**Feature**: `012-tdd-sdd-enforcement` | **Date**: 2026-06-24

Entities are described in domain terms. Field names are indicative; they retrofit the existing
`sddPipeline` (`cmd/forge/sdd_wiring.go:72-91`), the report card (`cmd/forge/sdd_report_card.go`),
and the workflow ledger (`.forge/workflow-ticket.json`) rather than introducing a new store.

---

## Entity: SessionBinding

The durable association between a terminal session and the absolute directory it operates in,
used to re-attach deterministically after restart.

| Field | Type | Rule |
|---|---|---|
| `sessionId` | string | Stable per-tab identity (e.g. `tab-4-…`). Key. |
| `boundDir` | absolute path | The directory the session runs in: the **main checkout** or a specific worktree path. Never a path nested under another worktree. |
| `mainCheckout` | absolute path | First entry of `git worktree list --porcelain`; the floor for fallback. |
| `isIsolated` | bool | True only when `boundDir` is a worktree distinct from `mainCheckout`. |

**Validation**
- `boundDir` MUST NOT contain `/.forge/worktrees/.../.forge/worktrees/` (no nesting — FR-003).
- On restart: if `boundDir` is absent from the live worktree list and is not `mainCheckout`, re-attach to `mainCheckout` and emit one fallback message (FR-004).

**Transitions**
```
bind            → boundDir = mainCheckout (default; opt-in isolation handled by feature 011)
opt-in isolate  → boundDir = <main>/.forge/worktrees/<token>   (anchored to mainCheckout, R1)
restart resume  → boundDir valid?  yes → re-attach unchanged
                                    no  → boundDir = mainCheckout (+ fallback message)
```

---

## Entity: BehaviorClassification

The decision of which gates apply to a completing phase, derived from its changed files.

| Field | Type | Rule |
|---|---|---|
| `behaviorChanging` | bool | True if any non-test source file changed (`cmd/forge/**`, `internal/**`, `frontend/src/**`). Ambiguous ⇒ true (fail safe). |
| `userFacing` | bool | True if any non-test `frontend/src/**` file changed (UI surface). |
| `exemptReason` | string | Non-empty only for docs-only or pure-refactor/test-only phases; recorded and shown. |

**Derivation**: pure function of the report card's `[]sddFileChange` (already computed at the completion seam). No external input.

---

## Entity: PhaseVerificationRecord

The evidence set a completing phase carries, evaluated by the gate and shown in the report card.

| Field | Type | Rule |
|---|---|---|
| `phase` | string | The phase being completed (e.g. `implement`). |
| `classification` | BehaviorClassification | From the classifier. |
| `redObserved` | timestamp? | When a relevant test was observed **failing** (ledger `test-failed-first`). Required if `behaviorChanging` and not exempt. |
| `greenObserved` | timestamp? | When tests were observed **passing** (ledger `tests-passed`). Must be **after** `redObserved`. |
| `uxResult` | {passed: bool, ran: bool, output: string}? | Playwright run result. Required if `userFacing`. `ran=false` ⇒ fail closed. |
| `bypass` | {reason: string}? | Present only when an audited bypass was used (ledger bypass log). |

**Validation**
- `behaviorChanging && !exempt` ⇒ `redObserved` and `greenObserved` present with `redObserved < greenObserved` (FR-007/008).
- `userFacing` ⇒ `uxResult.ran && uxResult.passed` (FR-012/015); `uxResult.ran == false` ⇒ block (FR-016).
- Non-UX-only evidence (grep/curl/status/compile) never satisfies `uxResult` (FR-013).

---

## Entity: GateDecision

The deterministic verdict for a completing phase.

| Value | Meaning | Effect |
|---|---|---|
| `pass` | All applicable evidence present and passing. | Phase completes; record shown in card. |
| `block` | A required check is missing, failed, or could not run. | Phase stays open; failing output shown (FR-017/018). |
| `exempt` | Docs-only / refactor-only with a recorded reason. | Phase completes; exemption shown. |

**Determinism (FR-019/SC-007)**: `GateDecision = f(PhaseVerificationRecord)` is pure — identical records yield identical decisions. A `bypass` present converts a would-be `block` to `pass` while keeping the bypass visible.

**State flow at the completion seam** (`applySddPhaseEvent` "complete"):
```
classify → assemble PhaseVerificationRecord → decide
  pass | exempt → HandlePhaseComplete()  (gate card opens as today)
  block         → do NOT complete; surface record + reason; phase remains active for fix-and-retry
```

---

## Relationships

```
SessionBinding 1───1 sddPipeline (existing)         # boundDir == pipeline.repoRoot
sddPipeline    1───* PhaseVerificationRecord         # one per completing phase
PhaseVerificationRecord 1───1 BehaviorClassification
PhaseVerificationRecord 1───1 GateDecision (derived)
PhaseVerificationRecord ──reads── workflow ledger (.forge/workflow-ticket.json)   # Red/Green + bypass
PhaseVerificationRecord ──reads── Playwright result (tests/e2e run)                # uxResult
```

No new persisted store: SessionBinding lives in the existing `sddPipelines` map plus git's worktree
list; verification evidence lives in the existing workflow ledger and the Playwright run output.
