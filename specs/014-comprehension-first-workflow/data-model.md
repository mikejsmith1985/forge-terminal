# Phase 1 Data Model — Comprehension-First Workflow

**Feature**: `specs/014-comprehension-first-workflow` | **Date**: 2026-08-31

Four entities. Only the first is genuinely new; the rest extend or describe things that already
exist.

---

## Change Brief

The artefact the agent publishes when a change is complete. Stored renderer-independently so a
panel today and a browser page later read the same document (FR-026).

| Field | Type | Required | Purpose |
|---|---|---|---|
| `briefId` | string | yes | Stable identity, so a republish updates rather than duplicates |
| `sessionId` | string | yes | Which terminal session to render it in |
| `taskId` | string | yes | Ties the brief to the ledger entry that gates the commit |
| `headline` | string | yes | What changed, in one line a person would say out loud |
| `whatChanged` | panel | yes | The change itself, in the fewest words that survive |
| `whyItChanged` | panel | yes | The reason. A change with no stated reason is not understood |
| `whatCouldBreak` | panel | yes | Risk or assumption. Its own panel, never a clause |
| `decisions` | Decision[] | yes | May be empty **only** with `isRoutine` set |
| `isRoutine` | boolean | yes | A truthful claim that no real decision was made (FR-010) |
| `filesTouched` | int | yes | A count, deliberately not a list (FR-005) |
| `publishedAt` | timestamp | yes | Ordering and staleness |

**Validation**

- Every panel must be non-empty. An empty panel is the hollow-brief failure R7 exists to prevent.
- `decisions` may be empty **only** when `isRoutine` is true — the agent must claim routineness
  explicitly rather than omit the thinking silently.
- Panel text has an upper bound, so a brief cannot become the wall of text it replaces.
- `filesTouched` is a number: the brief names decisions, not files.

---

## Decision

One fork in the change, and the reason one way was taken. This is what converts review into
understanding (US2).

| Field | Type | Required | Purpose |
|---|---|---|---|
| `chose` | string | yes | The path taken |
| `insteadOf` | string | yes | The viable alternative not taken (FR-007) |
| `because` | string | yes | The reason, in plain words |
| `openQuestion` | string | yes | What the developer might reasonably challenge (FR-008) |

**Validation**: `insteadOf` may not be a restatement of `chose`; a decision with no genuine
alternative is not a decision and belongs to `isRoutine` instead.

---

## Ledger Entry *(extends an existing entity)*

The existing `.forge/workflow-ticket.json` ticket, unchanged in shape. This feature adds one gate
identifier and one entry to the required set.

| Change | Where |
|---|---|
| `GateBriefPublished = "brief-published"` | new constant beside the existing gate constants |
| Added to `RequiredGates` | the slice the pre-commit hook checks |

**State transition**: a commit is permitted only when every gate in `RequiredGates` appears in the
ticket. Adding one entry is the whole mechanism — the hook already refuses on a non-zero preflight
status, and the audited `FORGE_BYPASS` path still applies.

---

## Naming Rule Set

Describes what the checker enforces. Mechanical rules only; meaning is a human judgement routed to
the brief (FR-019).

| Rule | Permitted exception |
|---|---|
| No single-letter identifiers | `i`, `j`, `k` as loop iterators; `w`, `r` as HTTP handler parameters |
| Booleans prefixed `is`/`has`/`can`/`should`/`was` | none |
| Functions are verb-first | none |
| No magic numbers | named constants |

**Scope**: changed files only, and never generated, vendored or third-party paths (FR-017).

**Exception Record**: a bypass writes who allowed it and why to the existing `.forge/bypasses.log`,
so an override is visible rather than silent (FR-018).

---

## Format Rule Set *(advisory only)*

The response-style contract already in use: emoji section headers, dividers, tables for comparative
content, bullets, and a per-section cap of roughly 75 words.

**Deliberately not a gate.** Detection reads the scrollback buffer, which carries screen redraws
rather than a transcript, so a verdict is heuristic. A violation produces a warning and never
blocks (FR-024). This entity is recorded here so the asymmetry with the naming rules is explicit
rather than an apparent inconsistency.
