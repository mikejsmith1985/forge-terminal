# Contract: `SDD_PHASE_GATE` WebSocket Event (backend → frontend)

Pushed over the existing per-session WebSocket hub (`internal/terminal/hub.go` → `broadcastJSON`) when a phase completes and a decision is required. Reuses the established parse-by-`type` dispatch on the frontend.

## Direction

Backend → Frontend (one per phase completion).

## Message shape

```json
{
  "type": "SDD_PHASE_GATE",
  "sessionId": "tab-3-abc123",
  "cardId": "gate-plan-1718402000",
  "phase": "plan",
  "summary": {
    "headline": "Plan ready · 3 contracts · 0 open clarifications",
    "producedItems": ["plan.md", "research.md", "data-model.md", "3 contracts", "quickstart.md"],
    "flags": [
      { "kind": "unchecked-checklist", "label": "2 checklist items unchecked", "severity": "warn" }
    ]
  },
  "actions": ["approve", "reject", "clarify"]
}
```

## Field rules

| Field | Rule |
|---|---|
| `type` | Always `"SDD_PHASE_GATE"`. |
| `sessionId` | The bound terminal session (research R9). The frontend renders the card only for the matching active tab. |
| `cardId` | Unique per gate; echoed back in the decision POST for correlation. |
| `phase` | One of `specify · clarify · plan · validate · implement`. |
| `summary.headline` | Single scannable line. MUST be present. |
| `summary.producedItems` | ≤ ~5 entries; larger sets are summarized (counts), never dumped (Edge Case: scannability). |
| `summary.flags` | Possibly empty (clean phase). `severity: "block"` indicates a missing/empty artifact (FR-013). |
| `actions` | Always exactly `["approve","reject","clarify"]` (FR-006). |

## Frontend handling

- `useSddGate` listens for `type === "SDD_PHASE_GATE"`, stores the card, and shows `PhaseDecisionCard` beside the active terminal (FR-004).
- Only one card is shown at a time; a new gate for the same session replaces/queues per FR-014 (backend guarantees one pending at a time, so replacement should not occur in practice).
