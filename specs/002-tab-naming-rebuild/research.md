# Phase 0 Research: Tab Naming Rebuild

## R1 — Find the project root without any configuration

**Question**: With the configurable root-folder setting deleted, how does the label know which path segment is the "project"?

**Decision**: Reuse `extractProjectFolder`'s **auto-detection** — it already recognizes known container folders (`projectswin`, `repos`, `workspace`, `workspaces`, `projects`) and returns the first child, with sensible drive/absolute-path fallbacks. Drop the `rootFolder` parameter entirely.

**Rationale**: This is exactly "just works, no config." The auto-detect path already exists and is tested; removing the configured-folder branch simplifies it. For `C:\ProjectsWin\forge-terminal\frontend\src` it yields `forge-terminal` regardless of depth.

**Alternatives considered**:
- *Keep a single configured root* — rejected: the user explicitly wants zero configuration.
- *Always use the deepest folder* — rejected: that's the "current-dir" behavior that causes the renaming.

## R2 — Decouple cwd tracking from tab naming (the actual fix)

**Question**: The OSC 9;9 handler both (a) tracks cwd and (b) renames the tab. Other features (git panel, release manager) need cwd. How do we keep (a) and kill (b)?

**Decision**: Keep the OSC 9;9 handler and `updateTabDirectory` (cwd tracking), but **remove the title-mutation call** (`getTabTitle` → `updateTabTitle`) from `handleDirectoryChange`. After this, `handleDirectoryChange` updates `currentDirectory` only.

**Rationale**: The label is set once at creation; cwd can keep updating for unrelated features without ever feeding the label. This severs the single edge responsible for both the deep-nav rename and the control-character corruption (raw OSC payload never reaches the label).

**Alternatives considered**:
- *Sanitize harder in the existing path* — rejected: that's the patch approach that has failed repeatedly; the title must simply never be recomputed from terminal output.

## R3 — Removing persisted naming state safely

**Question**: Naming state lives in `tab-defaults.json` (`NamingStrategy/Prefix/RootFolder`), localStorage (`forge:tabNaming*`), and indirectly drives `retitleAllTabsFromCwd`. What happens to existing installs?

**Decision**: Remove the three Go fields and the three localStorage keys; ignore any persisted values on read. `sessions.json` keeps `Title` (now written once at creation) and `CurrentDirectory`. Delete `retitleAllTabsFromCwd` and the startup naming-sync effect.

**Rationale**: Non-breaking — nothing else reads these. Stale values are simply never consulted. Theme-related `tab-defaults` fields are untouched.

## R4 — Control characters never reach the label

**Decision**: Because the label is computed only from the initial cwd string (a sanitized path) via `extractProjectFolder`, and never from OSC title (OSC 0/2) or raw OSC 9;9 payloads, the corruption class (`reactive*¶9…`) is structurally impossible. Add a final guard in `computeTabLabel` that strips any non-printable characters as defense-in-depth.

## R5 — Manual rename precedence

**Decision**: A tab carries an `isManuallyRenamed` flag (or equivalent). Once a user renames a tab, the automatic label never overrides it. Since the automatic label is only set at creation anyway, this is mostly already true; the flag makes it explicit and survives session restore.
