# Feature Specification: Repeatable SDD — Deterministic Resume + Enforced TDD & Playwright UX Validation

**Feature Branch**: `012-tdd-sdd-enforcement`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "I want repeatability and predictability. I want to be able to resume a session regardless of whether it was in a worktree or in the base dir and right now that's not possible … I want TDD added to the SDD process. I want to enforce actual testing and validation with Playwright from a USER EXPERIENCE perspective, not grep or curl commands."

## Problem Evidence

A captured terminal prompt showed a session whose working directory had become:

```
C:\ProjectsWin\AzureWorkflowPOC\.forge\worktrees\tab-4-ciryufsz0\.forge\worktrees\tab-4-t0jl6s874
```

A worktree had been provisioned **inside another worktree**, recursively, because the provisioning location was resolved relative to the session's *current* directory rather than the repository's main checkout. Every app restart drove the session one directory level deeper, so the path was never stable and a directory-bound Resume/Continue could never re-attach to prior work. This is the concrete, reproducible failure that motivates the "deterministic resume" half of this feature; the "hollow verification" half is motivated by phases being marked complete on evidence (compiles / HTTP 200 / grep / curl) that does not prove user-facing behavior.

## Clarifications

### Session 2026-06-24

- Q: Should the TDD and Playwright validation gates be advisory warnings or hard blocks that stop a phase from completing? → A: **Hard blocks.** A behavior-changing phase cannot be marked complete until the testing evidence exists. This matches the existing PreToolUse enforcement model (specs/008) and Constitution Articles V and X, which already mandate Red→Green→Refactor and behavioral proof; this feature makes that mandate mechanically enforced rather than documentary.
- Q: What counts as acceptable proof for a user-facing change? → A: A Playwright test that drives the **real UI** through real input (keyboard/click) and asserts on the **actually rendered result** (for terminal output, the xterm.js buffer model, per Article X). `grep`, `curl`, log scraping, "it compiles," and "the endpoint returned 200" are explicitly rejected as proof of user-facing behavior.
- Q: Where does a resumed session re-attach when its original worktree no longer exists (merged/cleaned up)? → A: It falls back to the repository's **main checkout** with a clear, single message explaining the worktree is gone — never into a nested or newly-invented directory, and never silently into the wrong feature.
- Q: Does the TDD gate apply to every phase? → A: Only to phases that change executable behavior. Documentation-only or pure-refactor phases (no behavioral change) may pass with a recorded, human-readable exemption reason, so the gate cannot be dodged silently but also does not block legitimate non-code work.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume any session in the same directory it left, every time (Priority: P1)

A developer has a session open — either in the repository's main checkout or in a specific isolated worktree. They close the app, update it, or restart their machine. When they reopen the tab, the session re-attaches to **the exact same working directory** it was in before, so Resume and Continue immediately operate on the prior work. The working directory never drifts, never nests inside another worktree, and never silently lands in a different feature.

**Why this priority**: This is the headline failure. Without a stable directory, Resume/Continue — which are directory-bound — cannot work, and every other SDD guarantee is moot because the developer loses their place on every restart. The captured nested-worktree path proves the directory is currently non-deterministic.

**Independent Test**: Open a session in the base checkout and a second in an isolated worktree; restart the app three times; after each restart confirm both tabs report the identical absolute directory they started in, with zero added `.forge/worktrees/...` nesting levels.

**Acceptance Scenarios**:

1. **Given** a session running in the repository main checkout, **When** the app is restarted or updated, **Then** the reopened session re-attaches to the same main-checkout directory with no worktree path appended.
2. **Given** a session running in an isolated worktree, **When** the app is restarted, **Then** the reopened session re-attaches to that same worktree directory — not a new one, and not one nested inside it.
3. **Given** any session, **When** a new worktree is later provisioned for a different session, **Then** the new worktree is created under the **repository main checkout's** `.forge/worktrees/` path, never under another worktree's directory, so no recursive nesting can occur.
4. **Given** a session whose original worktree has been merged and cleaned up, **When** the developer reopens that tab, **Then** the session re-attaches to the repository main checkout and shows one clear message that the prior worktree no longer exists — it does not create a new nested directory or attach to an unrelated feature.
5. **Given** the same repository opened across several restarts, **When** the developer inspects the worktree location on disk, **Then** there is exactly one `.forge/worktrees/` directory level beneath the main checkout — never a chain of nested ones.

