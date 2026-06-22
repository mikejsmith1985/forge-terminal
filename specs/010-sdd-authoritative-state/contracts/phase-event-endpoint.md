# Contract: POST /api/sdd/phase-event (new)

The authoritative phase-signal intake. Replaces file-watcher inference as the primary driver of pipeline state.

## Request

```
POST /api/sdd/phase-event
Content-Type: application/json
```

```json
{
  "sessionId": "<FORGE_SESSION_ID>",
  "phase": "plan",
  "event": "started | complete",
  "decisions": ["Chose retrofit over rewrite", "..."],
  "repoRoot": "C:/ProjectsWin/forge-terminal"
}
```

| Field | Required | Rules |
|---|---|---|
| `sessionId` | yes | Must match a bound pipeline. If unknown → 200 with `{"status":"ignored"}` (FR-011; never mutates another session). |
| `phase` | yes | Known phase name; otherwise 400. |
| `event` | yes | `started` or `complete`. |
| `decisions` | only on `complete` | Array of short strings; `[]` allowed. Ignored on `started`. |
| `repoRoot` | no | If present and mismatched with the bound repo → 409. |

## Behaviour

- `event=started`: orchestrator `MarkPhaseRunning(phase)`; capture `PhaseBaseline` (git snapshot, R5); broadcast `SDD_PHASE_STATUS`.
- `event=complete`: build `PhaseReportCard` (diff vs `PhaseBaseline`, attach `decisions`); orchestrator `HandlePhaseComplete(phase)`; open gate; broadcast `SDD_PHASE_GATE` + `SDD_PHASE_STATUS`.
- Idempotent: a duplicate `complete` for the same phase+run does not open a second gate (matches existing double-approval guard).

## Responses

| Status | Body | When |
|---|---|---|
| 200 | `{"status":"accepted"}` | Event applied. |
| 200 | `{"status":"ignored"}` | `sessionId` not bound (graceful, never errors the agent). |
| 400 | `{"error":"..."}` | Missing/invalid `phase` or `event`. |
| 409 | `{"error":"..."}` | `repoRoot` mismatch. |

Always localhost-only; no auth (consistent with existing SDD endpoints).
