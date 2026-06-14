# Phase 0 Research: SDD Phase Orchestrator

All unknowns from the plan's Technical Context and the items deferred from `/speckit-clarify` are resolved below. Each entry records the **Decision**, **Rationale**, and **Alternatives considered**.

## R1 — Artifact detection / "writes settle"

**Decision**: Reuse the existing polling watcher `internal/tutor/watcher.go` (`Watcher`, `Notifications()` channel), instantiated against the active feature directory. Treat a phase as complete when a recognized artifact for that phase appears or changes and the watcher's debounce window elapses. If importing the `tutor` package from `internal/sdd` proves awkward, relocate the generic `Watcher` to a neutral package (`internal/fswatch`) consumed by both — **without** writing a second polling loop.

**Rationale**: The watcher already polls (2s) and **debounces (3s)**, which is exactly the "writes settle before firing" requirement (FR-002). `.md` is already a tracked extension. Reusing it honors Framework-First and avoids a duplicate watch implementation.

**Alternatives considered**: `fsnotify` OS-level watcher — rejected: new dependency, and the existing debounced poller already satisfies the requirement with no added latency that matters at human-decision timescales.

## R2 — Auto-advance mechanism (FR-007)

**Decision**: On Approve (or Clarify-confirm), the orchestrator advances by issuing the next phase's slash command into the bound terminal session through the existing macro-injection path (`cmd/forge/handlers_macro.go` — `waitForPTYQuiet` + `writeMacro`). The injected payload is the next command (e.g., `/speckit-plan`), with any Clarify steer appended on its own line.

**Rationale**: The macro injector already solves PTY cold-start races, bracketed-paste vs chunked mode, and output-quiet detection (the same path hardened earlier in this project). Reinventing PTY writes would reintroduce those exact failure modes.

**Alternatives considered**: Raw PTY write from the orchestrator — rejected: loses quiet-detection and mode handling. A new "run command" API — rejected: duplicates the macro endpoint.

## R3 — Per-phase completion signal (the key design decision)

Not every phase writes a brand-new file, so detection is defined per phase rather than as a single "new file" rule. Because the orchestrator is the active controller (R2), it always knows **which phase it just launched**, which disambiguates detection.

**Decision** — completion-signal table:

| Phase | Primary completion signal |
|---|---|
| Specify | `spec.md` exists and contains the mandatory sections (User Scenarios, Requirements, Success Criteria). |
| Clarify | `spec.md` is modified and now contains a `## Clarifications` section with a dated `### Session` entry. |
| Plan | `plan.md` exists (Phase 1 siblings `research.md` / `data-model.md` / `contracts/` may accompany it). |
| Validate | `/speckit-analyze` is report-only (writes no artifact); completion is detected via PTY-quiet on the launched analyze command (reuse `waitForPTYQuiet`), and the report text is captured for the card summary. |
| Implement | Implement writes code rather than a `specs/` artifact, so — like Validate — completion is detected via **PTY-quiet** after the launched implement command settles (reuse `waitForPTYQuiet`). The Implement card is the **terminal** gate (Approve closes the pipeline rather than advancing). |

> **U1 resolution (analyze remediation)**: the Implement signal was previously vague ("tasks.md exists / items addressed"). It is now concrete: PTY-quiet detection, identical mechanism to Validate. Both report-only/code-producing phases share the same non-file completion path.

> **U2/U3 resolution (analyze remediation)**: detection is split into a **file-based** detector (Specify/Clarify/Plan) and a **PTY-quiet** detector (Validate/Implement); pipeline-to-session binding (R9) is its own concrete step that records the bound `sessionId` on the first gate. See tasks T010/T012.

> **I1 resolution (analyze remediation)**: "phase completion detected" is a shared seam. The orchestrator's `HandlePhaseComplete` (Foundational) records the completion and emits it to subscribers; the card (US1) and the notification (US3) each subscribe independently, so US3 no longer depends on US1.

**Rationale**: Keys each phase off the most reliable observable signal. Clarify and Validate are the two that do not produce a fresh file, and both are handled explicitly (content predicate for Clarify; reuse of the existing PTY-quiet primitive for Validate). This avoids requiring changes to the upstream speckit skill commands in v1.

**Alternatives considered**: A uniform `specs/NNN/.sdd/<phase>.done` marker file emitted by each speckit command — cleaner and fully uniform, but requires modifying every speckit skill to write the marker (larger blast radius). Recorded as the recommended v2 hardening; not required for v1.

## R4 — Card delivery to the frontend (FR-004)

**Decision**: Broadcast a new JSON message `{"type":"SDD_PHASE_GATE", ...}` over the existing per-session WebSocket hub (`internal/terminal/hub.go` → `broadcastJSON`). The frontend's existing `onmessage` dispatch (parse-by-`type`) routes it to the new `useSddGate` hook, which renders `PhaseDecisionCard` beside the active terminal.

**Rationale**: Reuses the production WebSocket transport and the established type-dispatch convention; no new socket, endpoint, or polling.

**Alternatives considered**: Server-Sent Events or a new polling endpoint — rejected: duplicates existing push infrastructure.

## R5 — Decision submission (FR-006/007/008/009)

