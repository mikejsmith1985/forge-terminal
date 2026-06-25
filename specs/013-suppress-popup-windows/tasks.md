---
description: "Task list for: Suppress Spurious Pop-up Terminal Windows"
---

# Tasks: Suppress Spurious Pop-up Terminal Windows

**Input**: Design documents from `specs/013-suppress-popup-windows/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R7), data-model.md, contracts/window-suppression.md, quickstart.md

**Tests**: REQUIRED. The constitution (Article V Red→Green→Refactor, Article X behavioral proof) and the
specs/012 enforcement gates this feature is subject to make tests mandatory. Every fix is preceded by a
failing test that exercises real behavior (visible-window count + `window.term.buffer.active`), never a
mock-was-called assertion.

**Organization**: Grouped by user story. US1 (P1) is the MVP — the confirmed "click Approve → window pops"
defect (Origin 2). US2 (P2) closes the broader leaf-spawn class (Origin 1) and locks it with a static guard.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 or US2 (Setup/Foundational/Polish carry no story label)
- Exact file paths are included in every task.

## Path Conventions

Go backend at repo root (`cmd/forge/`, `internal/`); React frontend (`frontend/src/`); tests in
`tests/e2e/` (Playwright) and Go `_test.go` files beside the code; dev harness in `scripts/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Light scaffolding — the project already exists.

- [ ] T001 [P] Add an "Unreleased" entry stub to `CHANGELOG.md` describing the pop-up-window suppression fix (Article VI; filled in during Polish).
- [ ] T002 [P] Create an empty Playwright spec scaffold `tests/e2e/suppress-popup-windows.spec.js` (imports the `tests/fixtures/forge.js` harness, no assertions yet) so US1 has a home.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The visible-window probe (Contract B) is the only honest "no window appeared" signal and is
used by every test in both stories. It MUST exist before any Red test can be written.

**⚠️ CRITICAL**: No user-story test can be authored until this phase is complete.

- [ ] T003 Create the visible-window probe `scripts/count-visible-windows.ps1` per Contract B — prints a single integer: the count of visible top-level console-host windows (conhost.exe, cmd.exe, powershell.exe, pwsh.exe, WindowsTerminal.exe). Deterministic across two no-op calls.
- [ ] T004 Create a Windows-gated Go test helper that returns the same count for integration tests — `internal/testutil/windowcount_windows.go` (Win32 `EnumWindows` or shelling to T003) plus a non-Windows stub `internal/testutil/windowcount_other.go` that skips/returns 0 so all targets compile (contract Rule A5).

**Checkpoint**: Probe available to both Go and Playwright — story work can begin.

---

## Phase 3: User Story 1 - Approving an action never pops an external window (Priority: P1) 🎯 MVP

**Goal**: Clicking **Approve** so an AI agent runs a command executes it in-app with **zero** new desktop
windows — fixing the Origin-2 mechanism where a `CREATE_NO_WINDOW` (console-less) agent parent forces
Windows to allocate a fresh visible console for each tool child (research R1/R3).

**Independent Test**: With an agent active, sample the window count, click Approve to trigger a command,
sample again — the count is unchanged and the command's output appears in `window.term.buffer.active`.

### Tests for User Story 1 (write FIRST, must FAIL before implementation) ⚠️

