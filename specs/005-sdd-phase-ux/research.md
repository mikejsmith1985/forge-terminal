# Research: SDD Phase UX — Glanceable State + Action Guidance

**Date**: 2026-06-16

## Findings

### R-001 — Run-count tracking location

**Decision**: In-memory counter on the `Orchestrator` struct (`phaseRunCounts map[PhaseName]int`), incremented inside `HandlePhaseComplete`.

**Why**: `HandlePhaseComplete` (`orchestrator.go:124`) is the single completion seam already shared by the card broadcaster and the AzureWorkflowPOC notifier. Incrementing a counter there requires no new events, no disk I/O, and no new goroutines. The counter lives exactly as long as the orchestrator (one per session), which matches the pipeline lifecycle.

**Alternatives rejected**:
- **Read `history.go` on each status broadcast**: adds disk I/O to a hot path and couples the display layer to the persistence layer — rejected.
- **New `SDD_PHASE_STARTED` WebSocket event from the PTY input path**: would require hooking terminal input (a separate subsystem from the completion seam), invasive and fragile — rejected.

---

### R-002 — `iterating` display state timing

**Decision**: Show `iterating` when `pipelineStatus == StatusAwaitingDecision && runCount ≥ 2`. This is at gate-card time for a re-run, not during the re-run execution.

**Why**: The watcher fires on artifact write (completion), not on command entry (start). There is no clean "phase started" event in the current architecture. The gate card is the observable moment where the distinction matters most to the user: "is this the gate for a first run or a re-run?" The `⚠ Redo` state covers the pre-re-run gap (`StatusRejected`), so all three ambiguous states are now separated:

| User-visible moment | Display status |
|---------------------|----------------|
| Phase rejected, not yet re-run | `⚠ Redo` (`rejected`) |
| Phase re-running, artifact not yet written | `⚠ Redo` (still `rejected` — no artifact event yet) |
| Phase artifact written for 2nd+ time, gate card open | `↻ Iterating` (`iterating`) |
| Phase approved on 2nd+ attempt | `✓ Done ×N` (`complete`, with counter) |

**Gap acknowledged**: There is no transition to an "in-progress" visual during re-run execution (between user typing `/speckit-{phase}` and the artifact appearing). This gap exists for first runs too (`pending → active` is currently inferred from the pipeline advancing to the next phase). Closing this gap would require a PTY-input hook, which is out of scope for this feature.

---

### R-003 — WebSocket payload extension strategy

**Decision**: Extend the existing `SDD_PHASE_STATUS` event payload by adding `runCount int` to `PhaseStatusEntry`. No new event type.

**Why**: The frontend already processes `SDD_PHASE_STATUS` in `useSddGate.js:59` and stores the result as `phaseStatuses`. Adding a field is backward-compatible: the frontend already spreads each entry into state; an absent `runCount` reads as `undefined`, which compares as `< 2` and correctly suppresses the counter display.

**Alternative rejected**: New `SDD_PHASE_RUN_COUNTS` event — unnecessary coupling; a single event carries everything the panel needs.

---

### R-004 — Action prompt placement

**Decision**: `ActionPromptStrip` is mounted in two places: (a) the `SddPipelinePanel` footer (always visible when panel is expanded), and (b) the `PhaseDecisionCard` footer (when card is open). The two instances receive the same `prompt` string, derived by the same `deriveActionPrompt` function.

**Why**: The panel footer gives context when no card is open. The card footer provides the "one sentence" at the decision point itself, where the user's attention is already directed. Using the same derivation function ensures consistency with no risk of the two prompts diverging.

**Architecture**: `App.jsx` calls `deriveActionPrompt(phaseStatuses, isCardOpen)` once and passes the result as a prop to both components. No duplicate logic.

---

### R-005 — Animation approach

**Decision**: Two CSS mechanisms, no JavaScript library:
1. `transition: color 200ms ease, background-color 200ms ease` on `.sdd-pipeline-panel__row` — animates every state change automatically on React's class-swap.
2. `@keyframes sdd-spin` applied to the icon `<span>` inside both `--active` (blue) and `--iterating` (amber) modifier classes — produces continuous rotation while either class is present. Colour is the only differentiator between the two spinning states (Q2 clarification, 2026-06-17).

**Why**: The project already uses BEM modifiers per display status. React's class-swap triggers the CSS transition automatically. Zero JavaScript animation code, zero new dependencies, no layout thrash. 200ms is perceptible without feeling sluggish at 60 fps. The keyframe spin for both states was chosen over spin-only-on-retry because a spinning icon universally signals "in progress" and the spec mandates a visible animation for both running states.

**Alternative rejected**: Spin only `--iterating`, leave `--active` static — would make a re-run feel more active than a fresh run, inverting expectation. `framer-motion` or similar — adds bundle weight for what is achievable in CSS alone.
