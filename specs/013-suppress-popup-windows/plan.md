# Implementation Plan: Suppress Spurious Pop-up Terminal Windows

**Branch**: `013-suppress-popup-windows` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-suppress-popup-windows/spec.md`

## Summary

Stop Forge Terminal from popping visible OS console windows when the user approves an agent action, runs a command card, opens a link, or triggers any other command path. Investigation found the symptom has **two distinct root causes**, matching the clarified two-origin scope:

1. **Leaf-process gaps (Origin 1 — Forge's own `exec.Command` calls).** Most spawn sites already route through a `CREATE_NO_WINDOW` helper, but four sites do not: `internal/files/handler.go:170` (`wsl … echo $HOME`) and `:407` (`ffmpeg …`) have **no** suppression; `internal/llm/provider/syscall_windows.go:14` sets `HideWindow` but **omits** the `CREATE_NO_WINDOW` creation flag (allowing a flash); and `internal/tutor/changes.go:153` git runner omits the helper. These are one-shot leaf processes, so `CREATE_NO_WINDOW` is the correct fix.

2. **Console-less-parent-spawns-visible-child (Origin 2 — the agent subprocess tree).** `cmd/forge/windows.go:18` `hideWindow` sets `CREATE_NO_WINDOW`, which gives the spawned process **no console at all**. It is applied to the Chat-view agent launches (`handlers_chat.go:410,457`) that run with `--allow-all-tools` / `--permission-mode acceptEdits`. When such a console-less agent then spawns a **console** child (its Bash/shell tool), Windows must allocate a **brand-new visible console window** for that child — there is no parent console to inherit. So `CREATE_NO_WINDOW` is exactly wrong for a long-lived parent that itself spawns console children: it converts "no flash" into "a real pop-up window per tool call." The correct fix is to run agent parents **attached to a hidden pseudoconsole (ConPTY)** so their descendants inherit it and never auto-allocate a visible console — the same mechanism the in-app terminal already uses (`internal/terminal/pty_windows.go`).

The plan therefore: (a) establishes one **spawn-suppression contract** that classifies every spawn as *leaf* (use `CREATE_NO_WINDOW`) or *console-parent* (attach to a hidden ConPTY), (b) closes the four leaf gaps and corrects the agent-launch path, (c) adds a **static guard test** so a future unguarded `exec.Command` fails the build, and (d) proves the fix with a real **visible-window-count probe** (Article X behavioral proof) driven from both Go integration tests and a Playwright UX test. No new runtime libraries — it reuses the existing `conpty` integration and the existing per-platform suppression helpers, consolidating them.

## Technical Context

**Language/Version**: Go (backend: `cmd/forge`, `internal/terminal`, `internal/llm`, `internal/files`, `internal/tutor`); JavaScript/React (frontend: `frontend/src`); PowerShell (dev harness, test window probe).

**Primary Dependencies**: existing only (Framework-First, Article VII) — the Windows ConPTY integration already vendored and used in `internal/terminal/pty_windows.go` (`conpty.Start`); the per-platform suppression helpers already present (`hideWindow`/`hideExecWindow`/`suppressConsoleWindow`/`setSysProcAttr` and their `_unix.go` no-op stubs); the Win32 `user32`/`kernel32` calls already reached via `syscall` in `cmd/forge/windows.go`. No new modules.

**Storage**: None. This feature changes runtime process/window behavior and persists nothing.

**Testing**: Go unit (mocked, <10 ms) for the spawn classifier and a repo-wide static check that every `exec.Command(...)` is paired with a suppression call; Go integration (real, Windows) that launches a console-spawning parent through the corrected agent path and asserts the count of visible top-level/console windows does not increase (Win32 `EnumWindows` probe); Playwright UX (via `run-dev-clean.ps1`) that clicks the real Approve / command-card controls and asserts — through an OS window-count probe and by reading `window.term.buffer.active` (Article X) — that the command ran in-app with zero new desktop windows. Red→Green→Refactor: each failing test precedes its fix (this feature must pass the specs/012 gates it is subject to).

**Target Platform**: Windows 11 desktop (primary; where console windows are allocated). Non-Windows builds must keep compiling and behave as today (no-op suppression stubs, native PTY).

**Project Type**: Desktop application — Go HTTP backend serving a React frontend in a local web/desktop shell (confirmed: **not** Electron; no `child_process`/`shell.openExternal` in the frontend, so every spawn originates in the Go backend or in the third-party agent CLI the backend launches).

**Performance Goals**: No perceptible latency added; suppression is a process-creation flag or a one-time hidden-ConPTY attach. Approving an action and seeing in-app output stays within today's interaction latency.

**Constraints**: Windows-primary but cross-platform-safe (every Windows suppression file must have a matching non-Windows stub — Article IV/V); fail-closed (if a spawn cannot be classified or suppressed, it must be treated as needing suppression, never allowed to pop a window unguarded — mirrors FR-016 elsewhere); never wildcard-kill processes (Article II); suppression must not change command behavior or output (FR-005); localhost-only, no new auth or persisted state.

**Scale/Scope**: ~4 leaf-gap edits, 1 agent-launch correction, 1 consolidation of duplicated helpers, 1 static-guard test, 1 window-count probe + tests. A single local developer; a handful of concurrent sessions.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Article | Gate | Status |
|---|---|---|
| I — Prime Directive (BEST route) | Fixes the real mechanism (console-less parent → auto-allocated child console) rather than slapping `CREATE_NO_WINDOW` everywhere (which would *worsen* Origin 2). Adds a static guard so the class can't silently regress. | PASS |
| II — Process Protection | No process kills introduced; the agent-launch change only alters *how* a process is attached to a console, never kills by wildcard. | PASS (enforced in tasks) |
| III — Branching | Work on `013-suppress-popup-windows`; reintegrates via PR. | PASS |
| IV — Code Quality | Self-documenting names (`spawnKindLeaf`/`spawnKindConsoleParent`), file purpose comments, functions <40 lines, guard clauses; each new Windows file gets a non-Windows stub. | PASS (enforced in tasks) |
| V — Testing (three-layer) | Unit (mocked classifier + static exec-guard) <10 ms; integration (real window-count probe on Windows); Playwright UX via `run-dev-clean.ps1`. Red→Green→Refactor enforced. | PASS |
| VI — Documentation | CHANGELOG.md updated in the PR; `specs/013/` is the exempt pipeline artifact. | PASS |
| VII — Framework-First | Reuses the existing ConPTY integration and existing suppression helpers; only the classifier, the hidden-ConPTY agent attach, the static guard, and the window-count test probe are new — justified in research.md (R1, R6, R7). | PASS |
| VIII — Release | Local pipeline only (`scripts/local-release.ps1`). | PASS |
| IX — Vault Zero-Knowledge | No secrets involved. | N/A |
| X — Verification & Proof | Proof is a real visible-window count before/after the action plus reading `window.term.buffer.active` for output — never "it compiled" or "the helper was called." | PASS |
| XI — Output/Dashboard Restraint | No new dashboard files; no phase-name narration; reuses existing surfaces. | PASS |

**No violations** → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/013-suppress-popup-windows/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R7
├── data-model.md        # Phase 1 — entities/state (minimal; runtime-only)
├── quickstart.md        # Phase 1 — validation scenarios + window-count probe usage
├── contracts/
│   └── window-suppression.md   # the spawn-suppression contract (leaf vs console-parent) + probe contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root) — touch points

```text
cmd/forge/
├── windows.go           # KEEP hideWindow for LEAF spawns (CREATE_NO_WINDOW). ADD a documented
│                        #   companion for CONSOLE-PARENT spawns (attach to a hidden ConPTY) OR
│                        #   redirect agent launches to the terminal package's pty path.
├── unix.go              # matching non-Windows no-op companion (keep cross-platform parity).
└── handlers_chat.go     # streamViaCopilotCLI / streamViaClaudeCLI: STOP using CREATE_NO_WINDOW
                         #   for the agent parent (the cause of child pop-ups); launch under a
                         #   hidden pseudoconsole so tool children inherit it. (lines ~408, 455)

