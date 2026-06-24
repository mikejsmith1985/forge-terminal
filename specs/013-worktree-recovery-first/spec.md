# Feature Specification: Recovery-First Worktrees — Re-attach by Default, Provision Only on Explicit Opt-In

**Feature Branch**: `feature/013-worktree-recovery-first`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "fix the worktree solution so that recovery is the first class citizen and concurrent worktrees are secondary. Symptom: new tabs are STILL automatically opening new directories / worktrees, despite specs/012 claiming this was fixed and released in v7.21.0. The prior fix was claimed without real behavioral testing. The new spec must invert the design priority: session/directory recovery (re-attach to the exact directory a tab/session left off in) is the primary, default, guaranteed behavior; spinning up a NEW worktree must be a secondary, explicit, opt-in action — never a silent side effect of opening a tab. Must include real Playwright behavioral proof (window.term.buffer.active) that opening N new tabs does NOT create N new directories/worktrees."

## Problem Evidence

Despite specs/012 shipping in v7.21.0 with a "deterministic resume / no-nesting" claim, opening a new tab in a repository that already has an active pipeline **still silently creates a fresh worktree** and moves that tab's shell into it. The developer did not ask for an isolated worktree; merely opening a second tab on the same project manufactured a new directory.

The reason the v7.21.0 fix did not stop this: it only changed what happens when a session is *already inside* a worktree (re-attach instead of nesting deeper). It did **not** change the default reaction to a brand-new tab. The default reaction is still: "if another tab is already working in this repository, provision a new worktree for the new tab." Concurrency-provisioning is the primary path; recovery is only a narrow special case. The previous fix was also accepted without a real behavioral test that *counts directories before and after opening tabs* — so the regression survived a release.

This feature inverts that priority. **Opening a tab recovers (re-attaches to where that tab/session left off, or stays on the main checkout). It never creates a worktree as a side effect.** Creating a new isolated worktree becomes a deliberate, explicit action the developer takes on purpose.

## Clarifications

### Session 2026-06-24

