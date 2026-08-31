# Tasks: Comprehension-First Workflow

**Feature**: `specs/014-comprehension-first-workflow` | **Branch**: `feature/014-comprehension-first-workflow` | **Date**: 2026-08-31

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests are mandatory here.** Constitution Article V requires Red → Green → Refactor: the failing
test is written before the implementation. Every implementation task below is preceded by the test
that must first fail.

---

## Phase 1: Setup

- [X] T001 Record the `branch-created` gate for this work via `forge workflow record branch-created "<evidence>" comprehension-first-workflow`
- [X] T002 [P] Add the brief document shape as Go types in `internal/workflow/brief.go`, matching the Change Brief and Decision entities in `specs/014-comprehension-first-workflow/data-model.md`
- [ ] T003 [P] Add the `CHANGE_BRIEF` WebSocket message-type constant in `frontend/src/hooks/useChangeBrief.js` alongside the existing `SDD_PHASE_GATE` pattern in `frontend/src/hooks/useSddGate.js`

---

## Phase 2: Foundational (blocking — no user story can complete without these)

- [X] T004 Write the failing unit test for brief validation in `internal/workflow/brief_test.go`: an empty required panel is rejected, `decisions: []` with `isRoutine: false` is rejected, `insteadOf` restating `chose` is rejected, and `isRoutine: true` with no decisions is accepted
- [X] T005 Implement brief validation in `internal/workflow/brief.go` to turn T004 green
- [X] T006 Write the failing unit test for brief persistence in `internal/workflow/brief_store_test.go`: a brief round-trips under `.forge/`, and republishing the same `briefId` updates rather than duplicating
- [X] T007 Implement brief load/save/update in `internal/workflow/brief_store.go` to turn T006 green

---

## Phase 3: User Story 1 — A change cannot be accepted without being seen (P1)

**Goal**: A code change with no published brief cannot be committed.

**Independent test**: Quickstart Scenario 1 — commit a code change with no brief; the commit is refused naming `brief-published`.

### Tests (write first, must fail)

- [X] T008 [P] [US1] Write the failing unit test for the new gate constant in `internal/workflow/ticket_test.go`: `RequiredGates` contains `brief-published`
- [X] T009 [P] [US1] Write the failing unit test for the MCP tool contract in `internal/mcp/tools_change_brief_test.go`: a valid brief records the gate and returns a `briefId`; an invalid brief records nothing and names the offending field
- [ ] T010 [US1] Write the failing integration test in `internal/workflow/brief_gate_integration_test.go` against a **real temp git repository with the real generated hook**: a commit with no brief is refused, a commit with a brief is allowed, `FORGE_BYPASS=1` overrides and writes to `.forge/bypasses.log`, and a documentation-only commit is allowed with no brief

### Implementation

- [X] T011 [US1] Add `GateBriefPublished = "brief-published"` beside the existing gate constants in `internal/workflow/ticket.go`
- [X] T012 [US1] Add `GateBriefPublished` to the `RequiredGates` slice in `internal/workflow/ticket.go` to turn T008 green
- [X] T013 [US1] Implement `change_brief_publish` in `internal/mcp/tools_change_brief.go` against the existing `ToolHandler` interface, per `specs/014-comprehension-first-workflow/contracts/change-brief-tool.md`, to turn T009 green
- [X] T014 [US1] Register the new tool in the handler list in `internal/mcp/server.go:351-357`, beside `newWorkflowGateRecordTool` and `newTerminalReadTool`
- [ ] T015 [US1] Scope the gate to code changes only in `internal/workflow/ticket.go`, exempting `specs/`, documentation-only, generated and vendored paths per `contracts/brief-gate.md`, to turn T010 green
- [ ] T016 [US1] Update the pre-commit hook message body in `internal/workflow/hooks.go` to name `brief-published` among the required gates and point at the publishing tool

---

## Phase 4: User Story 2 — The brief provokes a question rather than an answer (P1)

**Goal**: The brief is legible at a glance and exposes the decision that mattered.

**Independent test**: Quickstart Scenario 4 — publish a brief; the panel appears within a second, no panel scrolls, and each decision ends in a question.