---

### User Story 2 - A behavior change cannot pass without a test that failed first (Priority: P1)

When an SDD phase changes executable behavior, the pipeline refuses to mark that phase complete unless a corresponding test was written, observed to **fail** against the unbuilt behavior (Red), and then observed to **pass** once the behavior was implemented (Green). A phase that produces implementation code with no first-failing test is blocked with a clear, actionable message.

**Why this priority**: This is the core of the user's "add TDD to SDD" demand. The current pipeline lets implementation land with no test, or with a test that never demonstrably failed, so regressions ship repeatedly. Enforcing Red→Green is the difference between "we have tests" and "the tests actually constrain the code."

**Independent Test**: Drive a phase that adds a behavior with no test → confirm the completion gate blocks with a "no failing test recorded" message. Then add a test, observe it fail, implement, observe it pass → confirm the gate now allows completion and records both the Red and Green observations.

**Acceptance Scenarios**:

1. **Given** a phase that changed executable behavior with no associated test, **When** the developer attempts to complete the phase, **Then** the gate blocks and explains that a failing-then-passing test is required.
2. **Given** a phase whose test passed but was never observed to fail first, **When** completion is attempted, **Then** the gate flags the missing Red step and blocks, because a never-failing test does not prove it constrains the new behavior.
3. **Given** a phase with a test that failed, then passed after implementation, **When** completion is attempted, **Then** the gate allows it and records the Red and Green evidence in the phase report.
4. **Given** a documentation-only or pure-refactor phase with no behavioral change, **When** completion is attempted with a recorded exemption reason, **Then** the gate allows it and the exemption is visible in the phase report.

---

### User Story 3 - User-facing changes are proven by real Playwright UX tests, not grep or curl (Priority: P1)

When a phase changes user-facing behavior, the pipeline requires evidence from a Playwright test that drives the **real UI** with real user input (keyboard, clicks) and asserts on the **actually rendered result**. Evidence consisting only of `grep`, `curl`, log inspection, "it compiles," or "the endpoint returned 200" is rejected as insufficient, and the phase cannot pass on it.

**Why this priority**: The user explicitly and repeatedly asked for validation "from a USER EXPERIENCE perspective, not grep or curl." Backend-only checks have repeatedly passed while the actual UI was broken (e.g., the React crash). Requiring real UI exercise is what closes the gap between "the server responded" and "the user can actually do the thing."

**Independent Test**: Submit a user-facing phase whose only evidence is a `curl` returning 200 → confirm the gate rejects it as non-UX proof. Provide a Playwright test that types into the UI and asserts on the rendered output → confirm the gate accepts it and surfaces the run result.

**Acceptance Scenarios**:

1. **Given** a user-facing phase whose validation evidence is only `grep`/`curl`/log/HTTP-status, **When** completion is attempted, **Then** the gate rejects the evidence as non-UX and blocks the phase.
2. **Given** a user-facing phase with a Playwright test that exercises the UI through real input and asserts on rendered output, **When** the test passes, **Then** the gate allows completion and the phase report shows the UX validation result.
3. **Given** a user-facing phase whose Playwright test **fails**, **When** completion is attempted, **Then** the gate blocks and the failure (with its output) is surfaced rather than the phase silently passing.
4. **Given** terminal-output behavior, **When** it is validated, **Then** the assertion reads the xterm.js buffer model (the real rendered terminal state), not the DOM or a log file, consistent with the proof standard.

---

### User Story 4 - Failures are reported honestly and the pipeline refuses to advance (Priority: P2)

When any required test or validation fails, the pipeline reports the failure together with its actual output and does not advance the phase. The developer is never told a phase "passed" when its tests did not run or did not pass.

