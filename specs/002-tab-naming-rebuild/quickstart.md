# Quickstart: Validating the Tab Naming Rebuild

Run-the-app proof per Article X (read the tab label / `window.term.buffer`, not assumptions).
Launch via `run-dev-clean.ps1` (never the built binary) for the UX scenarios.

## Scenario A — Deep navigation never renames (P1, SC-001) — THE bug

1. Open a tab in `C:\ProjectsWin\forge-terminal`. Label shows `forge-terminal`.
2. In the terminal, `cd` deep: `frontend/src/components`, then into other projects' subfolders, 10+ levels.
3. **Expected**: the tab label stays `forge-terminal` the entire time — 0 changes.

**Pass**: label byte-identical before and after; no flicker.

## Scenario B — No control-character corruption (SC-002)

1. With a tab open, run a process that emits terminal title escape sequences and OSC 9;9 cwd notices (e.g. an agent session that sets the window title).
2. **Expected**: the label is unaffected and shows only the clean project name — no `¶`, `*`, or escape fragments.

## Scenario C — Duplicate projects get #N (P2, SC-003)

1. Open two tabs both resolving to `forge-terminal`.
2. **Expected**: labels are `forge-terminal` and `forge-terminal #2`.
3. Close `#2`, open another same-project tab → it becomes `#2` again (lowest free suffix).

## Scenario D — No configuration exists (P3, SC-004)

1. Open Settings → Tab Controls.
2. **Expected**: there is no Tab Naming strategy section / radio options at all.
3. Confirm no `forge:tabNaming*` localStorage keys and no naming fields in `tab-defaults.json` are written.

## Scenario E — Manual rename sticks (FR-009)

1. Double-click a tab, rename to `my-thing`, navigate deep.
2. **Expected**: label stays `my-thing` (user rename wins; navigation never overrides).

## Scenario F — Fallback outside a projects folder (FR-007)

1. Open a tab in a path not under a known projects root (e.g. a home dir).
2. **Expected**: label is the immediate folder name (or `Terminal`), and is still fixed for the tab's life.