- [ ] T005 [P] [US1] Playwright UX test in `tests/e2e/suppress-popup-windows.spec.js` (via `run-dev-clean.ps1`) reproducing the **actual reported scenario first** — the **interactive in-app terminal agent** (the agent running in the ConPTY terminal as in the user's screenshot, started via the `copilot`/`claude` command card): snapshot `before` via `scripts/count-visible-windows.ps1`, click the real **Approve** control so the agent runs a tool (`locator.click()` — no synthetic events), snapshot `after`, assert `after === before`, and assert the command output is present in `window.term.buffer.active` (Article X). This test is the source of truth for which surface leaks; it MUST be authored and run BEFORE any fix. MUST FAIL if (and identify that) the interactive path leaks.
- [ ] T006 [P] [US1] Go integration test `cmd/forge/console_parent_window_test.go` (Windows-gated, uses `internal/testutil` from T004) covering BOTH agent-launch topologies with a **synthetic console-spawning child** (a tiny test helper that opens a console window — do NOT depend on a real `copilot`/`claude` binary, keep the test hermetic): (a) a console-less parent (`CREATE_NO_WINDOW`) spawning the child → asserts the *current* Chat-view bug reproduces (window delta > 0, MUST FAIL today); (b) the same child launched via the T007 console-parent seam → asserts window delta == 0 (drives the fix to GREEN).

### Implementation for User Story 1

- [ ] T007 [US1] Add a "console-parent" launch seam that runs a process attached to a hidden pseudoconsole, reusing the existing ConPTY integration — `cmd/forge/console_parent_windows.go` (wraps the `conpty` start used by `internal/terminal/pty_windows.go`; surface a minimal `startUnderHiddenConsole(cmd)` / equivalent). Contract Rule A3.
- [ ] T008 [US1] Add the non-Windows parity stub `cmd/forge/console_parent_other.go` (no-op / native behavior) so non-Windows builds compile and behave as today (Rule A5).
- [ ] T009 [US1] Change `streamViaCopilotCLI` and `streamViaClaudeCLI` in `cmd/forge/handlers_chat.go` (~lines 408, 455) to launch the agent via the T007 console-parent seam and STOP calling `hideWindow` (`CREATE_NO_WINDOW`) on the agent parent — the Origin-2 root-cause fix (research R1).
- [ ] T010 [US1] Reproduction decision point + interactive-path fix if needed: from T005's result, determine which surface actually leaks. If only the Chat-view path leaks, T009 covers it. **If the interactive in-app-terminal agent path (the screenshot scenario) leaks**, implement its fix here — Forge does not `exec` that agent (it is typed into the ConPTY shell), so the fix lands in the ConPTY/shell launch (`internal/terminal/pty_windows.go`) or the agent's launch environment so its tool children inherit a console and never allocate a visible window (research R1/R3). Do NOT "fix" it by adding `CREATE_NO_WINDOW`. Then re-run T005 + T006 → GREEN.

**Checkpoint**: US1 is independently demonstrable — approving an agent command pops no window; this is the shippable MVP.

---

## Phase 4: User Story 2 - No scenario silently spawns a visible OS window (Priority: P2)

**Goal**: Close the remaining Origin-1 leaf-spawn gaps (research R4), consolidate the copy-pasted
suppression helpers into one source, and add a static guard so any future unguarded `exec.Command`
fails the build (FR-007) — making the whole class non-recurring.

**Independent Test**: Run the static-guard unit test (zero unguarded spawns) and exercise the file-browser
paths (wsl/ffmpeg) under the probe — no window appears in any case.

### Tests for User Story 2 (write FIRST, must FAIL before implementation) ⚠️

- [ ] T011 [P] [US2] Unit test `internal/spawnguard/classify_test.go` (<10 ms, mocked): the classifier returns `LeafProcess` → strategy sets BOTH `CREATE_NO_WINDOW` (`0x08000000`) and `HideWindow`; `ConsoleParent` → does NOT set `CREATE_NO_WINDOW` (Contract Rule A2/A3). MUST FAIL (package absent).
- [ ] T012 [P] [US2] Static-guard unit test `internal/spawnguard/staticguard_test.go`: scan the repo for `exec.Command(`/`exec.CommandContext(` and FAIL if any site is not paired with a recognized suppression call. MUST FAIL initially (the four R4 gaps). 
- [ ] T013 [P] [US2] Windows-gated integration test `internal/files/handler_window_test.go` (uses `internal/testutil`): invoke the WSL-home-resolution and ffmpeg-preview code paths, assert 0 visible-window delta. MUST FAIL on current code.

### Implementation for User Story 2

- [ ] T014 [US2] Create the `internal/spawnguard` package — `internal/spawnguard/classify.go` (`SpawnKind`, the leaf `CREATE_NO_WINDOW` constant, classifier, and an `ApplyLeaf(cmd)` helper) with a `classify_windows.go` / `classify_other.go` split for the platform flags (Rule A5). Makes T011 pass.
- [ ] T015 [P] [US2] Apply leaf suppression to the WSL call at `internal/files/handler.go:170` (`wsl -d {distro} -e sh -c "echo $HOME"`) via the T014 helper. (Depends on T014.)
- [ ] T016 [P] [US2] Apply leaf suppression to the ffmpeg call at `internal/files/handler.go:407` via the T014 helper. (Depends on T014.)
- [ ] T017 [P] [US2] Fix `internal/llm/provider/syscall_windows.go` (`configureCmdForPlatform`) to add `CreationFlags = 0x08000000` alongside the existing `HideWindow` (removes the console-flash gap — Rule A2). (Independent file.)
- [ ] T018 [P] [US2] Route `runGitCommand` at `internal/tutor/changes.go:153` through the leaf suppression helper. (Independent file.)
- [ ] T019 [US2] Migrate the duplicated per-package helpers (`hideWindow`, `hideExecWindow`, `suppressConsoleWindow`, `setSysProcAttr`, `configureCmdForPlatform`, `suppressReleaseConsoleWindow`) to delegate to `internal/spawnguard` where low-risk, and make the T012 static guard recognize the consolidated call. Re-run T011 + T012 + T013 → GREEN.

**Checkpoint**: US1 AND US2 both hold — no command surface leaks a window, and the static guard prevents regression.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Cross-platform safety, honest reporting, and end-to-end validation.

- [ ] T020 [P] Cross-compile check: `GOOS=linux go build ./...` and `GOOS=darwin go build ./...` succeed — every new `*_windows.go` (T004, T007, T014) has a matching non-Windows stub (Rule A5, Article IV/V).
- [ ] T021 Behavior-preservation check (FR-005): confirm a representative leaf (git) and the agent path produce identical output/exit codes with suppression as without — output still reaches the in-app terminal.
- [ ] T022 Focus-retention check (SC-003 / FR-006): during an Approve action, confirm Forge Terminal keeps keyboard focus (no spawned window steals it); record evidence.
- [ ] T023 [P] Finalize the `CHANGELOG.md` entry (from T001) with the concrete fix summary (both origins).
- [ ] T024 Run all three `quickstart.md` scenarios (approve, other surfaces, rapid approvals) and confirm `after == before` window counts (SC-001, SC-002, SC-005).
- [ ] T025 Document the residual-case posture (research R5): if any pop-up remains from a third-party CLI forcing `CREATE_NEW_CONSOLE`, it is logged and surfaced, never silently passed (fail-closed, Article X).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup; the probe (T003/T004) BLOCKS all story tests.
- **US1 (Phase 3)**: depends on Foundational. Independently testable and shippable (MVP).
- **US2 (Phase 4)**: depends on Foundational. Independent of US1 (different files/mechanism) — can run in parallel with US1 if staffed.
- **Polish (Phase 5)**: depends on US1 + US2 implementation being complete.

### User Story Dependencies

- **US1 (P1)**: Origin-2 fix in `handlers_chat.go` + new console-parent seam. No dependency on US2.
- **US2 (P2)**: Origin-1 leaf fixes + `spawnguard` + static guard. No dependency on US1. (Both share only the read-only T003/T004 probe.)

### Within Each User Story

- Tests (T005/T006; T011/T012/T013) are written and MUST FAIL before implementation.
- US1: seam (T007/T008) before the `handlers_chat.go` switch (T009) before verify+Green (T010).
- US2: `spawnguard` (T014) before the leaf-site fixes that use it (T015/T016); T017/T018 are independent files; consolidation+Green (T019) last.

### Parallel Opportunities

- Setup: T001, T002 in parallel.
- US1 tests T005, T006 in parallel; US2 tests T011, T012, T013 in parallel.
- US2 leaf fixes T015, T016, T017, T018 in parallel (distinct files) once T014 exists.
- US1 and US2 are parallelizable across two developers after Phase 2.

---

## Parallel Example: User Story 2 leaf fixes

```bash
# After T014 (spawnguard) lands, these touch four distinct files — run together:
Task: "Apply leaf suppression to wsl call in internal/files/handler.go:170"
Task: "Apply leaf suppression to ffmpeg call in internal/files/handler.go:407"
Task: "Add CreationFlags=0x08000000 in internal/llm/provider/syscall_windows.go"
Task: "Route runGitCommand through leaf helper in internal/tutor/changes.go:153"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (probe).
2. Phase 3 US1: write failing window-count tests (T005/T006), add the hidden-ConPTY console-parent seam, switch `handlers_chat.go` off `CREATE_NO_WINDOW`, re-run to GREEN.
3. **STOP and VALIDATE**: approving an agent command pops no window. Shippable.

### Incremental Delivery

1. Setup + Foundational → probe ready.
2. US1 → the reported defect is fixed → demo (MVP).
3. US2 → broader leaf gaps closed + static guard prevents recurrence → demo.
4. Polish → cross-platform + quickstart validation → ready for PR.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- This feature must pass the very gates it is subject to (specs/012): record Red→Green evidence per story and a passing Playwright run for US1.
- Proof is always the visible-window count + `window.term.buffer.active` — never "the helper was called" (Article X).
- `CREATE_NO_WINDOW` is correct for leaves, FORBIDDEN for agent/console parents (research R1) — do not "fix" US1 by adding the flag.
- Commit after each task or logical group; never wildcard-kill processes (Article II).