internal/terminal/
├── pty_windows.go       # REUSE the existing ConPTY launch as the canonical "hidden console parent"
│                        #   mechanism; expose a minimal seam so non-terminal agent spawns can reuse it.
└── proc_windows.go      # the shared leaf suppression helper (already correct) — candidate single source.

internal/files/
└── handler.go           # ADD leaf suppression to the wsl call (line 170) and the ffmpeg call (line 407).

internal/llm/provider/
├── syscall_windows.go   # FIX: add CreationFlags = CREATE_NO_WINDOW (currently HideWindow only → flash).
└── syscall_unix.go      # confirm no-op stub parity.

internal/tutor/
└── changes.go           # route runGitCommand through the leaf suppression helper (line 153).

internal/spawnguard/     # NEW (small) — one place that documents the leaf CREATE_NO_WINDOW constant and
└── classify.go          #   the spawn-kind classifier; unit-tested. Justified in research.md R6 as the
                         #   anti-duplication / anti-regression seam (helpers are currently copy-pasted
                         #   across ~10 packages).

tests/ (Go)
└── *_window_test.go     # integration: launch a console-spawning parent via the corrected path and assert
                         #   the visible-window count is unchanged (Win32 EnumWindows probe, Windows-gated).

tests/e2e/
└── suppress-popup-windows.spec.js  # NEW Playwright — click Approve / run a command card, assert via the
                                    #   OS window-count probe that no new window appeared, and read
                                    #   window.term.buffer.active to confirm the command ran in-app.

