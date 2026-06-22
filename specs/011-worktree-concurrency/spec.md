# Feature Specification: Automated Worktrees for Concurrent Same-Repo Pipelines

**Feature Branch**: `011-worktree-concurrency`

**Created**: 2026-06-22

**Status**: Draft

**Input**: User description: "I would like you to implement the ability to automate worktrees so that I can work concurrent speckit phases within the same repo at any time."

## Clarifications

### Session 2026-06-22

- Q: When is an isolated workspace provisioned? → A: Lazy — the first pipeline uses the repo's main checkout; a dedicated worktree is provisioned only for the 2nd-and-later concurrent pipeline in the same repo.
- Q: Where do isolated workspaces physically live? → A: Inside the repo, under a dedicated git-excluded folder (e.g., `.forge/worktrees/<feature>/`) — one known, predictable location that never shows up in the user's git status.
- Q: What branch does an isolated workspace check out? → A: Auto-create a `feature/<spec-dir-name>` branch (e.g., `feature/011-worktree-concurrency`) from the current base branch, matching the repo's existing `feature/*` convention — one branch per feature, deterministic for collision checks.
- Q: What triggers cleanup of an isolated workspace? → A: Safe-only auto-cleanup — remove on tab close and on a startup sweep ONLY if the branch is fully merged into base and the working tree is clean; any workspace with un-merged or uncommitted work is kept and the developer is warned.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a second pipeline in the same repo without collision (Priority: P1)

A developer has an SDD pipeline already running in one tab of a repository (say, implementing feature A). Without closing or pausing it, they open a new tab on the **same repository** and begin a new pipeline (specifying feature B). The system automatically gives the new pipeline its own isolated workspace so the two pipelines never touch each other's files, active-feature pointer, or change history. The developer issues no manual setup commands — they just start working.

**Why this priority**: This is the entire point of the feature and the unmet need today. Without it, a second same-repo pipeline silently corrupts the first (repointed active feature, spurious gates, mis-attributed change reports). Delivering only this story already makes concurrent same-repo work safe.

**Independent Test**: Open two tabs on one repo, start a pipeline in each, advance both through a phase, and confirm each pipeline's state, gate, and report reflect only its own work — verified by reading each tab's reported state, not the other's.

**Acceptance Scenarios**:

1. **Given** a repo with one active pipeline in tab A, **When** the developer starts a new pipeline in tab B on the same repo, **Then** tab B is automatically bound to a separate isolated workspace and tab A's pipeline state is unchanged.
2. **Given** two concurrent same-repo pipelines, **When** the developer writes a phase artifact in tab B, **Then** tab A does not open a gate, does not change its active feature, and does not list tab B's file changes.
3. **Given** the developer starts the **first** pipeline in a repo with no other active pipeline, **When** it begins, **Then** it proceeds normally without imposing an isolated workspace (no behavior change for the common single-pipeline case).

---

### User Story 2 - Each pipeline reports only its own work (Priority: P2)

When two concurrent same-repo pipelines reach a decision gate, each developer-facing report card shows the files touched, scope, and decisions **for that pipeline alone**. No change made in one workspace appears in the other's report.

**Why this priority**: Trust in the dashboard is the headline value of the preceding work (specs/010). Concurrency is only useful if the per-phase report stays accurate; an isolated workspace that still produced cross-contaminated reports would defeat the purpose.

**Independent Test**: Drive two same-repo pipelines to a gate after each edits a distinct set of files; confirm each report card lists exactly its own files with correct +/- counts and none from the sibling pipeline.

**Acceptance Scenarios**:

1. **Given** pipeline A changed 3 files and pipeline B changed 2 different files concurrently, **When** each reaches its gate, **Then** A's report shows exactly its 3 files and B's shows exactly its 2, with no overlap.
2. **Given** a pipeline whose phase changed no files, **When** it reaches its gate, **Then** its report reads "No files changed" regardless of activity in the sibling pipeline.

