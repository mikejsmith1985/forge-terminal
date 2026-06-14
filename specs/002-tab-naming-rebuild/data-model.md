# Phase 1 Data Model: Tab Naming Rebuild

## Tab (simplified)

| Field | Type | Notes |
|---|---|---|
| `id` | string | unchanged |
| `title` | string | the display label — **set once at creation**, never recomputed from terminal output |
| `isManuallyRenamed` | bool | set true when the user renames the tab; blocks any automatic relabel |
| `currentDirectory` | string | still tracked (git panel / release manager) — but no longer feeds `title` |
| (other fields) | — | unchanged (shellConfig, colorTheme, mode, …) |

**Validation**: `title` is non-empty and contains no control characters.

## Label computation (pure functions, new `tabLabel.js`)

- `computeTabLabel(initialCwd) → string` — returns the project-root folder via auto-detection (`extractProjectFolder` without the configured-root param), strips non-printable chars, falls back to the immediate folder name (or `Terminal`) when no cwd.
- `dedupeLabel(label, existingLabels) → string` — returns `label` if free, else `label #2`, `#3`, … (lowest free suffix).

Both are deterministic and side-effect free → trivially unit-testable.

## Label registry

The set of active tabs' labels, consulted only by `dedupeLabel` at creation to pick the suffix. Not persisted separately — derived from open tabs.

## State transitions

`new tab` → `computeTabLabel(cwd)` → `dedupeLabel(...)` → `title` fixed. Thereafter `title` changes **only** via explicit user rename (which sets `isManuallyRenamed`). `currentDirectory` may change freely with navigation and never affects `title`.

## Removed / changed persistence

- **Removed**: `tab-defaults.json` fields `NamingStrategy`, `NamingPrefix`, `NamingRootFolder`; localStorage `forge:tabNamingStrategy|Prefix|RootFolder`.
- **Kept**: `sessions.json` `TabState.Title` (write-once) and `CurrentDirectory`; theme-related `tab-defaults` fields.
