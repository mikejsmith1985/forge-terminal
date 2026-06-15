# Contract: SDD_PHASE_GATE Event (v2)

**Type**: WebSocket message (JSON)  
**Direction**: Backend → Frontend (broadcast to session)  
**Replaces**: `sdd-phase-gate-event.md` from specs/003  
**Breaking change**: No — `artifactPreview` is an additive optional field

## Envelope schema

```jsonc
{
  "type": "SDD_PHASE_GATE",

  // --- DecisionCard fields (unchanged from v1) ---
  "cardId":    "gate-plan-1718430000000000000",
  "sessionId": "tab-1",
  "phase":     "plan",
  "summary": {
    "headline":      "Plan phase complete — 7 tasks across 3 user stories.",
    "producedItems": ["plan.md"],
    "flags":         []
  },
  "actions": ["approve", "reject", "clarify"],

  // --- NEW in v2 ---
  "artifactPreview": {
    "content":     "# Implementation Plan: SDD Pipeline Dashboard\n...",
    "totalLines":  312,
    "filePath":    "plan.md",
    "isTruncated": true
  }
  // artifactPreview is OMITTED (not null) for pty-quiet phases (validate, implement)
  // artifactPreview is { content: "", filePath: "...", isTruncated: false, totalLines: 0 }
  //   when the artifact cannot be read (file missing / read error)
  //   — frontend distinguishes missing vs present via content === "" check
}
```

## Constraints

- `artifactPreview.content` contains at most `sddArtifactMaxLines` (default 200) lines.  
- When `isTruncated` is true, `totalLines` tells the frontend how many lines were omitted.  
- `filePath` is the feature-relative path (e.g. `plan.md`, `spec.md`) — not an absolute path.  
- The field is omitted entirely (Go `omitempty`) when the phase has `ExpectedArtifact == ""`.
