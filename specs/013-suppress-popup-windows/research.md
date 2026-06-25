# Phase 0 Research: Suppress Spurious Pop-up Terminal Windows

All Technical Context unknowns are resolved below. Each decision is grounded in concrete
evidence gathered from the codebase (file:line) plus Windows console semantics.

## R1 — What actually causes the visible window? (the core mechanism)

**Decision**: Treat the bug as two mechanisms, not one, and fix each with the correct tool:
- **Leaf processes** (one-shot, do not themselves spawn console children): suppress with `CREATE_NO_WINDOW` (`0x08000000`) + `HideWindow`.
- **Console-parent processes** (long-lived, spawn their own console children — i.e. the AI agent CLIs): do **not** use `CREATE_NO_WINDOW`; run them **attached to a hidden pseudoconsole (ConPTY)** so descendants inherit it.

**Rationale**: On Windows, a process created with `CREATE_NO_WINDOW` has **no console**. When such a process later spawns a **console-subsystem** child without specifying flags, the OS has no parent console to share, so it **allocates a new, visible console window** for the child. Therefore `CREATE_NO_WINDOW` — the project's standard "hide" flag (`cmd/forge/windows.go:18`) — is correct for leaf commands but actively *causes* pop-ups when applied to an agent that runs tools. The Chat-view agent launches apply exactly this flag (`handlers_chat.go:410,457`) while passing `--allow-all-tools` / `--permission-mode acceptEdits`, so every tool the agent runs can pop a console. A pseudoconsole (ConPTY) gives the parent a real (but non-displayed) console that all descendants inherit, so no child ever needs a new visible window — this is precisely how the in-app terminal already avoids windows (`internal/terminal/pty_windows.go`, `conpty.Start`).

**Alternatives considered**:
- *Blanket `CREATE_NO_WINDOW` on every spawn* — rejected: worsens Origin 2 (turns flashes into real windows for any console-parent).
- *Post-spawn window hiding (find the window and `ShowWindow(SW_HIDE)`)* — rejected: racy, the window flashes before it is found; violates FR-004 (no flash) and Article X.
- *Telling the third-party CLI to hide windows via a flag/env* — rejected as the primary fix: no portable env var forces a Node CLI's `child_process` to set `windowsHide`; we cannot rely on a dependency we do not control (kept only as a documented residual mitigation, R5).

## R2 — Is this Electron or a web/Go shell? (where can spawns originate?)

**Decision**: Treat the Go backend (and the third-party agent CLI it launches) as the **only** spawn origins; the frontend spawns nothing.

**Rationale**: The app is a Go HTTP server serving a React/Vite frontend (`cmd/forge/main.go`, `frontend/package.json`); there is no Electron main process, no `BrowserWindow`, no preload, and no `child_process`/`shell.openExternal` anywhere in `frontend/src`. Every command therefore runs either via a Go `exec.Command` or via the agent CLI that the backend started. This bounds the audit surface to Go + the agent-launch path.

**Alternatives considered**: Searching for an Electron IPC spawn path — done, none exists; ruled out.

## R3 — How is the AI agent launched, and which path leaks?

**Decision**: Address **both** agent-launch paths, but they differ:
- **Interactive (typed into the in-app ConPTY)** — e.g. the `copilot --allow-all-tools` command card written to the terminal session (`command-cards/copilot-fresh.json`, `frontend/src/components/ForgeTerminal.jsx:854` → ConPTY). Here the agent is **already** attached to the visible ConPTY, so console children inherit it; this path is expected to be clean and is the control case for the tests.
- **Chat view (spawned by Forge with `CREATE_NO_WINDOW`)** — `handlers_chat.go:408/455`. This is the console-less-parent path from R1 and the leading suspect for "click approve → window pops."

**Rationale**: The two paths produce opposite console topologies; the fix (R1) targets the second. If the integration probe shows the interactive path *also* pops windows, R5 covers the residual (third-party CLI forcing `CREATE_NEW_CONSOLE`).

**Alternatives considered**: Forcing all agents through the interactive ConPTY path even for Chat — viable and may be the cleanest implementation; left to /speckit-tasks to choose between "attach Chat agent to a hidden ConPTY" vs. "reuse the terminal session." Either satisfies the contract.