**Why this priority**: Repeatability depends on trust. A pipeline that reports green while tests are red is worse than no pipeline, because it hides regressions until they reach the user. This makes the failure path loud and truthful.

**Independent Test**: Force a required test to fail mid-phase; confirm the pipeline shows the failing output, marks the phase not-complete, and offers the developer the choice to fix and retry — with no path that auto-advances on a failure.

**Acceptance Scenarios**:

1. **Given** a required test that fails, **When** the phase gate evaluates, **Then** the phase is reported not-complete with the failing output shown.
2. **Given** a validation step that could not run at all (tooling missing/unavailable), **When** the gate evaluates, **Then** it fails closed with an actionable message and never reports the phase as passed.

---

### Edge Cases

- A session's recorded worktree directory exists on disk but is **not** a valid git worktree (corrupted/partially removed) → re-attach to the main checkout with a clear message; never nest.
- The repository main checkout itself cannot be located (repo moved/renamed) → surface a clear error and decline to resume into a guessed directory.
- Two sessions claim the **same** recorded directory after a restart → both attach to that one directory (it is shared state); neither invents a nested copy.
- A phase changes both behavior and documentation → treated as behavior-changing; the TDD and (if user-facing) UX gates apply.
- Playwright cannot launch in the current environment (e.g., headless launch fails) → the UX gate fails closed with an actionable message; it must never be interpreted as "passed."
- A test suite that takes a very long time or hangs → the gate must reach a definitive pass/fail/blocked outcome rather than leaving the phase ambiguously open.
- A developer legitimately needs to bypass a gate once (emergency) → any bypass is explicit, requires a recorded reason, and is auditable, never silent.
- A test that passes on the very first run with no prior failing observation → flagged as not satisfying Red→Green, so a pre-existing always-green test cannot be reused to wave a new behavior through.

## Requirements *(mandatory)*

### Functional Requirements

**Deterministic resume (US1)**

- **FR-001**: The system MUST record, per session, the absolute working directory the session is bound to, and on app restart/update MUST re-attach the reopened session to that exact directory.
- **FR-002**: The system MUST resolve every new worktree's provisioning location relative to the repository's **main checkout**, never relative to a session's current directory, so a worktree can never be created inside another worktree.
- **FR-003**: The system MUST guarantee at most one level of `.forge/worktrees/` beneath the main checkout; it MUST detect and refuse any path that would nest a worktree within an existing worktree.
- **FR-004**: When a session's recorded worktree directory no longer exists or is not a valid worktree, the system MUST re-attach the session to the repository main checkout and surface exactly one clear message explaining the fallback — never create a new or nested directory and never silently attach to a different feature.
- **FR-005**: Resume and Continue MUST operate against the session's re-attached directory without requiring any manual `cd` or directory correction by the developer.

**TDD enforcement (US2)**

- **FR-006**: The system MUST classify whether a phase changed executable behavior, so the TDD gate applies only to behavior-changing phases.
- **FR-007**: For a behavior-changing phase, the system MUST require evidence that a test was observed to **fail** before the implementation and **pass** after it (Red→Green), and MUST block phase completion when that evidence is absent.
- **FR-008**: The system MUST reject, as insufficient for TDD, a test that passed without any recorded prior failing observation.
- **FR-009**: The system MUST allow a documentation-only or pure-refactor phase to complete without a test ONLY when a human-readable exemption reason is recorded and shown in the phase report.
- **FR-010**: The system MUST record the Red and Green observations (or the exemption reason) in the phase's developer-facing report.

**Playwright UX validation (US3)**

- **FR-011**: The system MUST classify whether a phase changed **user-facing** behavior, so the UX validation gate applies to those phases.
- **FR-012**: For a user-facing phase, the system MUST require validation evidence produced by a test that drives the real UI through real user input and asserts on the actually rendered result.
- **FR-013**: The system MUST reject evidence consisting solely of text search, HTTP requests, HTTP status codes, log inspection, or compilation success as proof of user-facing behavior.
- **FR-014**: For terminal-output behavior, the system MUST require assertions against the rendered terminal buffer state rather than the DOM or log files.
- **FR-015**: The system MUST surface the UX validation outcome — pass or fail, with the failing output on failure — in the phase report, and MUST block completion on failure.
- **FR-016**: When the UX validation tooling cannot run, the gate MUST fail closed with an actionable message and MUST NOT report the phase as passed.