### Tests (write first, must fail)

- [ ] T017 [P] [US2] Write the failing frontend unit test in `frontend/src/hooks/useChangeBrief.test.js`: a `CHANGE_BRIEF` message populates state, an unrelated message type is ignored, and a pending brief is restored after reload
- [ ] T018 [P] [US2] Write the failing frontend unit test in `frontend/src/components/ChangeBriefPanel.test.jsx`: what-changed, why, and what-could-break render as visually distinct panels; the risk panel carries its own styling; each decision renders its `openQuestion`; a routine brief renders a single panel
- [ ] T019 [US2] Write the failing Playwright spec in `tests/e2e/change-brief.spec.js` run against `run-dev-clean.ps1` on `:9999`: a brief published by a tool call reaches the panel, no panel requires scrolling at the default viewport, and the brief survives a page reload

### Implementation

- [ ] T020 [US2] Implement `frontend/src/hooks/useChangeBrief.js` receiving `CHANGE_BRIEF` over the hub and restoring a pending brief, mirroring `frontend/src/hooks/useSddGate.js`, to turn T017 green
- [ ] T021 [US2] Implement `frontend/src/components/ChangeBriefPanel.jsx` to turn T018 green
- [ ] T022 [P] [US2] Implement `frontend/src/components/ChangeBriefPanel.css` with large type, high contrast, and colour that carries meaning consistently — one token for verified evidence, one for risk — per FR-003
- [ ] T023 [US2] Push the published brief to the frontend from `internal/mcp/tools_change_brief.go` using the existing `BroadcastJSONToSession` in `internal/terminal/mcp_bridge.go`
- [ ] T024 [US2] Mount the panel and route the message type in `frontend/src/App.jsx` to turn T019 green
- [ ] T025 [US2] Implement the no-session case in `internal/mcp/tools_change_brief.go`: the brief is stored and the gate recorded even when no terminal session can render it, per `contracts/change-brief-tool.md`

---

## Phase 5: User Story 3 — The response format is enforced, not merely requested (P1)

**Goal**: A wall of text is detected and surfaced. It is **never** blocked — the detector reads screen redraws and cannot be trusted to gate.

**Independent test**: Quickstart Scenario 5, prose half — cause a long unformatted response; a warning appears and nothing is blocked.

### Tests (write first, must fail)

- [ ] T026 [P] [US3] Write the failing unit test in `internal/terminal/format_check_test.go`: a section over the word cap is flagged, a response with headers and dividers is not, and a response the developer explicitly asked to be detailed is not flagged
- [ ] T027 [US3] Write the failing unit test in `internal/terminal/format_check_test.go` asserting the safety property: **no detection outcome, including a false positive, ever returns a blocking result**

### Implementation

- [ ] T028 [US3] Implement the heuristic format detector in `internal/terminal/format_check.go` reading the scrollback via the existing `GetSessionScrollback`, to turn T026 and T027 green
- [ ] T029 [US3] Surface a non-blocking warning in the frontend when a violation is detected, reusing the existing toast surface in `frontend/src/components/Toast.jsx`
- [ ] T030 [US3] Document the heuristic's known limits as a purpose comment at the top of `internal/terminal/format_check.go`, so a future reader does not mistake it for a guarantee

---

## Phase 6: User Story 4 — Code is named so it reads like English (P2)

**Goal**: A commit introducing an unreadable name is refused.

**Independent test**: Quickstart Scenario 5, naming half — commit `n` as a variable outside a loop; the commit is refused naming the identifier.

### Tests (write first, must fail)

- [ ] T031 [P] [US4] Write the failing unit test in `internal/workflow/naming_test.go` for the rule set in `data-model.md`: single-letter identifiers rejected, `i`/`j`/`k` loop iterators and `w`/`r` handler parameters permitted, unprefixed booleans rejected, non-verb-first functions rejected
- [ ] T032 [P] [US4] Write the failing unit test in `internal/workflow/naming_test.go` for scope: generated, vendored and third-party paths are skipped entirely
- [ ] T033 [US4] Write the failing integration test in `internal/workflow/naming_integration_test.go` against a real temp repository: a violating commit is refused naming the identifier and its location, and `FORGE_BYPASS` overrides with the reason recorded