## R4 — Inventory of unguarded / under-guarded Forge spawn sites (Origin 1)

**Decision**: Fix exactly these confirmed gaps; everything else already routes through a correct helper.

| Site | Command | Current state | Fix |
|---|---|---|---|
| `internal/files/handler.go:170` | `wsl -d {distro} -e sh -c "echo $HOME"` | **No** suppression | Add leaf suppression (it is a one-shot leaf) |
| `internal/files/handler.go:407` | `ffmpeg -i {video} …` | **No** suppression | Add leaf suppression |
| `internal/llm/provider/syscall_windows.go:14` | `which`/`where`/`cmd /c` path probes | `HideWindow` only, **no** `CREATE_NO_WINDOW` | Add `CreationFlags = 0x08000000` |
| `internal/tutor/changes.go:153` | `git {args}` | Helper **not** called | Route through leaf helper |

**Rationale**: These are the only sites the spawn audit found without correct leaf suppression; all are leaf one-shots, so `CREATE_NO_WINDOW` is right for them. The wsl/ffmpeg calls fire during file browsing/preview — the "other scenarios" the user suspected.

**Alternatives considered**: None — these are unambiguous omissions.

## R5 — Residual: a third-party CLI that forces its own visible console

**Decision**: Fail **closed and loud**, not silent. If, after R1, a pop-up still originates from a child that the third-party agent created with `CREATE_NEW_CONSOLE` (outside Forge's control), the behavior is documented and surfaced (log + a note in the verification artifact), not silently accepted as "passing."

**Rationale**: Article X forbids declaring success without proof; FR-016-style fail-closed posture from sibling specs applies. Forge controls the parent's console topology (R1) which eliminates the *common* case; a CLI that explicitly demands a new console is a genuine external gap and must be reported so it can be escalated upstream or mitigated by env (best-effort).

**Alternatives considered**: Silently ignoring residual cases — rejected (dishonest reporting).

## R6 — Anti-duplication & anti-regression: one suppression source + a static guard

**Decision**: Introduce a small `internal/spawnguard` package holding (a) the leaf `CREATE_NO_WINDOW` constant and the spawn-kind classifier, and (b) back it with a unit test that scans the repository and **fails** if any `exec.Command(`/`exec.CommandContext(` is not paired with a recognized suppression call.

**Rationale**: The suppression helper is currently copy-pasted across ~10 packages (`hideWindow`, `hideExecWindow`, `suppressConsoleWindow`, `setSysProcAttr`, `configureCmdForPlatform`, `suppressReleaseConsoleWindow`) — the very fragmentation that let four sites drift. A single documented source plus a build-failing guard makes recurrence (FR-007) mechanically impossible rather than a matter of reviewer vigilance (Article I — BEST route). Migration of existing helpers is opportunistic and low-risk; the guard is the durable win.

**Alternatives considered**:
- *Leave helpers duplicated, just fix the four sites* — rejected: the same drift recurs (this is the second time window leaks have shipped).
- *Lint rule in an external linter* — rejected (Framework-First: a Go unit test needs no new tooling and runs in the existing suite).

## R7 — How to PROVE "no visible window" (Article X behavioral proof)

**Decision**: A `scripts/count-visible-windows.ps1` probe returns the count of **visible top-level console-host windows** (conhost.exe / cmd.exe / powershell / pwsh / WindowsTerminal with a visible window). Tests snapshot the count immediately before the action and assert it is unchanged immediately after. Go integration tests gate on Windows via build tags and may use Win32 `EnumWindows` directly; the Playwright UX test shells out to the probe and additionally reads `window.term.buffer.active` to confirm the command's output landed **in-app**.

**Rationale**: Playwright drives the browser DOM and cannot see desktop OS windows; "no DOM element appeared" is not proof a console window did not pop. An OS-level window count is the only honest signal, and reading the xterm buffer (not the DOM) for output satisfies Article X directly. The before/after delta also catches a momentary flash if the probe samples during the action window (the test brackets the action tightly).

**Alternatives considered**:
- *Assert the suppression helper was called (mock/spy)* — rejected: that is "the function was invoked," not "no window appeared" (Article X).
- *Screenshot diffing the desktop* — rejected: brittle, flaky, slow vs. a deterministic window count.
