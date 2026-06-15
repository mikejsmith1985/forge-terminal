# Contract: `POST /api/sdd/bind` (frontend → backend)

Binds a terminal session and its repository to the SDD pipeline. This endpoint exists because
the backend does **not** track a per-session working directory — only the frontend knows the
active session and the directory it is running in. The frontend therefore tells the backend
which session runs the pipeline and where, and the backend resolves the active feature from
that repository's `.specify/feature.json`. Registered in `cmd/forge/main.go` via
`WrapWithMiddleware`; handled in `cmd/forge/sdd_wiring.go`.

## Request

`POST /api/sdd/bind`
`Content-Type: application/json`

```json
{
  "sessionId": "tab-3-abc123",
  "repoRoot": "C:/ProjectsWin/forge-terminal"
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| `sessionId` | string | yes | The terminal session that runs the pipeline (advances inject into it). |
| `repoRoot` | string | yes | Absolute path of the repository whose pipeline to gate. |

## Behavior

On a valid request the backend:
1. Resolves the active feature directory from `repoRoot/.specify/feature.json` (`feature_directory`).
2. Constructs the orchestrator (live injector + broadcaster) for that feature and session.
3. Starts a `tutor.Watcher` on `repoRoot`; the detector loop gates recognized phase artifacts.
4. Replaces any previously bound pipeline (the prior watcher is stopped) — consistent with the
   single-active-pipeline assumption (v1).

The frontend calls this automatically when the active session's working directory is known;
it is safe to call broadly because repos not running a Spec Kit pipeline return `409`.

## Responses

| Status | Meaning | Body |
|---|---|---|
| `200 OK` | Pipeline bound. | `{ "status": "bound", "feature": "003-sdd-phase-orchestrator" }` |
| `400 Bad Request` | `sessionId` or `repoRoot` missing, or invalid JSON. | `{ "error": "..." }` |
| `409 Conflict` | No active feature — `repoRoot/.specify/feature.json` not found. | `{ "error": "..." }` |
| `401 Unauthorized` | Auth middleware rejected the request. | — |

## Notes

- Binding is idempotent per `(sessionId, repoRoot)`: the frontend de-dupes and only re-binds
  when the pair changes.
- A failed bind never blocks the terminal — the frontend fires it best-effort.
