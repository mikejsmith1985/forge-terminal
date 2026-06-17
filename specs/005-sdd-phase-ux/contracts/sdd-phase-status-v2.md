# Contract: SDD_PHASE_STATUS v2

**Date**: 2026-06-16
**Extends**: specs/004-sdd-pipeline-dashboard/contracts/sdd-phase-status-event.md

## Change summary

The `SDD_PHASE_STATUS` WebSocket message gains one new field on each `PhaseStatusEntry`:
`runCount` (integer, ≥ 0). The `displayStatus` enum gains one new value: `"iterating"`.

Both changes are backward-compatible: existing frontend code that does not read `runCount`
continues to work correctly, and a frontend that does not handle `"iterating"` falls back to
the default icon (same as `"active"` before this change).

## Message shape

```json
{
  "type": "SDD_PHASE_STATUS",
  "sessionId": "<session-uuid>",
  "feature": "<feature-dir-basename>",
  "phases": [
    {
      "phase": "specify",
      "order": 1,
      "displayStatus": "complete",
      "artifactPath": "spec.md",
      "decidedAt": "2026-06-16T10:00:00Z",
      "runCount": 1
    },
    {
      "phase": "clarify",
      "order": 2,
      "displayStatus": "iterating",
      "artifactPath": "spec.md",
      "decidedAt": null,
      "runCount": 2
    },
    {
      "phase": "plan",
      "order": 3,
      "displayStatus": "pending",
      "artifactPath": "plan.md",
      "decidedAt": null,
      "runCount": 0
    },
    {
      "phase": "validate",
      "order": 4,
      "displayStatus": "pending",
      "artifactPath": "",
      "decidedAt": null,
      "runCount": 0
    },
    {
      "phase": "implement",
      "order": 5,
      "displayStatus": "pending",
      "artifactPath": "",
      "decidedAt": null,
      "runCount": 0
    }
  ]
}
```

## `displayStatus` enum (complete)

| Value | Icon | Colour class | Meaning |
|-------|------|--------------|---------|
| `pending` | `◌` | `--pending` (grey) | Not started |
| `active` | `⟳` | `--active` (blue, animated spinner) | Running first time |
| `awaiting-decision` | `⏳` | `--awaiting` (amber) | Gate card open, first run |
| `complete` | `✓` | `--complete` (green) | Approved |
| `rejected` | `⚠` | `--rejected` (amber) | Rejected, awaiting re-run |
| `iterating` | `↻` | `--iterating` (amber, animated spinner) | Gate card open, re-run |

## `runCount` field

- `0` — phase has never completed (pending/active/never-reached)
- `1` — completed once (no counter shown in UI)
- `N ≥ 2` — completed N times; UI shows `×N` suffix

## Backward-compatibility guarantee

- Consumers that do not read `runCount` are unaffected.
- Consumers that do not handle `"iterating"` display status will fall back to the default
  icon/colour (same behaviour as `"active"` in spec-004). No UI breakage.
- The `GET /api/sdd/status` recovery endpoint returns the same extended shape.
