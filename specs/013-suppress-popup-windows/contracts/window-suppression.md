# Contract: Window Suppression

This feature exposes no network API. Its "interfaces" are two internal contracts that all
process-spawning code and the verification harness must honor. They are testable and binding.

---

## Contract A — Spawn-Suppression Contract (internal, compile-time)

**Audience**: every site in the Go backend that creates an OS process.

**Rule A1 — No unguarded spawn.** Every `exec.Command(...)` / `exec.CommandContext(...)` MUST be
paired, before the process starts, with a declared `SpawnKind` and the matching suppression
strategy. A spawn with neither is a contract violation and MUST fail the static-guard unit test
(fail-closed, FR-007).

**Rule A2 — Leaf strategy.** For `SpawnKind = LeafProcess`, the command MUST be created with
`CREATE_NO_WINDOW` (`0x08000000`) and `HideWindow` on Windows, and a no-op on other platforms.
- Setting `HideWindow` **without** `CREATE_NO_WINDOW` is NON-CONFORMANT (it permits a console flash) —
  this is the `internal/llm/provider/syscall_windows.go` defect.

**Rule A3 — Console-parent strategy.** For `SpawnKind = ConsoleParent` (the AI agent CLIs), the
process MUST be launched **attached to a pseudoconsole (ConPTY)** that is not displayed, so that all
descendant console processes inherit a console and never trigger OS allocation of a new visible
console. Such a process MUST NOT be launched with `CREATE_NO_WINDOW` (Rule A2's flag is forbidden
here — it is the Origin-2 root cause).

**Rule A4 — Behavior preservation.** Suppression MUST NOT alter the command's arguments, environment
(beyond console attachment), exit code, stdout/stderr content, or whether it runs to completion (FR-005).

**Rule A5 — Cross-platform parity.** Any Windows-only suppression file MUST have a matching
non-Windows stub so all targets compile and behave as before (Article IV/V).

**Conformance tests**:
- Unit (mocked): the classifier returns the correct strategy per kind; the leaf strategy sets BOTH
  flags; the static-guard scan reports zero unguarded `exec.Command` sites.
- Integration (Windows): a `ConsoleParent` launched per A3 that spawns a console child produces **no**
  new visible window (Contract B); a `LeafProcess` per A2 produces no flash.

---

## Contract B — Visible-Window Probe Contract (test harness)

**Audience**: the Go integration tests and the Playwright UX spec.

**Interface**: `scripts/count-visible-windows.ps1`
- **Input**: none (or an optional process-name filter).
- **Output**: a single integer on stdout — the count of **visible** top-level console-host windows
  (conhost.exe, cmd.exe, powershell.exe, pwsh.exe, WindowsTerminal.exe) currently on the desktop.
- **Determinism**: two calls with no intervening UI action MUST return the same value.

**Usage protocol (the actual assertion)**:
1. Sample `before = count()` immediately before triggering the action (Approve click, command-card run, etc.).
2. Trigger the action through the **real UI** (`page.keyboard` / `locator.click()` — never `page.evaluate` synthetic events).
3. Sample `after = count()` immediately after the action's command has started/completed.
4. ASSERT `after == before`.
5. Additionally (UX test), read `window.term.buffer.active` and ASSERT the command's output appears
   **in-app** — proving the command actually ran, not that it was merely suppressed (FR-002/FR-005, Article X).

**Non-conformance**: `after > before` (a window appeared) OR output absent from the xterm buffer
(command did not run in-app) is a FAIL. The harness MUST NOT substitute "the suppression helper was
called" for this behavioral check.
