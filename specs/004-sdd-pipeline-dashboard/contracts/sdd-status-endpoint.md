# Contract: GET /api/sdd/status

**Method**: GET  
**Auth**: Same-origin (cookie), same as all other `/api/sdd/*` routes  
**When called**: Once on `SddPipelinePanel` mount; WebSocket events maintain state thereafter  

## Request

```
GET /api/sdd/status?sessionId=tab-1
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `sessionId` | Yes | The active terminal tab's session ID |

## Response — pipeline active (200)

```jsonc
{
  "sessionId": "tab-1",
  "feature":   "004-sdd-pipeline-dashboard",
  "phases": [ /* same PhaseStatusEntry[] array as SDD_PHASE_STATUS event */ ]
}
```

## Response — no pipeline bound (200, not 404)

```jsonc
{
  "sessionId": "tab-1",
  "feature":   "",
  "phases": []
}
```

Empty `phases` signals "no active pipeline" — the panel shows an idle state.  
A 404 would require the frontend to special-case errors; an empty payload is cleaner.

## Response — missing sessionId (400)

```jsonc
{ "error": "sessionId is required" }
```
