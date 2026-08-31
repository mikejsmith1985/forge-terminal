# UI Contract: SddDashboard Component (spec-006)

**Version**: v1 | **Date**: 2026-06-18 | **Status**: Draft

This contract defines the props interface of `SddDashboard`, the data it reads from `useSddGate`,
and the callbacks it invokes. It is the agreement between `App.jsx` (caller) and `SddDashboard`
(callee). Backend wire format is unchanged — see `data-model.md`.

---

## SddDashboard Props

```
SddDashboard({
  phases:         PhaseStatusEntry[],   // live phase statuses from useSddGate.phaseStatuses
  featureName:    string,               // active feature name from useSddGate.featureName ("")
  phaseSummaries: Record<string, PhaseSummary>, // accumulated gate summaries from useSddGate
  isCardOpen:     boolean,              // whether a gate is open (useSddGate.isCardOpen)
  card:           DecisionCard | null,  // the open gate card, or null
  decisionError:  string | null,        // error from last decision submission
  isSubmitting:   boolean,              // POST in flight
  onAction:       (action: string, clarifyText?: string) => void, // calls sddGate.submitDecision
  onDismiss:      () => void,           // calls sddGate.dismiss
  onFileOpen:     (file: {path: string, name: string}) => void,   // calls handleFileOpen
})
```

### Prop Invariants

| Prop | Guaranteed by caller |
|---|---|
| `phases` | Never undefined; empty array when no pipeline is bound |
| `featureName` | Never undefined; empty string when no pipeline is bound |
| `phaseSummaries` | Never undefined; empty object initially |
| `card` | Non-null only when `isCardOpen` is true |
| `onAction` | Always a function; never null |
| `onDismiss` | Always a function; never null |
| `onFileOpen` | Always a function; never null |

---

## useSddGate Return Interface — Changes in spec-006

The hook gains two new fields. All existing fields are unchanged.

```
useSddGate({ activeSessionId }) → {
  // --- Existing (unchanged) ---
  card:           DecisionCard | null
  isCardOpen:     boolean
  decisionError:  string | null
  isSubmitting:   boolean
  phaseStatuses:  PhaseStatusEntry[]
  handleWsMessage: (rawData: string) => void
  submitDecision:  (action: string, clarifyText?: string) => Promise<void>
  dismiss:         () => void

  // --- New in spec-006 ---
  featureName:     string          // "" when no pipeline bound; populated from SDD_PHASE_STATUS
  phaseSummaries:  Record<string, PhaseSummary>  // keyed by phase name; ref-backed, not reactive
}
```

### featureName update rule

Updated whenever a `SDD_PHASE_STATUS` event arrives with `sessionId === activeSessionId`.
Value is `event.feature` (the base name of the feature directory).
Reset to `""` when the session changes.

### phaseSummaries accumulation rule

Updated whenever a `SDD_PHASE_GATE` event arrives with `sessionId === activeSessionId`.
The gate's `summary` field is stored at `phaseSummaries.current[event.phase]`.
Never cleared during a session — once a phase summary is received it remains available for
the detail strip even after the gate is closed and the phase is marked complete.

---

## App.jsx Render Changes

**Before spec-006** (`fix/sdd-phase-ux-bugs` branch):
```jsx
<PhaseDecisionCard
  isOpen={sddGate.isCardOpen}
  phase={sddGate.card?.phase}
  summary={sddGate.card?.summary}
  actions={sddGate.card?.actions}
  onAction={(action, clarifyText) => sddGate.submitDecision(action, clarifyText)}
  onDismiss={sddGate.dismiss}
  decisionError={sddGate.decisionError}
  isSubmitting={sddGate.isSubmitting}
  artifactPreview={sddGate.card?.artifactPreview ?? null}
  phases={sddGate.phaseStatuses}
/>
<SddPipelinePanel
  phases={sddGate.phaseStatuses}
  isVisible={true}
  isCardOpen={sddGate.isCardOpen}
/>
```

**After spec-006**:
```jsx
<SddDashboard
  phases={sddGate.phaseStatuses}
  featureName={sddGate.featureName}
  phaseSummaries={sddGate.phaseSummaries}
  isCardOpen={sddGate.isCardOpen}
  card={sddGate.card}
  decisionError={sddGate.decisionError}
  isSubmitting={sddGate.isSubmitting}
  onAction={(action, clarifyText) => sddGate.submitDecision(action, clarifyText)}
  onDismiss={sddGate.dismiss}
  onFileOpen={handleFileOpen}
/>
```

Two components become one. Both `import` statements for `PhaseDecisionCard` and `SddPipelinePanel`
are removed; a single `import SddDashboard` replaces them.

---

## ClarifyModal Native Dialog Contract

`ClarifyModal` is a named export from `SddDashboard.jsx` for isolated testing.

```
ClarifyModal({
  isOpen:     boolean,           // when true, dialog.showModal() is called
  onConfirm:  (steer: string) => void,  // fires with trimmed text; never empty
  onCancel:   () => void,
})
```

The `<dialog>` element ref is managed by `useEffect`: `isOpen` true → `dialog.showModal()`,
`isOpen` false → `dialog.close()`. Escape closes the dialog and calls `onCancel`.
Confirm button disabled until `steer.trim().length > 0`.

---

## ActionPromptStrip — No Change

`ActionPromptStrip` is reused unchanged. `SddDashboard` passes through:
```jsx
<ActionPromptStrip phases={phases} isCardOpen={isCardOpen} />
```
Same contract as before. No modification to `ActionPromptStrip.jsx`.