- Q: When a genuine second concurrent SDD pipeline is requested on a repo that already has an active pipeline (the only case with real shared-state risk, since `.forge/workflow-ticket.json` is one file per project root), what is the default behavior? → A: **Default shared, offer isolation on detected collision.** Both pipelines default to the main checkout; when a second concurrent pipeline is detected, the developer is prompted, and a worktree is created only if they explicitly confirm. The default never silently creates a directory (recovery-first preserved); isolation is surfaced precisely when it matters and only ever created by explicit confirmation.
- Q: What is the proactive surface a developer uses to request isolation up front (before any collision)? → A: **A per-tab action** — a clearly-labeled "Isolate this tab" / "New isolated workspace" control on the tab itself (tab-bar control or tab context menu). Isolation is modeled as a per-tab property, directly discoverable, and gives the behavioral test one concrete affordance to drive. The collision prompt (FR-003) remains the reactive surface; this is the proactive one.
  - **Implementation reconciliation (post-build):** the control was placed in the **SDD dashboard header** (which is scoped to the active tab's pipeline and already receives the worktree binding) rather than in `TabBar.jsx`, for hook cohesion — `requestWorktree` lives in `useSddGate` keyed to the active session, so the dashboard surface needs no extra plumbing. This still satisfies the intent (explicit, discoverable, per-active-tab); moving it onto the tab chip itself remains an available refinement if a non-SDD tab ever needs the control.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Opening tabs never silently creates directories (Priority: P1)

A developer opens the application and opens several terminal tabs on the same project — to run a server in one, tests in another, and ad-hoc commands in a third. Every tab stays in the project's main working directory. No new directories, no `.forge/worktrees/...` folders, and no branch switches happen as a result of opening tabs. The developer's project directory on disk looks exactly the same after opening ten tabs as it did with one.

**Why this priority**: This is the reported bug and the headline promise of the feature. Silent directory creation is surprising, pollutes the repository, fragments the developer's work across folders they never asked for, and is the exact behavior the user says is still happening after a release that claimed to fix it. Until opening a tab is side-effect-free, nothing else matters.

**Independent Test**: With the project open, record the set of directories under the project (including any `.forge/worktrees/` contents). Open N additional tabs on the same project through real UI actions. Re-record the directory set. The two sets are identical — zero directories were created — and every tab reports the same main project directory.

**Acceptance Scenarios**:

1. **Given** a project open in one tab on its main directory, **When** the developer opens a second tab on the same project, **Then** the second tab also operates in the main project directory and no new worktree or directory is created.
2. **Given** a project open in one tab, **When** the developer opens N additional tabs on the same project, **Then** the count of directories on disk under the project is unchanged and all N+1 tabs report the same working directory.
3. **Given** any newly opened tab, **When** it becomes ready, **Then** the developer's shell is in the directory they expect (the project's main directory or the tab's previously recovered directory) and no automatic `cd` into a generated worktree has occurred.

---

### User Story 2 - A reopened tab recovers exactly where it left off (Priority: P1)

A developer had tabs open — some on the main project directory, and possibly one in an isolated worktree they had previously created on purpose. They close the app, it auto-updates, or the machine restarts. When they reopen, each tab re-attaches to the **exact directory it was in before**: main-checkout tabs return to the main checkout, and the deliberately-created worktree tab returns to that same worktree. Nothing drifts, nothing nests, and nothing is newly invented.

**Why this priority**: Recovery is the first-class citizen this feature is named for. The whole point of inverting the priority is that the predictable, guaranteed behavior on reopen is "you land back where you were," so Resume/Continue (which are directory-bound) always operate on the right work. This is equal-priority with US1 because the two together define "recovery-first."

**Independent Test**: Open a main-checkout tab and a deliberately-created worktree tab. Restart the app three times. After each restart, confirm both tabs report the identical absolute directory they had before, with zero added nesting levels and zero newly created directories.

**Acceptance Scenarios**:

1. **Given** a tab running in the main project directory, **When** the app restarts or updates, **Then** the reopened tab re-attaches to that same main directory with no worktree path appended.
2. **Given** a tab running in a deliberately-created worktree, **When** the app restarts, **Then** the reopened tab re-attaches to that same worktree — not a new one and not one nested inside it.
3. **Given** any tab, **When** it is reopened, **Then** recovery happens automatically with no manual directory correction required by the developer.
4. **Given** a tab whose previously-created worktree has since been merged and removed, **When** the developer reopens that tab, **Then** it re-attaches to the main project directory and shows one clear message that the prior worktree no longer exists — it never creates a new or nested directory and never attaches to an unrelated project.

---

### User Story 3 - Creating a concurrent worktree is a deliberate, explicit action (Priority: P2)

A developer who genuinely wants an isolated worktree — to run a concurrent SDD pipeline on the same repository without two pipelines colliding — requests one explicitly. They take a clear, named action ("work in an isolated worktree" / "new isolated workspace"). Only then is a worktree created, anchored under the main checkout, with the tab's shell moved into it and a visible indicator showing the tab is isolated. Concurrent worktrees remain fully supported — they are simply opt-in instead of automatic.

**Why this priority**: The concurrency capability from specs/011 is valuable and must not be lost — it is demoted, not deleted. But because the default path (US1/US2) already removes the surprise, the explicit opt-in is P2: it makes the secondary capability reachable and discoverable without reintroducing the silent behavior.

**Independent Test**: With two tabs open on the same project (both on the main checkout per US1), invoke the explicit "isolated worktree" action from one tab. Confirm exactly one worktree is created under the main checkout's `.forge/worktrees/`, that tab moves into it and shows the isolation indicator, and the other tab is unaffected.

**Acceptance Scenarios**:

1. **Given** two tabs open on the same project on the main checkout, **When** the developer explicitly requests an isolated worktree for one tab, **Then** exactly one worktree is created under the main checkout and only that tab moves into it.
2. **Given** an explicit isolated-worktree request, **When** the worktree is created, **Then** it appears under the main checkout's `.forge/worktrees/` with exactly one nesting level — never inside another worktree.
3. **Given** a tab in an explicitly-created worktree, **When** the developer looks at the tab, **Then** a clear indicator shows it is isolated and on which branch, distinguishing it from main-checkout tabs.
4. **Given** the explicit isolation action is never taken, **When** any number of tabs are opened on the project, **Then** no worktree is ever created (this is the negative guarantee that ties back to US1).
5. **Given** a project with one active SDD pipeline, **When** a developer starts a second concurrent SDD pipeline on the same checkout, **Then** the system surfaces a prompt offering isolation, both pipelines stay on the shared main checkout if the prompt is dismissed, and a worktree is created only if the developer explicitly confirms.

---

### User Story 4 - The fix is proven by a real behavioral test, not a claim (Priority: P1)

The "opening tabs creates no directories" guarantee is backed by an automated test that drives the **real UI**: it opens tabs through real user actions, reads the **rendered terminal state** to confirm each tab's working directory, and asserts on the **actual count of directories on disk** before and after. A passing run of this test — not an assertion that the code looks right — is what certifies the fix. The same test, run against the old behavior, fails (proving it actually detects the regression).

**Why this priority**: The user's core grievance is that the previous fix "was claimed without real behavioral testing" and shipped broken. This story makes the proof itself a first-class deliverable, so the regression cannot be declared fixed again without evidence. It is P1 because without it the feature repeats the exact failure it is meant to correct.

**Independent Test**: Run the behavioral test against the current (broken) behavior and confirm it **fails** (directories increased / tab landed in a generated worktree). Apply the fix and run it again and confirm it **passes** (directory count unchanged, all tabs in the expected directory) — a recorded Red→Green.

**Acceptance Scenarios**:

1. **Given** the recovery-first behavior, **When** the behavioral test opens N tabs and compares the on-disk directory set before and after, **Then** the test passes only if zero directories were created.
2. **Given** the test asserts a tab's working directory, **When** it reads that directory, **Then** it reads the rendered terminal buffer state (the real terminal output the developer sees), not the DOM or a log file.
3. **Given** the previous auto-provisioning behavior, **When** the same test runs against it, **Then** the test fails — demonstrating the test genuinely detects the regression rather than passing vacuously.

---

### Edge Cases

- A tab's recorded directory exists on disk but is no longer a valid worktree (corrupted / partially removed) → recover to the main checkout with one clear message; never create a new or nested directory.
- The project's main directory cannot be located (project moved/renamed) → surface a clear error and decline to recover into a guessed directory rather than inventing one.
- Two tabs recover to the **same** recorded directory → both attach to that one shared directory; neither manufactures a private copy.
- A developer opens many tabs very quickly (rapid concurrent opens on the same project) → each recovers/stays on the main checkout; the race must not let any tab slip into auto-provisioning.
- Worktrees created under the **old** auto-provisioning behavior already exist on disk when this feature ships → they are still recoverable (a tab recorded against one re-attaches to it) and are still safely reclaimed when merged+clean; the inversion does not strand pre-existing worktrees.
- An explicit isolated-worktree request is made but the underlying creation fails → the tab stays on the main checkout with a clear message; it never lands in a half-made or nested directory.
- The explicit opt-in action is invoked from a tab that is already inside an isolated worktree → it does not nest; it either reuses the current worktree or clearly declines, never creating a worktree inside a worktree.

## Requirements *(mandatory)*

### Functional Requirements

**Recovery-first default (US1, US2)**

- **FR-001**: Opening a terminal tab MUST NOT create a git worktree or any new directory as a side effect. Tab creation is recovery/attach only.
- **FR-002**: When a tab opens on a project, the system MUST attach it to the directory that tab/session was last bound to; if there is no prior binding, it MUST attach to the project's main checkout.
- **FR-003**: The presence of another active tab/pipeline on the same repository MUST NOT, by itself, cause a new tab to be silently isolated into a worktree. Concurrency alone is never a trigger for automatic provisioning. When — and only when — a genuine second **concurrent SDD pipeline** is detected on the same checkout (the case with real shared-state collision risk), the system MUST surface a prompt offering isolation; both pipelines remain on the shared main checkout unless the developer explicitly confirms isolation.
- **FR-004**: On app restart or update, the system MUST re-attach every reopened tab to the exact absolute directory it previously occupied (main checkout or a previously-created worktree), with no drift, no added nesting, and no manual `cd` required.
- **FR-005**: When a tab's recorded worktree directory no longer exists or is not a valid worktree, the system MUST re-attach the tab to the main checkout and surface exactly one clear message — never creating a new or nested directory and never attaching to an unrelated project.
- **FR-006**: Resume and Continue MUST operate against the tab's recovered directory without any manual directory correction by the developer.

**Explicit opt-in worktree (US3)**

- **FR-007**: The system MUST provide a deliberate, clearly-labeled **per-tab action** (a tab-bar control or tab context-menu item, e.g. "Isolate this tab" / "New isolated workspace") by which a developer requests an isolated worktree for that tab. A worktree is created only in response to explicit consent — either this proactive per-tab action invoked directly by the developer, or confirmation of the reactive collision prompt of FR-003. In both cases the developer's explicit consent is the sole creation trigger.
- **FR-008**: When an isolated worktree is explicitly requested, the system MUST anchor its location to the repository's main checkout (creating it under the main checkout's `.forge/worktrees/`), never relative to a tab's current directory, so a worktree can never be created inside another worktree.
- **FR-009**: The system MUST guarantee at most one level of `.forge/worktrees/` beneath the main checkout, and MUST detect and refuse any path that would nest a worktree within an existing worktree, including when the explicit action is invoked from inside a worktree.
- **FR-010**: When a tab is in an explicitly-created worktree, the system MUST display a clear indicator that the tab is isolated and on which branch, distinguishing it from main-checkout tabs.
- **FR-011**: If explicit worktree creation fails, the system MUST keep the tab on the main checkout with a clear message and MUST NOT leave the tab in a partially-created or nested directory.

