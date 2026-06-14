# Contract: Tab Label

The single, fixed rule that replaces the strategy system.

## The rule

1. A tab's label is computed **once**, at tab creation, from the tab's initial working directory:
   `label = dedupeLabel(computeTabLabel(initialCwd), activeLabels)`.
2. `computeTabLabel` returns the **project-root folder** (auto-detected; e.g. `forge-terminal`), with non-printable characters stripped, and a fallback to the immediate folder name (or `Terminal`) when no cwd is available.
3. `dedupeLabel` appends ` #N` (first = no suffix, then ` #2`, ` #3`, …).

## Invariants (must hold; each maps to a Success Criterion)

| Invariant | Maps to |
|---|---|
| After creation, no directory navigation, shell prompt, or terminal title/cwd escape sequence changes the label | SC-001, FR-003, FR-004 |
| A label never contains control characters or escape-sequence fragments | SC-002, FR-005 |
| Two same-project tabs are distinct (`name`, `name #2`) | SC-003, FR-006 |
| No tab-naming configuration is read or written | SC-004, FR-008 |
| A user-renamed label is never overwritten by the automatic label | FR-009 |

## Decoupling contract (the fix)

- The OSC 9;9 handler MAY update `tab.currentDirectory`.
- The OSC 9;9 handler, `handleDirectoryChange`, and any OSC title (0/2) handler MUST NOT call `updateTabTitle` or otherwise change `tab.title`.
- There is exactly **one** producer of an automatic label: `computeTabLabel`+`dedupeLabel` at creation. No other code path may set `tab.title` except an explicit user rename.