### Implementation

- [ ] T034 [US4] Implement the changed-files naming checker in `internal/workflow/naming.go` to turn T031 and T032 green, with a file purpose comment carrying the Framework-First justification from research R5
- [ ] T035 [US4] Add the naming check step to the generated pre-commit hook body in `internal/workflow/hooks.go`, preserving the existing `FORGE_BYPASS` path and the graceful skip when the forge binary is absent, to turn T033 green
- [ ] T036 [US4] Add the meaningless-but-legal name case to the brief rather than the checker, per FR-019, in `internal/mcp/tools_change_brief.go`

---

## Phase 7: Polish & Cross-Cutting

- [ ] T037 [P] Mark `specs/012-compact-visual-style/spec.md` superseded by this feature, with a pointer to `specs/014-comprehension-first-workflow/`
- [ ] T038 [P] Update `CHANGELOG.md` under Unreleased, describing the enforceability split in the terms the developer will recognise
- [ ] T039 Implement brief scaling in `internal/workflow/brief.go`: a trivial change yields one panel, a large change summarises rather than growing without bound, per FR-006
- [ ] T040 Verify all five quickstart scenarios in `specs/014-comprehension-first-workflow/quickstart.md` against the running dev instance, and record the evidence
- [ ] T041 Record this feature's own gates via `forge workflow record tests-written|tests-passed|brief-published "<evidence>" comprehension-first-workflow` — the feature must pass its own gate before it can be committed
- [ ] T042 Run the full suites: `go build ./...`, `go test ./...`, `cd frontend; npx vitest run`, and the Playwright spec via `run-dev-clean.ps1`

---

## Dependencies

```text
Phase 1 (Setup)
   └─> Phase 2 (Foundational: brief shape, validation, persistence)
          ├─> Phase 3  US1  brief published + GATED     ← the enforcement spine
          │      └─> Phase 4  US2  panel renders the brief
          ├─> Phase 6  US4  naming gated                 (independent of US1/US2)
          └─> Phase 5  US3  prose warned                 (independent; soft by design)
                 └─> Phase 7 (Polish)
```

- **Phase 2 blocks everything.** No story can complete without the brief shape and its validation.
- **US2 depends on US1**: there is nothing to render until a brief can be published.
- **US3 and US4 are independent** of US1/US2 and of each other.
- **US3 is deliberately last to build** despite being P1. It is the only soft deliverable, and
  building it early risks it standing in for enforcement the way the advisory reminder already did.

---

## Parallel Opportunities

| Phase | Can run together | Why |
|---|---|---|
| 1 | T002, T003 | Different files, no shared state |
| 3 | T008, T009 | Separate test files |
| 4 | T017, T018 | Separate test files |
| 4 | T022 with T021 | CSS is independent of the component's logic |
| 5 | T026 with Phase 6 work | Different subsystems entirely |
| 6 | T031, T032 | Same file, but separable cases — coordinate or run sequentially |
| 7 | T037, T038 | Documentation only |

**Whole phases in parallel**: once Phase 2 is green, Phases 3, 5 and 6 can proceed independently.

---

## Implementation Strategy

### MVP — Phase 1 + Phase 2 + Phase 3

Stop after Phase 3 and the feature already works: a code change with no brief cannot be committed.
The brief is not yet pretty, but it is **required**, which is the thing the developer asked for.
Quickstart Scenario 1 is the acceptance test for this MVP and for the feature as a whole.

### Then Phase 4

The panel is what makes the requirement bearable rather than an obstacle. Without it a brief is
just another form to fill in; with it, the brief is the thing that makes the change legible.

### Then Phases 6 and 5

Naming before prose, deliberately — naming is enforceable and compounds over every future reading,
while prose warning is best-effort and must never be mistaken for a guarantee.

### The failure mode to avoid

`specs/012-compact-visual-style/` specified the response-format half in June 2026 and was never
implemented; an advisory reminder stood in for enforcement. **Shipping Phase 5 without Phase 3
would repeat exactly that mistake** — a warning that looks like enforcement and is not.
