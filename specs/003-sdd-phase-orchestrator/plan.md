# Implementation Plan: SDD Phase Orchestrator with In-Terminal HITL Decision Cards

**Branch**: `feature/sdd-phase-orchestrator` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-sdd-phase-orchestrator/spec.md`

## Summary

Add an orchestrator that watches the active feature directory for Spec-Driven Development phase artifacts, and after each of the five gated phases (Specify, Clarify, Plan, Validate, Implement) presents a compact, scannable decision card inside the Forge Terminal UI. The card shows the completed phase, an output summary and flagged gaps **derived deterministically from the artifacts themselves**, and three actions: Approve (auto-advance the pipeline by injecting the next phase command into the terminal), Reject (stop), or Clarify (inject a steer before the next phase). On each phase completion the orchestrator also fires a best-effort HTTP POST to a locally configured AzureWorkflowPOC service.

**Technical approach**: This is overwhelmingly an integration of existing Forge subsystems (see Constitution Check → Framework-First). The advancement engine reuses the macro-injection path (`handlers_macro.go`); the watcher reuses the polling watcher (`internal/tutor/watcher.go`, whose 3s debounce satisfies "writes settle"); the card is pushed over the existing WebSocket hub (`broadcastJSON`) and rendered with the established styled-modal React pattern. Net-new code is a small phase state machine, a deterministic artifact summarizer, the decision-card component, and two thin HTTP endpoints.

## Technical Context

**Language/Version**: Go 1.21+ (backend, `internal/` + `cmd/forge/`); JavaScript / React 18 + Vite (frontend, `frontend/src/`)

**Primary Dependencies**: Existing Forge internals only — `internal/terminal` (WebSocket hub, PTY sessions), `cmd/forge/handlers_macro.go` (injection), `internal/tutor/watcher.go` (polling watcher); `gorilla/websocket` (already vendored); Go stdlib `net/http`. No new third-party dependency.

**Storage**: Decision history persisted as JSON under `~/.forge/sdd/<feature>.json` (runtime state, outside the committed `specs/` tree). Pipeline in-memory state held by the orchestrator.

**Testing**: Go table-driven unit tests (100% mocked, <10ms — Article V); frontend `vitest` for the card component and decision hook; Cypress + `cypress-real-events` UX test launched via `run-dev-clean.ps1` for the end-to-end gate flow.

**Target Platform**: Forge Terminal desktop application (Windows 11 primary, macOS) — web UI served locally by the Go binary.

**Project Type**: Web (Go backend + React frontend) within the existing Forge Terminal monorepo.

**Performance Goals**: Decision card appears within one debounce window (~3s) of artifact settle; card render is instant on message receipt; best-effort POST never adds perceptible latency to the card (fired in a background goroutine).

**Constraints**: One pending decision card at a time (FR-014); AzureWorkflowPOC POST is best-effort and MUST NOT block or delay the card (FR-012); no browser/external window (FR-004); card content derived from artifacts, no generative call (FR-017).

**Scale/Scope**: One active pipeline at a time (v1); five phases; a handful of new files plus wiring into existing handlers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| III — Branching | Work on a feature branch, PR to main | ✅ On `feature/sdd-phase-orchestrator` |
| IV — Code Quality | Self-documenting names, <40-line funcs, doc comments, no magic numbers | ✅ Enforced during implement |
| V — Testing | Three-layer (unit mocked <10ms · integration real · Cypress real-events); Red→Green | ✅ Test plan below; watcher/state-machine/summarizer unit-tested; gate flow via Cypress |
| VI — Documentation | CHANGELOG updated on behavior change; `specs/` tree exempt | ✅ CHANGELOG entry at implement |
| **VII — Framework-First** | Confirm framework provides capability before building | ✅ **See gate analysis below — PASS** |
| X — Verification | Behavior proven by evidence; terminal output read from xterm buffer model, not DOM | ✅ UX test asserts on `window.term.buffer.active` |
| XI — Output Restraint | At most one dashboard file; no unsolicited markdown summaries | ✅ No dashboard added |

Articles II (process protection), VIII (local release), IX (vault zero-knowledge) do not apply to this feature (no process kills, no release step, no secrets).

### Article VII — Framework-First Gate (PASS)

Each capability was checked against existing Forge subsystems before any custom design.

| Capability needed | Framework already provides? | Decision |
|---|---|---|
| Detect artifact writes / "writes settle" | **Yes** — `internal/tutor/watcher.go` (`Watcher`, polling + **3s debounce**) | **Reuse** the polling watcher scoped to the feature dir; the debounce satisfies FR-002. |
| Inject next-phase command into terminal | **Yes** — `cmd/forge/handlers_macro.go` (`handleMacro`, `waitForPTYQuiet`, `writeMacro`) | **Reuse** the injection path for auto-advance (FR-007). No new PTY-write code. |
| Push the card to the frontend | **Yes** — `internal/terminal/hub.go` (`broadcastJSON`) | **Reuse** with a new `SDD_PHASE_GATE` JSON message type. No new transport. |
| Render an in-app decision surface | **Yes** — styled modal/panel pattern (`FileAccessPrompt.jsx`, `isOpen`/`onChoice`) | **Reuse the pattern** to build the card component (UI is inherently feature-specific). |
| Best-effort outbound POST | **Yes** — `notifyHTTPClient` fire-and-forget (`handlers_notify.go`) | **Reuse the pattern** with a short-timeout client fired in a goroutine. |
| Register HTTP endpoints | **Yes** — stdlib mux in `cmd/forge/main.go` + `WrapWithMiddleware` | **Reuse** to add the decision endpoint. |

**Genuinely custom (with drift justifications):**

- **Phase state machine** (`internal/sdd/orchestrator.go`) — *Drift justification: no Forge subsystem or vendored framework models SDD-pipeline phase sequencing, the pending-decision gate, or approve/reject/clarify transitions. This is feature-specific domain logic.*
- **Artifact summarizer / flag extractor** (`internal/sdd/summary.go`) — *Drift justification: deterministically reading speckit artifacts (checklist pass/fail, `[NEEDS CLARIFICATION]` markers, analyze findings) into a card summary is domain-specific parsing with no framework equivalent; required by FR-017 (no generative call).*
- **`PhaseDecisionCard.jsx` + `useSddGate.js`** (frontend) — *Drift justification: the decision card's layout and the WS→POST decision loop are feature UI; they reuse the existing modal pattern and WebSocket dispatch rather than introducing new infrastructure.*

No Constitution violations require Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-sdd-phase-orchestrator/
├── plan.md              # This file
├── research.md          # Phase 0 — resolved unknowns & design decisions
├── data-model.md        # Phase 1 — entities & state
├── quickstart.md        # Phase 1 — runnable validation guide
├── contracts/           # Phase 1 — interface contracts
│   ├── sdd-decision-endpoint.md     # POST /api/sdd/decision (frontend → backend)
│   ├── sdd-phase-gate-event.md      # WebSocket SDD_PHASE_GATE message (backend → frontend)
│   └── azureworkflowpoc-notify.md   # POST to the external local service
└── checklists/
    └── requirements.md  # Spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

```text
internal/sdd/                         # NEW — orchestrator domain package
├── orchestrator.go                   # Phase state machine: track phase, hold pending gate, transitions
├── orchestrator_test.go              # Unit (mocked watcher/injector/notifier), <10ms
├── phases.go                         # Phase table: name, order, completion signal per phase
├── summary.go                        # Deterministic artifact → summary + flags
├── summary_test.go                   # Unit: golden artifacts → expected summary/flags
├── notifier.go                       # Best-effort AzureWorkflowPOC POST (goroutine, errors logged)
├── notifier_test.go                  # Unit: mock transport; verify payload + non-blocking
└── history.go                        # Decision history persistence (~/.forge/sdd/<feature>.json)

