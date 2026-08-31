# Contract: SDD_PHASE_STATUS Event

**Type**: WebSocket message (JSON)  
**Direction**: Backend → Frontend (broadcast to session)  
**When sent**: After every `HandlePhaseComplete` call AND after every decision is applied

## Envelope schema

```jsonc
{
  "type":      "SDD_PHASE_STATUS",
  "sessionId": "tab-1",
  "feature":   "004-sdd-pipeline-dashboard",
  "phases": [
    {
      "phase":         "specify",
      "order":         1,
      "displayStatus": "complete",
      "artifactPath":  "spec.md",
      "decidedAt":     "2026-06-15T14:00:00Z"
    },
    {
      "phase":         "clarify",
      "order":         2,
      "displayStatus": "complete",
      "artifactPath":  "spec.md",
      "decidedAt":     "2026-06-15T14:05:00Z"
    },
    {
      "phase":         "plan",
      "order":         3,
      "displayStatus": "awaiting-decision",
      "artifactPath":  "plan.md",
      "decidedAt":     null
    },
    {
      "phase":         "validate",
      "order":         4,
      "displayStatus": "pending",
      "artifactPath":  "",
      "decidedAt":     null
    },
    {
      "phase":         "implement",
      "order":         5,
      "displayStatus": "pending",
      "artifactPath":  "",
      "decidedAt":     null
    }
  ]
}
```

## `displayStatus` values

| Value | Meaning |
|-------|---------|
| `pending` | Phase not yet reached |
| `active` | Command injected; pty-quiet waiter is running (pty-quiet phases only) |
| `awaiting-decision` | Artifact detected (or pty-quiet fired); gate card is pending |
| `complete` | Developer approved |
| `rejected` | Developer rejected; pipeline stopped |

## Constraints

- All five phases are always present in order.  
- `decidedAt` is a RFC3339 timestamp string when a decision was made, `null` otherwise.  
- `artifactPath` is the feature-relative artifact path for file-detected phases, `""` for pty-quiet phases.
