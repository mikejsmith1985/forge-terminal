# Contract — `change_brief_publish` MCP tool

**Feature**: `specs/014-comprehension-first-workflow`

The interface an agent uses to publish a change brief. This is the whole reason the feature is
enforceable: Forge receives exactly what the agent sent rather than guessing at terminal output.

Provider-agnostic by construction — MCP is spoken by every CLI under consideration (research R6),
so nothing here is specific to one assistant.

---

## Tool

**Name**: `change_brief_publish`

**Description**: Publish a visual change brief for a completed code change. Records the
`brief-published` gate and renders the brief in Forge Terminal.

**Implements**: the existing `ToolHandler` interface — `Definition()` and `Execute(args)` — as used
by `internal/mcp/tools_workflow_gate.go`.

---

## Input

| Argument | Type | Required | Notes |
|---|---|---|---|
| `taskId` | string | yes | Ties the brief to the ledger entry gating the commit |
| `headline` | string | yes | One line a person would say out loud |
| `whatChanged` | string | yes | Non-empty |
| `whyItChanged` | string | yes | Non-empty |
| `whatCouldBreak` | string | yes | Non-empty; a risk or an explicit "nothing, because …" |
| `isRoutine` | boolean | yes | An explicit claim that no real decision was made |
| `decisions` | array | conditional | Required unless `isRoutine` is true |
| `filesTouched` | integer | yes | A count, not a list |
| `sessionId` | string | effectively yes | The calling tab's `FORGE_SESSION_ID`. Names both the panel that renders the brief and the project it is filed under; omitted, the brief is stored and gated but rendered nowhere, and the result says so |

Each entry in `decisions`:

| Field | Type | Required |
|---|---|---|
| `chose` | string | yes |
| `insteadOf` | string | yes |
| `because` | string | yes |
| `openQuestion` | string | yes |

---

## Behaviour

1. Validate the brief. A missing or empty required panel is **rejected**, not stored — a hollow
   brief would turn the gate into a formality (research R7).
2. Persist it under `.forge/`, keyed by `briefId`, in a renderer-independent form.
3. Record the `brief-published` gate against `taskId` in the existing ticket ledger.
4. Push it to the frontend over `BroadcastJSONToSession` as message type `CHANGE_BRIEF`.
5. Return success, with the `briefId`.

Republishing the same `briefId` **updates** the brief rather than creating a second one, so a
correction does not litter the panel.

---

## Errors

| Condition | Result |
|---|---|
| A required panel is empty | Rejected, naming the empty field |
| `decisions` empty and `isRoutine` false | Rejected — the agent must claim routineness explicitly |
| `insteadOf` restates `chose` | Rejected — that is not an alternative |
| No terminal session to render into | **Stored and gated anyway**, with a warning; the gate must not depend on the UI being present (spec edge case) |

---

## What this contract deliberately does not do

- It does not accept prose to be parsed. Free text is a panel's content, never the structure.
- It does not judge whether a brief is *good*. That is the developer's job, which is the point of
  showing it to them.
- It does not block on rendering. A brief that cannot be displayed is still recorded, so the
  commit gate stays truthful when the panel is unavailable.
