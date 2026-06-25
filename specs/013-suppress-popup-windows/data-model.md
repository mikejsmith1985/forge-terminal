# Phase 1 Data Model: Suppress Spurious Pop-up Terminal Windows

This feature changes runtime process/window behavior and persists **no** data. There are no
database entities, schemas, or migrations. The only modeled concepts are the in-memory/compile-time
classifications that drive how a process is spawned. They are documented here for clarity.

## Concept 1 — SpawnKind (classification of a process spawn)

A compile-time/in-memory enum used by `internal/spawnguard` to decide the suppression strategy.

| Value | Meaning | Suppression strategy | Examples |
|---|---|---|---|
| `LeafProcess` | A short-lived process that does not itself spawn console children. | `CREATE_NO_WINDOW` (`0x08000000`) + `HideWindow`. | `git`, `ffmpeg`, `wsl … echo $HOME`, `which`/`where`, `cmd /c start <url>`. |
| `ConsoleParent` | A long-lived process that spawns its own console children (the agent CLIs). | Attach to a **hidden pseudoconsole (ConPTY)**; do **not** use `CREATE_NO_WINDOW`. | `copilot`, `claude`, `gemini` running with auto-tool execution. |

**Rules**:
- Classification is explicit at the call site (the caller knows whether it is launching a leaf or an agent), not inferred at runtime.
- Default-deny / fail-closed: a spawn with no declared kind is treated as needing suppression and the static guard test fails the build until a kind + suppression is supplied (FR-007, R6).
- Cross-platform: on non-Windows targets both strategies resolve to no-ops / the native PTY path; behavior is unchanged from today.

## Concept 2 — VisibleWindowCount (test/verification signal only)

A transient integer captured by the verification probe (`scripts/count-visible-windows.ps1`) — not part of
the product runtime.

| Field | Type | Meaning |
|---|---|---|
| `count` | integer | Number of **visible** top-level console-host windows (conhost/cmd/powershell/pwsh/WindowsTerminal) at sample time. |
| `sampledAt` | "before" \| "after" | Whether the sample brackets the start or end of the action under test. |

**Invariant under test**: for any approved action or command-execution surface,
`count(after) == count(before)` (SC-001, SC-002). A non-zero delta is a test failure.

## State transitions

None. There is no stateful lifecycle; a spawn is classified once and created with the matching
strategy. The verification count is sampled, compared, and discarded.
