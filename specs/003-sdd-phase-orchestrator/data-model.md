# Phase 1 Data Model: SDD Phase Orchestrator

Entities are described at the design level (fields, relationships, rules). Backend types live in `internal/sdd`; the WebSocket/HTTP shapes are defined in `contracts/`.

## Entity: Phase

A stage of the pipeline. Fixed set of five, ordered.

| Field | Type | Notes |
|---|---|---|
| `name` | enum | `specify` · `clarify` · `plan` · `validate` · `implement` |
| `order` | int | 1–5, defines advancement sequence |
| `nextCommand` | string | Slash command injected to start this phase (e.g., `/speckit-plan`) |
| `completionSignal` | enum | `artifact-exists` · `content-marker` · `pty-quiet` (per research R3) |
| `expectedArtifact` | string \| null | Relative path under the feature dir (null for report-only Validate) |
| `isTerminal` | bool | True for `implement` — Approve closes the pipeline rather than advancing |

**Rules**: `validate` maps to the analyze gate (`completionSignal = pty-quiet`, `expectedArtifact = null`). The tasks step is folded into Plan→Implement and is not a Phase.

## Entity: PhaseArtifact

The file(s) a phase produced, captured at completion.

| Field | Type | Notes |
|---|---|---|
| `phase` | Phase.name | Owning phase |
| `path` | string | Absolute path of the primary artifact |
| `existsAndSettled` | bool | True once the watcher debounce elapsed (FR-002) |
| `relatedPaths` | string[] | Companion files (e.g., Plan's `research.md`, `contracts/`) |

## Entity: PhaseSummary

Deterministically derived card content (FR-017). Produced by the summarizer from artifacts — never generated.

| Field | Type | Notes |
|---|---|---|
| `headline` | string | One scannable line, e.g., "Plan ready · 3 contracts · 0 open clarifications" |
| `producedItems` | string[] | Short list of what was produced (max ~5; counts beyond are summarized) |
| `flags` | Flag[] | Risks/gaps (see below); empty list = clean |

### Sub-entity: Flag

| Field | Type | Notes |
|---|---|---|
| `kind` | enum | `unchecked-checklist` · `open-clarification` · `analyze-finding` · `missing-artifact` |
| `label` | string | Short human label, e.g., "2 checklist items unchecked" |
| `severity` | enum | `info` · `warn` · `block` (`missing-artifact` is `block`) |

## Entity: DecisionCard

The in-terminal review surface (one at a time — FR-014).

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique per gate occurrence |
| `sessionId` | string | Bound terminal session (research R9) |
| `phase` | Phase.name | Completed phase |
| `summary` | PhaseSummary | Status, produced items, flags |
| `actions` | enum[] | Always `[approve, reject, clarify]` (FR-006) |
| `status` | enum | `pending` · `resolved` |

## Entity: Decision

The developer's response; recorded for audit (FR-015).

| Field | Type | Notes |
|---|---|---|
| `phase` | Phase.name | Phase the decision applies to |
| `action` | enum | `approve` · `reject` · `clarify` |
| `clarifyText` | string \| null | Required when `action = clarify`; ≤ a short steer |
| `timestamp` | RFC3339 | When the decision was made |

**Rules**: `clarifyText` non-empty iff `action = clarify`. A `clarify` with empty text is rejected by the endpoint and leaves the card `pending` (FR-009 / US2 cancel scenario).

## Entity: NotificationEvent

The best-effort message sent to AzureWorkflowPOC (FR-011/012).

| Field | Type | Notes |
|---|---|---|
| `feature` | string | Feature directory name |
| `phase` | Phase.name | Completed phase |
| `artifactPath` | string | Primary artifact path |
| `timestamp` | RFC3339 | Completion time |

**Rules**: Sent exactly once per phase completion; delivery is best-effort and failure is logged, never surfaced (FR-012).

## Aggregate: PipelineState (orchestrator)

In-memory state machine; one instance per active pipeline (v1: single).

| Field | Type | Notes |
|---|---|---|
| `featureDir` | string | From `.specify/feature.json` |
| `sessionId` | string | Bound session (set on first gate) |
| `currentPhase` | Phase.name | Last completed / awaiting decision |
| `pendingCard` | DecisionCard \| null | Non-null while awaiting a decision |
| `status` | enum | `idle` · `awaiting-decision` · `advancing` · `rejected` · `complete` |
| `history` | Decision[] | Persisted to `~/.forge/sdd/<feature>.json` |

### State transitions

```text
idle
  └─(artifact for phase N settles)→ awaiting-decision  [build PhaseSummary, broadcast SDD_PHASE_GATE, fire NotificationEvent]
awaiting-decision
  ├─(approve)→ advancing  [inject Phase N+1 command]            → idle (waiting for N+1)
  ├─(clarify + text)→ advancing  [inject Phase N+1 command + steer] → idle
  ├─(clarify, empty text)→ awaiting-decision  [no-op, card stays]
  └─(reject)→ rejected   [stop; inject nothing]
advancing
  └─(terminal phase approved)→ complete
rejected / complete  → terminal (no auto-advance; new gate requires fresh run)
```

**Invariants**:
- At most one `pendingCard` (`status = awaiting-decision`) at any time (FR-014).
- No transition out of `awaiting-decision` occurs without an explicit Decision (FR-010).
- `NotificationEvent` failure never changes pipeline `status` (FR-012).
