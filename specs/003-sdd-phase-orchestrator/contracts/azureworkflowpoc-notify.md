# Contract: AzureWorkflowPOC Notification (backend → external local service)

The single external dependency (FR-011). Fired once per phase completion, best-effort and non-blocking (FR-012). Implemented in `internal/sdd/notifier.go` using a dedicated short-timeout `http.Client` (modeled on `notifyHTTPClient`), invoked in a background goroutine.

## Direction

Forge backend → local AzureWorkflowPOC service.

## Configuration

| Setting | Source | Default |
|---|---|---|
| Endpoint URL | env var `FORGE_SDD_NOTIFY_URL` | `http://localhost:7000/sdd/phase` |
| Client timeout | constant | 5s |

## Request (sent by Forge)

`POST {FORGE_SDD_NOTIFY_URL}`
`Content-Type: application/json`

```json
{
  "feature": "003-sdd-phase-orchestrator",
  "phase": "plan",
  "artifactPath": "specs/003-sdd-phase-orchestrator/plan.md",
  "timestamp": "2026-06-14T22:15:00Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `feature` | string | Feature directory name. |
| `phase` | string | Completed phase name. |
| `artifactPath` | string | Repo-relative path to the primary artifact. |
| `timestamp` | RFC3339 | Phase completion time. |

## Expected response (from AzureWorkflowPOC)

Any `2xx` is treated as delivered. Forge **ignores the response body**.

## Failure handling (Forge side)

- Connection refused, timeout, DNS failure, or any non-2xx → log to `~/.forge/logs/` and drop.
- MUST NOT block, delay, or suppress the decision card or pipeline (FR-012, SC-004).
- No retry in v1 (best-effort by spec).

## Guarantees

- Exactly one POST attempt per phase completion.
- No secrets are included (Article IX not implicated — payload is non-sensitive metadata).