cmd/forge/
├── handlers_sdd.go                   # NEW — POST /api/sdd/decision; wires HTTP → orchestrator
├── handlers_sdd_test.go              # NEW — handler unit tests
└── main.go                           # MODIFIED — register /api/sdd/decision; construct orchestrator

internal/terminal/                    # MODIFIED (minimal)
└── hub.go                            # Reuse broadcastJSON for SDD_PHASE_GATE (no structural change)

frontend/src/
├── components/
│   ├── PhaseDecisionCard.jsx         # NEW — the scannable card (status · summary · flags · 3 actions)
│   ├── PhaseDecisionCard.css         # NEW — card styling (reuses modal/overlay tokens)
│   └── PhaseDecisionCard.test.jsx    # NEW — vitest: renders fields, fires onAction
├── hooks/
│   ├── useSddGate.js                 # NEW — handle SDD_PHASE_GATE WS msg; POST decision back
│   └── useSddGate.test.js            # NEW — vitest: dispatch → state; action → POST
└── App.jsx                           # MODIFIED — mount card beside active terminal, keyed by activeTabId

cypress/e2e/
└── sdd-phase-gate.cy.js              # NEW — UX: phase completes → card → approve advances (real events)
```

**Structure Decision**: Net-new backend domain logic lives in a dedicated `internal/sdd/` package (keeps the state machine, summarizer, notifier, and history isolated and unit-testable in line with Article V). The HTTP edge stays in `cmd/forge/handlers_sdd.go` next to its siblings. Frontend follows the existing `components/` + `hooks/` split. Existing subsystems (`handlers_macro.go`, `tutor/watcher.go`, `terminal/hub.go`) are reused without structural change.

## Complexity Tracking

No Constitution Check violations — this section is intentionally empty. The framework-first analysis kept custom code to feature-specific domain logic only; every infrastructure capability reuses an existing Forge subsystem.
