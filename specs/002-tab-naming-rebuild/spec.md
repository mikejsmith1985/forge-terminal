# Feature Specification: Tab Naming Rebuild

**Feature Branch**: `feature/tab-naming-rebuild`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "The tab name constantly gets renamed the deeper into a filestructure the agent goes. Delete the tab naming logic and rebuild it from the ground up. The tab will explicitly show the Application/Workspace/Project name, and if more than one exists append a # to the end. No configuration rules — just make it work."

## Problem (why)

Today tab naming is a 6-strategy configurable system. Even with the "Project Root" strategy selected — which promises *"stays stable no matter how deep you navigate"* — the tab is still renamed by live terminal output as an agent `cd`s deeper into a project, and the title is sometimes corrupted with raw control characters (e.g. `reactive*¶9…`). The explicit setting does not win. This has failed repeatedly across many attempts. The fix is not another patch on the strategy system — it is to **delete that system** and replace it with one fixed, stable behavior.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tab name never changes while navigating (Priority: P1)

A developer opens a terminal tab in a project. The agent (or the user) navigates many directories deep to solve a complex problem. The tab keeps showing the project name the entire time.

**Why this priority**: This is the entire point. The instability during deep navigation is the bug that has recurred for months.

**Independent Test**: Open a tab in a project, `cd` 10+ levels deep (and into sibling projects' subfolders), and confirm the tab label is byte-for-byte unchanged throughout.

**Acceptance Scenarios**:

1. **Given** a tab opened in project `forge-terminal`, **When** the shell/agent changes directory to any depth within it, **Then** the tab label remains `forge-terminal`.
2. **Given** a running agent emits terminal title escape sequences (OSC 0/2) or cwd notifications (OSC 9;9), **When** those arrive, **Then** the tab label does not change and never shows control characters.
3. **Given** the shell navigates outside the project into another path, **When** the prompt updates, **Then** the tab label still shows the original project the tab was opened for.

---

### User Story 2 - Duplicate project names are disambiguated (Priority: P2)

A developer opens two tabs that resolve to the same project name. The second (and later) tabs get a numeric suffix so they can be told apart.

**Why this priority**: Needed for multi-tab work on the same project; without it duplicate tabs are indistinguishable.

**Independent Test**: Open two tabs in the same project and confirm labels are `forge-terminal` and `forge-terminal #2`.

**Acceptance Scenarios**:

1. **Given** one tab labeled `forge-terminal`, **When** a second tab resolves to the same project, **Then** it is labeled `forge-terminal #2`.
2. **Given** tabs `forge-terminal` and `forge-terminal #2`, **When** `forge-terminal #2` is closed and a new same-project tab opens, **Then** it takes the lowest free suffix (`#2`).

---

### User Story 3 - No tab-naming configuration exists (Priority: P3)

A developer opening Settings finds no tab-naming strategy options — naming "just works" with the one fixed behavior.

**Why this priority**: The user explicitly does not want configuration; the strategy system is the source of the drift and confusion and must be gone.

**Independent Test**: Open Settings → confirm the Tab Naming strategy section is absent and no tab-naming preference is read or written anywhere.

**Acceptance Scenarios**:

1. **Given** the Settings panel, **When** a developer opens Tab Controls, **Then** there are no tab-naming strategy choices.
2. **Given** an existing install that had a saved tab-naming strategy preference, **When** the app starts after the rebuild, **Then** the stale preference is ignored (no behavior depends on it).

---

### Edge Cases

- **Not inside a projects folder** (e.g. a home dir or a one-off path): the tab shows the immediate folder name as a sensible fallback; it is still fixed for the life of the tab.
- **Project folder renamed/moved mid-session**: the tab keeps its label (label is fixed at creation; it does not chase the filesystem).
- **Very long project names**: the label is display-truncated with an ellipsis but the full name is available on hover (tooltip).
- **A manual user rename of a tab** (if that feature exists): a user-set label wins and is never overwritten by the automatic name.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST delete the existing multi-strategy tab-naming logic and its settings UI entirely (no strategy enum, no per-strategy code paths, no saved preference).
- **FR-002**: A tab's label MUST be the workspace/project name — the project-root folder (the first child of the configured projects folder; e.g. `forge-terminal`).
- **FR-003**: A tab's label MUST be computed once when the tab is created and MUST NOT change for the life of the tab in response to directory navigation, shell prompts, or terminal title/cwd escape sequences.
- **FR-004**: Terminal-emitted title sequences (OSC 0/2) and cwd notifications (OSC 9;9) MUST NOT be used to set or update the tab label.
- **FR-005**: A tab label MUST never contain control characters or raw escape-sequence fragments.
- **FR-006**: When multiple tabs resolve to the same project name, the system MUST append a numeric suffix (` #2`, ` #3`, …); the first tab carries no suffix.
- **FR-007**: When a path is not inside the configured projects folder, the system MUST fall back to the immediate current-directory name, applied with the same fixed-at-creation rule.
- **FR-008**: The system MUST NOT read or require any user configuration to name tabs.
- **FR-009**: If a user explicitly renames a tab by hand, that label MUST be preserved and never overwritten by the automatic naming.

### Key Entities *(include if feature involves data)*

- **Tab**: a terminal session shown as a labeled tab. Holds a fixed display label set at creation and an optional user-overridden label.
- **Workspace/Project name**: the project-root folder name derived from the tab's initial working directory.
- **Label registry**: the set of active tab labels, used only to compute the next free numeric suffix for duplicates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Navigating to any depth (tested to 10+ levels, including into other directories) produces **0** changes to a tab's label.
- **SC-002**: Tab labels contain **0** control characters across all scenarios, including when the running program emits title/cwd escape sequences.
- **SC-003**: Two tabs in the same project are always distinguishable (`name` vs `name #2`) — 100% of duplicate cases disambiguated.
- **SC-004**: The Settings UI exposes **0** tab-naming strategy options after the rebuild.
- **SC-005**: A tab opened in a project shows that project's name within the first render (no flicker from an interim name).

## Assumptions

- "Application / Workspace / Project name" are one concept: the project-root folder (first child of the configured projects folder) — what the old "Project Root" option *meant*, now the only behavior.
- The configured projects folder concept already exists (the old Project Root strategy relied on it) and is reused for resolution.
- Removing the saved tab-naming preference is non-breaking: nothing else depends on it. Any persisted value is simply ignored.
- Manual per-tab rename, if present today, is retained; the rebuild only governs the automatic label.