**Honest reporting & determinism (US4)**

- **FR-017**: The system MUST NOT report a phase as complete or passed when any required test or validation did not run or did not pass.
- **FR-018**: When a required check fails, the system MUST present the actual failing output and keep the phase open for fix-and-retry.
- **FR-019**: Re-running the same phase against the same inputs MUST produce the same gate decision (pass/block) so the pipeline behaves predictably and repeatably.
- **FR-020**: Any gate bypass MUST be explicit, require a recorded reason, and be auditable; the system MUST NOT provide a silent path around the TDD or UX gates.

### Key Entities *(include if data involves data)*

- **Session Binding**: The durable association between a terminal tab/session and the absolute working directory it operates in (main checkout or a specific worktree), used to re-attach the session deterministically after restart.
- **Phase Verification Record**: The per-phase evidence set — behavior classification, Red/Green test observations or exemption reason, and UX validation outcome — that the completion gate evaluates and the report displays.
- **Gate Decision**: The pass / block / exempt outcome for a phase, derived deterministically from its Phase Verification Record, plus any recorded, audited bypass.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of restarts/updates, a reopened session re-attaches to the identical absolute directory it occupied before, whether that was the main checkout or a worktree.
- **SC-002**: Zero recursively nested worktree directories are ever created (no `.forge/worktrees/.../.forge/worktrees/...` paths), across any number of restarts.
- **SC-003**: 100% of phases that change executable behavior require a failing-then-passing test before they can be marked complete; phases lacking that evidence are blocked.
- **SC-004**: Zero user-facing phases pass on text-search, HTTP, HTTP-status, log, or compilation evidence alone.
- **SC-005**: 100% of user-facing phase completions carry a real UI-exercising validation result visible in the phase report.
- **SC-006**: When a required test fails, the phase is reported not-complete with its failing output in 100% of cases — there is no observed instance of a green report over red tests.
- **SC-007**: Running the same phase twice against the same inputs yields the same gate decision in 100% of trials.
- **SC-008**: A developer can resume prior work after an app update in under 10 seconds with no manual directory correction.

## Assumptions

- **Worktree mechanics come from feature 011**: The opt-in worktree provisioning, picker, and cleanup are delivered by `011-worktree-concurrency`. This feature (012) adds the **determinism guarantee** (stable re-attach, no nesting) on top of that mechanism and the **testing-enforcement** gates; it does not re-implement worktree provisioning.
- **Constitution Articles V and X are the standard, now enforced**: The requirement for Red→Green→Refactor TDD and for real Playwright UX proof (reading the xterm.js buffer model, never the DOM, and rejecting "compiles"/"200 OK") already exists in the constitution. This feature makes those Articles mechanically enforced in the pipeline rather than relying on agent discipline.
- **Hard enforcement, with audited bypass**: Gates block by default. A single, explicit, reason-recorded bypass exists for genuine emergencies (mirroring the existing workflow-ledger bypass) so the developer is never permanently trapped, but the bypass is always visible.
- **Behavior classification is decidable from the phase's changes**: Whether a phase changed executable and/or user-facing behavior can be determined from the files and surfaces it touched; ambiguous cases default to "behavior-changing" so the gate fails safe rather than waving work through.
- **Reuses existing identity and reporting model**: Per-tab session identity, session-scoped gates, and the per-phase report card from prior SDD work (specs/008, 010) are present and are extended, not replaced.
- **Local, single developer, git-backed repository**: Enforcement applies to git repositories on one running application on one machine; multi-user/remote coordination is out of scope.
- **Playwright is the UX validation tool**: Consistent with Constitution Article V, user-experience validation uses Playwright driving real browser/UI events, launched via the project's dev harness rather than against a built binary.
