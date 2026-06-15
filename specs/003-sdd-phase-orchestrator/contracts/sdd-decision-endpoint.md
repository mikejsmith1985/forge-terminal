# Contract: `POST /api/sdd/decision` (frontend → backend)

Submits the developer's decision for a pending phase gate. Registered in `cmd/forge/main.go` via `WrapWithMiddleware` (auth applied), handled in `cmd/forge/handlers_sdd.go`, forwarded to the `internal/sdd` orchestrator.

## Request

`POST /api/sdd/decision`
`Content-Type: application/json`

```json
{
  "sessionId": "tab-3-abc123",
  "cardId": "gate-plan-1718402000",
  "phase": "plan",
  "action": "approve",
  "clarifyText": null
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| `sessionId` | string | yes | Must match the bound pipeline session. |
| `cardId` | string | yes | Must match the current pending card; a stale `cardId` is rejected (409). |
| `phase` | string | yes | Must equal the pending card's phase. |
| `action` | string | yes | `approve` · `reject` · `clarify`. |
| `clarifyText` | string \| null | conditional | Required and non-empty when `action = "clarify"`; otherwise null/omitted. |

## Responses

| Status | Meaning | Body |
|---|---|---|
| `200 OK` | Decision accepted and applied. | `{ "status": "advancing" \| "rejected" \| "complete" }` |
| `400 Bad Request` | Invalid action, or `clarify` with empty text (US2 cancel leaves card pending). | `{ "error": "..." }` |
| `409 Conflict` | No pending card, or `cardId`/`phase` does not match the current gate. | `{ "error": "..." }` |
| `401 Unauthorized` | Auth middleware rejected the request. | — |

## Behavior

- `approve` → orchestrator injects the next phase command into `sessionId` via the macro-injection path (research R2); responds `advancing` (or `complete` if the phase was terminal).
- `clarify` (non-empty) → injects the next phase command with the steer appended; responds `advancing`.
- `reject` → sets pipeline `rejected@phase`, injects nothing; responds `rejected`.
- Every accepted decision is appended to the decision history (`~/.forge/sdd/<feature>.json`, FR-015).
- The endpoint never blocks on the AzureWorkflowPOC notification (that fires at completion time, not decision time).