---

### User Story 3 - See, resume, and clean up isolated pipelines (Priority: P3)

The developer can tell which isolated workspace (and branch) a tab is bound to, return to an existing one, and have abandoned workspaces cleaned up automatically — without leaving orphaned directories or branches behind, and without ever destroying unmerged work silently.

**Why this priority**: Lifecycle hygiene. The MVP is safe concurrency (P1) with trustworthy reports (P2); managing the accumulation of isolated workspaces over time prevents the feature from degrading the repo into a litter of stale directories, but is not required for the first useful slice.

**Independent Test**: Create several isolated pipelines, complete some and abandon others, restart the application, and confirm completed workspaces are reclaimed, unmerged work is preserved with a warning, and each tab still shows its binding.

**Acceptance Scenarios**:

1. **Given** an isolated pipeline bound to a tab, **When** the developer looks at the tab, **Then** they can see which workspace and branch it is operating in.
2. **Given** a pipeline whose work has been merged/finished, **When** it is closed, **Then** its isolated workspace is removed and no orphaned directory or branch remains.
3. **Given** an isolated workspace with un-merged changes, **When** cleanup would remove it, **Then** the system preserves it and warns rather than discarding the work.
4. **Given** the application is restarted, **When** it reopens, **Then** existing isolated workspaces are re-discovered and re-bindable rather than orphaned.

---

### Edge Cases

