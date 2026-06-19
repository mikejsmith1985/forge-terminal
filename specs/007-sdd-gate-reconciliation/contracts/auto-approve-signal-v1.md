# Contract: Auto-Approve Skip Signal v1

**Feature**: 007-sdd-gate-reconciliation | **Date**: 2026-06-19
**Version**: v1 (initial)

This contract defines the protocol between a Speckit agent and the Forge Terminal SDD pipeline for signalling that an optional phase (currently: Clarify) does not require a gate decision.

---

## Signal

An agent that determines no changes are needed MUST output the following marker as the **last non-whitespace content** of its terminal response:

```
<!-- clarify:skip -->
```

**Properties**:
- Case-sensitive: must be exactly `<!-- clarify:skip -->` — no variations
- Position: must appear within the final 512 characters of the agent's PTY output for the phase (the `signalContentMarker` monitor scans the tail of the buffer)
- Invisible in rendered Markdown: the HTML comment renders as nothing in spec previews
- Safe in prose: the string does not clash with any standard Speckit output or CHANGELOG entry

---

## Detection

The backend `signalContentMarker` monitor for the Clarify phase watches for this exact string in the PTY output buffer. On detection:

1. The orchestrator marks the Clarify phase as complete with `ShouldAutoApprove = true`
2. The `SDD_PHASE_GATE` WebSocket message is emitted with:
   ```json
   {
     "type": "SDD_PHASE_GATE",
     "decisionCard": {
       "phase": "clarify",
       "shouldAutoApprove": true,
       "autoApproveAfterSeconds": 20,
       ...
     }
   }
   ```
3. The frontend starts a 20-second client-side countdown

---

## Frontend behaviour on receipt

| `shouldAutoApprove` | `autoApproveAfterSeconds` | Frontend renders |
|---|---|---|
| `false` | — | Standard gate card (Approve / Reject / Clarify) |
| `true` | `N > 0` | Countdown from N + single "Stop — I want to add input" veto button |

When the countdown reaches 0, the frontend submits an Approve decision identically to a manual Approve click.

---

## Agent authoring guide

A Clarify agent response that signals skip should end with:

```markdown
The specification is complete and unambiguous — no clarification is required.

<!-- clarify:skip -->
```

A Clarify agent response that made changes should NOT include the marker — the absence of the marker causes the standard gate card to appear and the developer reviews the changes before approving.

---

## Versioning

- **v1**: Initial definition. Single phase (Clarify) supported. Marker is a fixed string constant; no payload.
- Future versions may extend the marker with a phase name argument (e.g., `<!-- speckit:skip phase="validate" -->`) if other phases become auto-approvable.
