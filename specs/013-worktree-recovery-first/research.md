# Phase 0 Research: Recovery-First Worktrees

This file records the design decisions that resolve the spec's open questions and the
"NEEDS CLARIFICATION" items from Technical Context. Each decision is grounded in the
actual code seams discovered while planning.

## R1 — Where the silent worktree is actually created (the fix point)

**Decision**: The single trigger is `handleSddBind` → `resolveSddWorkspace`. `handleSddBind`
(`cmd/forge/sdd_wiring.go:201`) eager-binds a tab the instant the frontend reports its
directory (`App.jsx:453` sends `repoRoot = activeTab.currentDirectory`). Inside
`resolveSddWorkspace` (`cmd/forge/sdd_worktree.go:82-99`), when `sddHasConcurrentPipeline`
is true the code calls `provisionWorktreeForSession` + `retargetSessionShell` — silently
creating a worktree and `cd`-ing into it. **Remove this branch.** A bind defaults to the
recovered directory (R3) or the main checkout; it never provisions.

**Rationale**: This is the exact, reproducible cause of "a second tab spawns a directory."
specs/012 only changed the `isForgeWorktreePath(repoRoot)` re-attach branch (line 79) and
the anchoring/no-nesting logic — it never touched the concurrency→provision branch, which is
why the symptom survived v7.21.0.

**Alternatives considered**:
- *Gate provisioning behind a config flag* — rejected: a discoverable explicit action (R2) is
  required by FR-007; a hidden flag still surprises and is not "deliberate."
- *Only provision when two real SDD pipelines collide, automatically* — rejected: the user's
  directive is explicit consent, not a smarter automatic trigger. Auto-anything reintroduces
  the surprise. The collision case becomes a *prompt* (R2), not an automatic action.

## R2 — Explicit, consent-only provisioning (proactive + reactive)

**Decision**: Provisioning happens only via explicit consent through two surfaces, both reusing
the existing `MainCheckout` + `assertNoNesting` + `provisionWorktreeForSession` primitives:
- **Proactive (per-tab action)** — a new `POST /api/sdd/worktree {sessionId}` handler invoked
  by a "Isolate this tab / New isolated workspace" control in `TabBar.jsx`. It provisions,
  retargets the shell, persists the binding (R3), and returns the isolation info.
- **Reactive (collision prompt)** — when `handleSddBind` detects a genuine second concurrent
  SDD *pipeline* on the same checkout, it pushes a prompt envelope over the existing WS hub
  (`termHandler.BroadcastJSONToSession`, the same channel as `SDD_PHASE_GATE`). The developer
  confirms to provision or dismisses to stay shared.

**Rationale**: Clarification Q1→B (prompt on collision, default shared) and Q2→A (per-tab
proactive action). Both reuse the WS hub and the worktree primitives, so the only new code is
the endpoint, the prompt envelope, and the UI affordances (Framework-First, Article VII).
The collision is *real*: `.forge/workflow-ticket.json` is one file per project root
(`internal/workflow/ticket.go:3`), so two pipelines in one checkout corrupt each other — the
prompt surfaces exactly that risk at the moment it arises.

**Alternatives considered**:
- *Command-palette / dashboard surface (Q2 option B)* — rejected by the user; isolation is a
  per-tab property and belongs on the tab.
- *No proactive surface, prompt-only (Q2 option C)* — rejected: a developer who knows up front
  they want isolation should not have to trigger a collision to get it.

## R3 — Durable, server-authoritative recovery binding (resolves the deferred FR-004 question)

**Decision**: Persist a small record per isolated session to
`~/.forge/sdd/worktree-bindings.json`: `sessionId → { worktreePath, branch, baseBranch,
mainRepoRoot }`. On bind, `handleSddBind` consults this store **first**: if a record exists and
its worktree is still a valid git worktree, re-attach to it (no provisioning, no shell
retarget if the session is already there); if the worktree is gone, evict the record and fall
back to the main checkout with one clear message (FR-005). The store is written whenever an
isolated worktree is created (R2) and evicted on safe cleanup.

**Rationale**: The live `sddPipelines` map is in-memory and lost on restart, so today recovery
works **only if** the frontend happens to re-report the worktree path as the tab's cwd — which
on Windows ConPTY (no durable per-tab cwd identity, per prior root-cause analysis) is exactly
the fragile case. A tiny disk record makes the server the authority on "this session belongs to
this worktree," so recovery is guaranteed (SC-002) and no longer depends on terminal cwd
restoration. It reuses the existing `sddStateDir()` (`~/.forge/sdd`) location and the
established JSON-on-disk pattern (mirrors `.forge/workflow-ticket.json`).

**Alternatives considered**:
- *Rely on terminal cwd restoration only (specs/012 T017's implicit assumption)* — rejected:
  that is precisely why recovery is currently accidental; it is not a guarantee.
- *Persist on the frontend (localStorage / tab state)* — rejected: the authoritative re-attach
  decision is made server-side in `resolveSddWorkspace`; keeping the record next to that
  decision avoids a cross-process trust dependency and works even if the frontend forgets.
- *Reconstruct purely from `git worktree list`* — rejected: git can list worktrees but cannot
  say which *session/tab* owned which worktree; the mapping is the thing that must persist.

## R4 — Detecting a "genuine concurrent SDD pipeline" vs an ordinary second tab

**Decision**: A collision is signalled only when a second session is about to run an SDD
pipeline in the *same* `gitCommonDir` as an existing **bound pipeline** — reuse the existing
`sddHasConcurrentPipeline(sessionID, commonDir)` predicate, but route a positive result to the
collision **prompt** (R2) instead of to automatic provisioning. Ordinary tabs (servers, shells,
tests) that never start a pipeline never reach this branch in a way that creates anything,
because provisioning is gone from the bind path entirely (R1).

**Rationale**: This preserves the one legitimate reason isolation ever existed (shared
`workflow-ticket.json` corruption) while ensuring the *only* outcome of detection is a prompt,
never a directory. It is a behavioral re-route of an existing predicate, not new detection
logic.

**Alternatives considered**:
- *Treat every second tab as a collision* — rejected: that is the current over-broad trigger;
  most tabs never run a pipeline and must never prompt or provision.

## R5 — Behavioral proof that opening tabs creates no directories (Article X)

**Decision**: A Playwright spec `tests/e2e/worktree-recovery.spec.js` launched via
`run-dev-clean.ps1` that: (1) records the directory set under the test repo (including
`.forge/worktrees`), (2) opens N tabs through real input (`page.keyboard` / `locator.click()`),
(3) reads each tab's working directory from `window.term.buffer.active` (via the shared
`tests/fixtures/forge.js` buffer fixture), and (4) asserts the directory set is unchanged and
every tab reports the expected directory. The same test is run against the pre-fix build to
capture a failing baseline (FR-016).

**Rationale**: Article X requires real UI exercise reading the xterm buffer, never the DOM or
logs, and rejects "compiles"/HTTP-status as proof. Counting directories on disk before/after is
the objective, technology-agnostic signal for SC-001/SC-003. Demonstrating it Red against the
current behavior is what makes "fixed" trustworthy this time (the explicit grievance about
specs/012).

**Alternatives considered**:
- *Assert via Go integration test only* — kept as a complementary layer, but insufficient
  alone: the user's complaint is UX-level ("opening a tab"), and Article X mandates a real-UI
  proof for user-facing behavior.
- *Inspect the DOM for a worktree indicator* — rejected by Article X (DOM is not proof of the
  rendered terminal state, and an indicator is not the same as an on-disk directory).