**Decision**: Add `POST /api/sdd/decision` (frontend → backend), registered in `main.go` via `WrapWithMiddleware`. Body: `{ sessionId, phase, action: "approve"|"reject"|"clarify", clarifyText? }`. The handler forwards to the orchestrator, which performs the transition (advance via R2 / stop / advance-with-steer).

**Rationale**: One small, auth-wrapped endpoint mirrors existing handler style (`handlers_notify.go`, `handlers_commands`). Keeps decision authority server-side where the state machine lives.

**Alternatives considered**: Sending the decision back over the WebSocket — viable, but a request/response HTTP call gives a clean ack and error surface for the card.

## R6 — Summary & flags extraction (FR-017)

**Decision**: A deterministic summarizer reads the completed phase's artifacts and produces (a) a one-to-three-line output summary and (b) a list of flagged gaps. Sources by phase:

- **Checklist results** — count of `- [ ]` (unchecked) vs `- [x]` items in `checklists/requirements.md`; any unchecked item becomes a flag.
- **`[NEEDS CLARIFICATION]` markers** — any remaining marker in `spec.md` becomes a flag.
- **Analyze findings** — for Validate, parse the analyze report's findings/severities into flags.
- **Missing-artifact** — if the expected artifact is absent/empty, emit a single prominent flag (FR-013).

The summary is a count-and-headline (e.g., "Plan ready · 3 contracts · 0 open clarifications") so the card stays scannable under load (Edge Case: scannability) — never a dump of all flag text.

**Rationale**: Deterministic, cheap, unit-testable with golden artifacts; no model call, satisfying FR-017 and Article V's <10ms unit budget.

**Alternatives considered**: An LLM summarization call — rejected by clarification (cost, latency, non-determinism).

## R7 — AzureWorkflowPOC notification (FR-011/012)

**Decision**: On each phase completion, fire one HTTP `POST` in a background goroutine to a configurable local endpoint. Payload: `{ "feature": "<dir>", "phase": "<name>", "artifactPath": "<path>", "timestamp": "<RFC3339>" }`. Use a dedicated `http.Client` with a short timeout (5s); log failures to `~/.forge/logs/`; never propagate the error to the card or pipeline. Endpoint URL configured via env var `FORGE_SDD_NOTIFY_URL` (default `http://localhost:7000/sdd/phase`), the single external dependency.

**Rationale**: Mirrors the existing `notifyHTTPClient` fire-and-forget pattern; the goroutine + ignored error guarantees the best-effort, non-blocking contract (FR-012, SC-004).

**Alternatives considered**: Synchronous POST before showing the card — rejected: would let a down service delay/block the decision. Retry/backoff — rejected for v1: best-effort by spec; a missed notification is acceptable.

## R8 — Decision history persistence (FR-015)

**Decision**: Append each decision to `~/.forge/sdd/<feature>.json` as `{ phase, action, clarifyText?, timestamp }` records.

**Rationale**: `~/.forge/` is where Forge keeps runtime state (commands.json, logs); keeping the audit log there avoids polluting the committed `specs/` tree (consistent with Article VI treating `specs/` as pipeline artifacts, not runtime logs).

**Alternatives considered**: Writing history into the feature directory — rejected: mixes runtime audit data into version-controlled spec artifacts.

## R9 — Pipeline-to-session binding (frontend-driven)

**Decision**: Binding is **frontend-driven** via `POST /api/sdd/bind { sessionId, repoRoot }` (see `contracts/sdd-bind-endpoint.md`). The frontend knows the active terminal session and its working directory; it sends both, and the backend resolves the active feature from `repoRoot/.specify/feature.json`, constructs the orchestrator, and starts the watcher. v1 tracks a single active pipeline; a new bind replaces the previous one.

**Rationale**: The original design assumed the backend could identify the pipeline's session by matching the session's current directory to the repo root. **Implementation revealed the backend does not track a per-session working directory** (the only `cwd` it has is the server process's `os.Getwd`, not the PTY's). The frontend is the only place that knows both the active `sessionId` and its directory, so binding must originate there. This is the correct ownership boundary, not a workaround.

**Alternatives considered**: (a) Backend cwd inference — **rejected: infeasible**, the data does not exist server-side. (b) Plumbing PTY cwd up to the backend (OSC-9 parsing server-side) — heavier, and duplicates the frontend's existing directory tracking. (c) Multi-pipeline / multi-session orchestration — deferred (out of scope per spec assumptions).

## R10 — Reject and resume semantics (Edge Case)

**Decision**: Reject sets the pipeline state to `rejected@<phase>` and stops; no command is injected. Re-running the same feature does not auto-advance past the rejected phase — the next phase only starts from a fresh Approve/Clarify on a newly presented card.

**Rationale**: Prevents a stale approval from silently resuming a pipeline the developer chose to stop (spec Edge Case).

**Alternatives considered**: Treating Reject as a pause that auto-resumes — rejected: contradicts the spec's "Rejecting stops."

---

**Phase 0 exit**: No `NEEDS CLARIFICATION` items remain. All decisions are consistent with the spec's Clarifications and the Constitution. Ready for Phase 1 design.
