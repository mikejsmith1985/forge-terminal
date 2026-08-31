# Quickstart — proving the comprehension-first workflow works

**Feature**: `specs/014-comprehension-first-workflow` | **Date**: 2026-08-31

Five scenarios. Each is a thing that must be *observed*, not asserted — Article X. The first two
are the ones that matter: if the gate has no teeth, nothing else in this feature does anything.

---

## Prerequisites

```powershell
go build ./...                        # backend compiles
cd frontend; npx vitest run           # frontend unit suite green
./run-dev-clean.ps1                   # dev instance on :9999, isolated from production :3005
```

Never run these against the production instance on `:3005`.

---

## Scenario 1 — A commit with no brief is refused

**The whole feature in one test.** If this passes, comprehension is genuinely required.

```bash
# In a scratch repository with the Forge hook installed:
git checkout -b test/no-brief
echo "change" >> some_source_file.go
git add -A
git commit -m "test: a change nobody explained"
```

**Expected**: the commit is **refused**. The message names `brief-published` among the missing
gates, and points at the tool that records it.

**Fails if**: the commit succeeds. That means the gate is decorative and the feature has not
shipped, whatever else works.

---

## Scenario 2 — Publishing a brief unblocks the commit

Publish a brief through the tool, then retry the same commit.

**Expected**: the ticket now records `brief-published`, and the commit proceeds.

**Also check**: republishing with the same `briefId` updates the brief rather than creating a
second one.

---

## Scenario 3 — A hollow brief is rejected

Publish a brief with an empty `whatCouldBreak`, then one with `decisions: []` and `isRoutine:
false`.

**Expected**: both are **rejected at publish time**, naming the offending field. No gate is
recorded, so the commit stays refused.

**Why this matters**: a gate that an empty artefact satisfies is a formality, and this feature
exists because a formality already failed once.

**Then check the legitimate case**: a brief with `isRoutine: true` and no decisions is **accepted**
— a truthful claim that a change was mechanical is allowed, and visible for the developer to
challenge.

---

## Scenario 4 — The brief appears as a billboard, not a wall of text

Publish a brief while the dev instance is running, and look at the panel.

**Expected**:

- The panel appears within about a second, without a reload.
- **No panel requires scrolling.**
- Body text is readable from normal seating distance.
- The risk panel is visually distinct from the rest, not a sentence inside a paragraph.
- Each decision ends in a question or an explicit assumption.

**Then reload the page.** The brief is still there — the pending-brief restore, mirroring the SDD
gate card's behaviour.

**Read the terminal state from the buffer model** (`window.term.buffer.active`), never the DOM.

---

## Scenario 5 — Naming is gated; prose is only warned

Two halves, deliberately unequal.

**Naming (hard):** commit a change introducing `n` as a variable outside a loop.

**Expected**: the commit is **refused**, naming the identifier and its location. Then confirm a
generated or vendored file with the same violation is **skipped** (FR-017), and that
`FORGE_BYPASS=1` with a reason overrides and writes to `.forge/bypasses.log`.

**Prose (soft):** cause a long, unformatted response.

**Expected**: a **warning appears and nothing is blocked**. Then confirm the reverse: a false
positive must also cost only a warning. A detector reading screen redraws cannot be trusted to
block, and this scenario exists to prove it never does.

---

## What "done" looks like

| # | Scenario | Must show |
|---|---|---|
| 1 | No brief | Commit **refused** |
| 2 | Brief published | Commit allowed |
| 3 | Hollow brief | **Rejected**; routine brief accepted |
| 4 | Panel | Legible at a glance, survives reload |
| 5 | Naming vs prose | Naming blocks; prose only warns |

Scenario 1 is the acceptance test for the feature as a whole. The rest are how it is worth using.
