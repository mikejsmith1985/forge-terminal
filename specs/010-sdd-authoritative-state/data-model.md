# Phase 1 Data Model: SDD Authoritative State & Concise Phase Reports

**Feature**: 010-sdd-authoritative-state
**Date**: 2026-06-21

Entities below describe state and message shapes. Field names are indicative; the implementation follows existing Go/JSON conventions in `internal/sdd` and `cmd/forge`.

---

## Entity: PhaseEvent (new)

The authoritative signal emitted at a phase boundary. Replaces inference as the primary state driver.

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | From `$env:FORGE_SESSION_ID`. Required. Scopes the event to one pipeline. |
| `phase` | string | One of: specify, clarify, plan, tasks, validate, implement. |
| `event` | enum | `started` \| `complete`. |
| `decisions` | string[] | Present on `complete`. Short, command-emitted (FR-007a). Empty list allowed. |
| `repoRoot` | string | Optional; used to validate the event targets the bound repo. |

**Lifecycle**: `started` → orchestrator `MarkPhaseRunning` + capture baseline snapshot (R5). `complete` → orchestrator `HandlePhaseComplete` + build report card + open gate.

**Validation**: An event whose `sessionId` has no bound pipeline is ignored (FR-011) — it never creates or mutates another session's state.

---

## Entity: SessionIdentity (new, implicit)

The stable per-tab identifier propagated into the shell environment.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Equals `NewTerminalSession(id)` and frontend `activeTabId`. |
| `boundRepoRoot` | string | Set on `/api/sdd/bind`. |
| `isBound` | bool | False when identity injection failed → "unbound — SDD inactive" (FR-011a). |

**Injection points**: Unix `cmd.Env`; Windows per-ConPTY write (R3).

---

## Entity: PipelineState (modified — `internal/sdd/types.go`)

Existing struct; add a baseline snapshot and surface the run count for the card.

| Field | Type | Status | Notes |
|---|---|---|---|
| `FeatureDir` | string | existing | |
| `SessionID` | string | existing | Now guaranteed to equal the injected identity. |
| `CurrentPhase` | PhaseName | existing | |
| `PendingCard` | *DecisionCard | existing | Now carries a `PhaseReportCard`. |
| `Status` | PipelineStatus | existing | idle/running/awaiting-decision/advancing/rejected/complete. |
| `PhaseBaseline` | string | **new** | git commit-ish captured at `started` (R5). Per current phase. |
| `RunCount` | map[PhaseName]int | existing/surfaced | Drives "iterating ×N" on the card. |

---

## Entity: PhaseReportCard (new — replaces verbose gate document)

Carried inside the `SDD_PHASE_GATE` envelope; rendered as grouped bullets.

| Field | Type | Notes |
|---|---|---|
| `phase` | string | |
| `files` | FileChange[] | Files touched in the phase window (FR-014). May be empty → "No files changed" (US3 #4). |
| `scope` | string | One-line scope summary (command-emitted or derived). |
| `decisions` | string[] | From PhaseEvent.decisions. Group omitted if empty (FR-007a). |
| `runCount` | int | ≥2 → show "iteration ×N". |
| `fullOutputRef` | string | Path/anchor to the verbose artifact for the opt-in "View full output" (FR-009). |

### Sub-entity: FileChange

| Field | Type | Notes |
|---|---|---|
| `path` | string | Repo-relative. |
| `added` | int \| null | Null → magnitude unavailable (FR-013). |
| `removed` | int \| null | Null → magnitude unavailable. |

**Rendering rule (FR-008)**: essential content targets ≤100 words. Long file lists truncate to top-N with "+N more"; full list available via the opt-in action. Truncation never drops the scope or decisions groups.

---

## State transitions (authoritative path)

```
idle
  │  PhaseEvent{started}            → capture PhaseBaseline
  ▼
running (CurrentPhase)
  │  PhaseEvent{complete}           → build PhaseReportCard (git --numstat vs PhaseBaseline)
  ▼
awaiting-decision (PendingCard + card)   ← gate-check scoped to THIS sessionId blocks next phase
  │  POST /api/sdd/decision (approve)→ inject next command, advance
  │  (reject)                       → rejected, no injection
  │  (clarify)                      → inject next command + steering text
  ▼
running (next phase)  …  → complete
```

**Fallback path (FR-002)**: if a `complete` event is missed, `ReconcileFromDisk` on the next broadcast converges `CurrentPhase` to disk truth; the card for that phase is built from the file-watcher set with magnitude "unavailable". (Disk reconciliation is the sole fallback — the Stop hook is out of scope.)

---

## Scoping invariants (the conflation fix)

1. Every `PhaseEvent`, gate-check, decision, and broadcast carries a `sessionId` and touches **only** `sddPipelineFor(sessionId)`.
2. `GET /api/sdd/gate-check` returns the open-gate status of **one** pipeline (the requesting session), never a `Range` over all (FR-005).
3. WebSocket envelopes are delivered only to the owning session's hub (existing `BroadcastJSONToSession`) and filtered client-side by `sessionId` (existing `useSddGate`).
4. An unbound session (`isBound == false`) participates in none of the above and shows "SDD inactive" (FR-011a).
