# Contract: GET /api/sdd/gate-check (modified — scoped)

The PreToolUse enforcement endpoint. **Change**: scope the check to one session instead of scanning all pipelines (fixes the global conflation in `handlers_sdd.go:131`).

## Request

```
GET /api/sdd/gate-check?sessionId=<FORGE_SESSION_ID>
```

| Param | Required | Rules |
|---|---|---|
| `sessionId` | yes (shipped hook always sends it) | The requesting tab's identity. |

## Behaviour

- Look up **only** `sddPipelineFor(sessionId)`. Return that pipeline's gate state.
- `sessionId` present but no bound pipeline → `{"isGateOpen": false}` (nothing to block; FR-011a unbound = SDD inactive).
- `sessionId` absent (legacy/transition only) → `{"isGateOpen": false}` and a logged warning. The shipped hook never omits it.
- MUST NOT `Range` over other sessions' pipelines (FR-005).

## Responses

| Status | Body |
|---|---|
| 200 | `{"isGateOpen": false}` |
| 200 | `{"isGateOpen": true, "phase": "plan"}` |

Always 200 so the hook parses without HTTP error handling.

## Hook contract (`sdd-gate-check.ps1`, modified)

1. Read stdin JSON; if `tool_input.skill` does not start with `speckit-` → `exit 0`.
2. Read `$env:FORGE_SESSION_ID`. If empty → `exit 0` (unbound tab, SDD inactive — FR-011a).
3. `GET /api/sdd/gate-check?sessionId=<id>`.
4. Unreachable backend → block (fail safe), as today.
5. `isGateOpen == true` → emit `permissionDecision: deny` JSON (or `exit 2`) naming the phase and pointing at the dashboard; else `exit 0`.

A companion call (or the same hook) POSTs `phase-event {event:"started"}` for the matched phase so the bar shows "running" the instant a phase begins.