**Continuity with prior behavior**

- **FR-012**: Worktrees created under the previous automatic behavior MUST remain recoverable and MUST remain eligible for the existing safe cleanup (removed only when provably merged and clean); the inversion MUST NOT strand or orphan pre-existing worktrees. **Recovery boundary (documented after implementation):** such pre-existing worktrees have no durable record, so they re-attach when the tab is *entered directly* (the working directory is the worktree path); when the tab instead reports the main checkout, it stays on the main checkout (it is never stranded, but it is also not auto-recovered into the old worktree). New worktrees created via the explicit opt-in always carry a record and recover unconditionally. Verified by `TestResolveWorkspace_RecordlessWorktree` (both branches).
- **FR-013**: The concurrent-worktree capability MUST be preserved in full as an opt-in path; this feature changes *when* a worktree is created (explicit request), not *whether* concurrent worktrees are supported.

**Behavioral proof (US4)**

- **FR-014**: The recovery-first guarantee MUST be backed by an automated test that drives the real UI, opens multiple tabs through real user input, and asserts that the count of directories on disk under the project is unchanged afterward.
- **FR-015**: The test MUST determine each tab's working directory by reading the rendered terminal buffer state (the real terminal output a developer sees), not the DOM or a log file.
- **FR-016**: The test MUST be demonstrated to fail against the previous auto-provisioning behavior and pass against the recovery-first behavior (a recorded Red→Green), so it provably detects the regression rather than passing vacuously.
- **FR-017**: This feature MUST NOT be reported as complete on the basis of code inspection, compilation success, or any non-behavioral evidence; only a passing run of the behavioral test certifies it.