- What happens when the developer starts a second pipeline while the main checkout has **uncommitted changes**? (Isolation must not require stashing or discarding the developer's in-progress edits in the primary workspace.)
- What happens when two pipelines target the **same feature** in the same repo at the same time? (Must not create two conflicting workspaces for one feature.)
- How does the system handle a **branch-name collision** when provisioning an isolated workspace?
- What happens when an isolated workspace **cannot be created** (insufficient disk, repository lock, not a git repository)? (Must surface a clear failure and degrade safely, not corrupt the existing pipeline.)
- What happens to an isolated workspace when its **tab is closed abruptly** or the app crashes? (Must be reclaimable, not permanently orphaned.)
- How does the system behave when the developer opens **many** concurrent pipelines (e.g., 5+) on one repo? (Should remain correct, with a sensible upper bound if one is needed.)
- What happens when a pipeline in an isolated workspace **finishes and its branch is merged** — is the workspace still safe to remove?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect when a newly started pipeline would run concurrently with an already-active pipeline in the **same** repository.
- **FR-002**: The system MUST automatically provision an **isolated workspace** for a concurrent same-repo pipeline, with no manual setup commands required from the developer.
- **FR-003**: Each concurrent pipeline MUST operate against its own working files, its own active-feature designation, and its own change-detection window, such that no pipeline observes or is affected by another's in-flight changes.
- **FR-004**: The terminal tab/session that started a concurrent pipeline MUST run its commands inside that pipeline's isolated workspace.
- **FR-005**: The **first** pipeline in a repo MUST continue to operate in the repository's primary workspace without forced isolation (single-pipeline behavior is unchanged).
- **FR-006**: Each pipeline's phase report (files touched, scope, decisions) MUST reflect only the changes made within that pipeline's own workspace.
- **FR-007**: The system MUST make visible, per tab, which isolated workspace and branch the tab is bound to.
- **FR-008**: The system MUST preserve the developer's uncommitted changes in the primary workspace when provisioning an isolated workspace for a different pipeline.
- **FR-009**: The system MUST prevent two concurrent pipelines from being provisioned for the same feature in the same repository; because each workspace's branch is derived deterministically from the feature name, a request for an already-provisioned feature MUST re-bind to the existing workspace rather than create a duplicate.
- **FR-010**: The system MUST auto-create the workspace's branch using the `feature/<spec-dir-name>` convention from the current base branch, and resolve collisions deterministically (re-use when the existing branch already belongs to this feature; otherwise disambiguate) rather than failing ambiguously or overwriting an existing branch or workspace.
- **FR-011**: The system MUST auto-remove an isolated workspace (its directory and worktree registration) on tab close and on a startup sweep, but ONLY when it is provably safe — the workspace's branch is fully merged into its base branch AND its working tree is clean — leaving no orphaned directory or stale branch for completed work.
- **FR-012**: The system MUST NOT auto-remove an isolated workspace that contains **un-merged or uncommitted** work; it MUST retain the workspace and warn the developer, so cleanup can never silently destroy unlanded work.
- **FR-013**: The system MUST re-discover existing isolated workspaces after an application restart so they can be resumed rather than orphaned.
- **FR-014**: The system MUST surface a clear, actionable error and degrade safely (without corrupting the existing pipeline) when an isolated workspace cannot be provisioned.
- **FR-015**: The system MUST keep every existing concurrency guarantee from the per-session pipeline model (per-tab identity, session-scoped gates) intact, so isolation is additive and never reintroduces cross-session conflation.
- **FR-016**: Isolated workspaces MUST reside in a single, predictable repo-local location that is excluded from the repository's version-control status, so they never appear as untracked changes in the developer's primary checkout and can be enumerated from one known path for re-discovery and cleanup.

### Key Entities *(include if feature involves data)*

- **Isolated Workspace**: A self-contained working area for one pipeline within a single repository, holding that pipeline's own working files, active-feature designation, and change baseline. Bound to exactly one terminal session/tab and to one auto-created `feature/<spec-dir-name>` branch.
- **Pipeline Binding**: The association between a terminal tab/session, its repository, and the isolated workspace (if any) it operates in. Determines where commands run and which workspace a phase report is scoped to.
- **Workspace Registry**: The durable record of which isolated workspaces exist for a repository, enabling re-discovery after restart and orphan cleanup. Backed by the single known repo-local location (FR-016) so enumeration never depends on scanning arbitrary paths.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can run two pipelines on the same repository at the same time and, in 100% of cases, neither pipeline's reported state, gate, or change report is altered by the other.
- **SC-002**: Starting a concurrent same-repo pipeline requires **zero** manual workspace-setup commands from the developer.
- **SC-003**: Each concurrent pipeline's phase report lists exactly the files it changed (no missing files, no files from sibling pipelines) in 100% of validation runs.
- **SC-004**: A concurrent isolated pipeline is ready for the developer to start working within 5 seconds of opening it.
- **SC-005**: After completing or abandoning concurrent pipelines, no orphaned workspace directories or stale branches remain, and any workspace with un-merged work is preserved with a warning in 100% of cases.
- **SC-006**: After an application restart, 100% of still-existing isolated workspaces are re-discovered and re-bindable.
- **SC-007**: The single-pipeline experience (one pipeline in a repo) is unchanged — no new setup step, prompt, or workspace is introduced for it.

## Assumptions

- **Lazy provisioning** (decided in Clarifications): An isolated workspace is created only when a pipeline would run **concurrently** with an existing one in the same repo. The first/only pipeline keeps using the repository's primary checkout (FR-005, SC-007), keeping the common single-pipeline path unchanged.
- **One feature per workspace**: Each isolated workspace corresponds to exactly one feature/branch, consistent with the existing one-active-feature-per-checkout model that this feature is working around.
- **GitHub Flow for reintegration**: Work produced in an isolated workspace returns to the main line via the project's normal pull-request flow (Constitution Article III); this feature provisions and cleans up workspaces but does not auto-merge to `main`.
- **Reuses existing identity model**: Per-tab session identity and session-scoped gates from the prior pipeline work are assumed present and are extended, not replaced (FR-015).
- **Git-backed repositories**: Concurrency isolation applies to git repositories; a non-git working directory continues to run a single pipeline with a clear message rather than isolation.
- **Local, single developer**: Concurrency is across tabs of one running application on one machine; multi-user or remote coordination is out of scope for this feature.