scripts/
└── count-visible-windows.ps1       # NEW tiny probe the tests call: returns the count of visible
                                    #   top-level / console windows (conhost/cmd/pwsh/wt) for before/after.
```

**Structure Decision**: Web/desktop split (Go backend + React frontend). The frontend spawns nothing; every fix lands in the Go backend plus test harness. The genuinely new units are `internal/spawnguard` (classifier + single suppression source), the hidden-ConPTY agent-launch seam, the window-count probe, and two test specs — consistent with retrofit-in-place and Framework-First.

## Implementation Sequencing (for /speckit-tasks)

Ordered by proof value and risk:

1. **Window-count probe + failing tests first (US1 / P1, Red).** Add `scripts/count-visible-windows.ps1` and the Go integration test + Playwright spec that reproduce a pop-up by exercising the current agent-approve path. These must FAIL (Red) before any fix — they are the Article X behavioral proof.
2. **Origin 2 — correct the agent launch (US1 / P1).** Replace `CREATE_NO_WINDOW` on the Chat-view agent spawns with a hidden-ConPTY attach so tool children inherit a console. Re-run the probe tests → Green. This is the direct fix for "click approve → window pops."
3. **Origin 1 — close leaf gaps (US2 / P2).** Add leaf suppression to `internal/files/handler.go` (wsl, ffmpeg), fix `internal/llm/provider/syscall_windows.go` (add `CREATE_NO_WINDOW`), route `internal/tutor/changes.go` git through the helper. Each paired with a Red→Green assertion.
4. **Consolidation + static guard (US2 / P2).** Introduce `internal/spawnguard` as the single source for the leaf constant and the spawn-kind classifier; migrate the duplicated per-package helpers to it where low-risk. Add the unit test that scans the repo and FAILS if any `exec.Command(...)` lacks a suppression pairing (fail-closed, prevents recurrence — FR-007).
5. **Honest surfacing + edges (US2 / P2).** Verify cross-platform stubs compile and no-op on non-Windows; confirm suppression does not alter command output (FR-005); confirm focus stays on Forge (FR-006). Document any residual case where a third-party CLI itself forces `CREATE_NEW_CONSOLE` (fail-closed: reported, not silently allowed).

## Complexity Tracking

No constitution violations — section intentionally empty.