### Key Entities *(include if feature involves data)*

- **Tab Binding**: The durable association between a terminal tab/session and the absolute working directory it operates in (main checkout or a specific worktree), used to recover the tab deterministically on reopen.
- **Worktree Request**: The explicit, developer-initiated intent to create an isolated worktree for a tab — the *only* trigger that results in a worktree being created.
- **Directory Inventory**: The set of directories on disk under a project at a point in time, captured before and after tab operations to prove (FR-014) that opening tabs created none.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening any number of tabs on a project creates **zero** new directories or worktrees in 100% of trials — the on-disk directory count is unchanged.
- **SC-002**: In 100% of restarts/updates, a reopened tab recovers to the identical absolute directory it occupied before, whether that was the main checkout or a deliberately-created worktree.
- **SC-003**: Zero worktrees are ever created without a corresponding explicit developer request.
- **SC-004**: Zero recursively nested worktree directories are ever created (no `.forge/worktrees/.../.forge/worktrees/...`), across any number of restarts and explicit requests.
- **SC-005**: A developer can resume prior work after an app update in under 10 seconds with no manual directory correction.
- **SC-006**: The recovery-first behavior is certified by a behavioral test that is shown to fail on the old behavior and pass on the new behavior — 100% of releases of this feature carry that recorded Red→Green evidence.
- **SC-007**: An explicit isolated-worktree request creates exactly one worktree under the main checkout and isolates only the requesting tab, in 100% of trials, with the isolation indicator shown.

## Assumptions

- **Builds on the specs/011 + 012 mechanics**: The worktree provisioning primitive, the main-checkout resolver, the no-nesting guard, the per-tab session binding, the safe cleanup, and the startup sweep already exist (specs/011, 012). This feature re-wires *when* provisioning happens (explicit request only) and elevates recovery to the default; it does not re-implement the underlying git mechanics.
- **Root cause of the persisting symptom**: The default reaction to a new tab in a repository that already has an active pipeline is still automatic worktree provisioning. The specs/012 fix only changed the already-inside-a-worktree case. This feature removes concurrency-as-a-trigger (FR-003) and replaces it with explicit opt-in (FR-007).
- **Opt-in mechanism is an explicit UI/command action**: "Explicit" means a clearly-labeled, developer-initiated action (e.g., a tab/command action such as "New isolated workspace"), not a configuration flag the developer must discover, and never an inferred trigger. The exact surface is a design decision for the plan; the requirement is that it is deliberate and discoverable.
- **Recovery key is the existing per-tab binding**: A tab knows "where it left off" via the per-tab session binding already established in prior SDD work; this feature relies on that binding being persisted across restarts.
- **Constitution Article X is the proof standard, now applied to this fix**: Behavioral proof reads the rendered terminal buffer state (`window.term.buffer.active`), never the DOM, and rejects "it compiles" / HTTP-status as proof — consistent with the existing standard, here applied specifically to the directory-count proof.
- **Playwright via the dev harness**: UX/behavioral validation uses the project's Playwright harness launched via the dev harness (`run-dev-clean.ps1`), never a built binary, consistent with Article V.
- **Local, single developer, git-backed repository**: Applies to git repositories on one running application on one machine; multi-user/remote coordination is out of scope.
- **Pre-existing auto-created worktrees are honored, not purged**: Worktrees already created by the old behavior remain recoverable and are reclaimed only by the existing safe (merged+clean) cleanup; this feature does not mass-delete them.
