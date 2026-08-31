# Phase 0 Research: Repeatable SDD — Deterministic Resume + Enforced TDD & Playwright UX

**Feature**: `012-tdd-sdd-enforcement` | **Date**: 2026-06-24

All decisions resolve the spec's requirements against the *existing* codebase. File:line citations are from a verified read of the backend, not inference.

---

## R1 — Root cause of recursive worktree nesting, and the correct anchor

**Decision**: Replace the `Toplevel(repoRoot)` anchor in `resolveSddWorkspace` with a new `MainCheckout(repoDir)` that returns the **first entry** of `git worktree list --porcelain`. Anchor `sddWorktreesRoot` to that path. Add `assertNoNesting` that refuses to provision under any path already containing `/.forge/worktrees/`.

**Rationale**: Confirmed by reading `cmd/forge/sdd_worktree.go:79` and `internal/git/worktree.go:35-38`. `Toplevel` runs `git rev-parse --show-toplevel`, which **returns the linked worktree's own root when invoked from inside a worktree** — because a worktree is itself a working tree. So once a session's shell is retargeted into `.forge/worktrees/X` (`retargetSessionShell`, `sdd_worktree.go:88`) and it later re-binds with that directory as `repoRoot`, `mainRepoRoot` resolves to `X` and `provisionWorktreeForSession` builds `X/.forge/worktrees/Y` (`sdd_worktree.go:129`). Each restart adds one level — exactly the captured path `…/worktrees/tab-4-ciryufsz0/.forge/worktrees/tab-4-t0jl6s874`. `git worktree list --porcelain` **always lists the main worktree first**, regardless of which worktree you invoke it from, so its first entry is the stable, correct main checkout. The wrapper already parses this output in order (`parseWorktreePorcelain`, `worktree.go:120-145`) and `WorktreeList` exists (`worktree.go:59-65`) — `MainCheckout` is a three-line addition over proven code.

**Alternatives considered**:
- *Derive main checkout from `--git-common-dir`'s parent* (the common dir is `<main>/.git`): works for the standard layout but is fragile against `.git` files, bare repos, and submodules. `worktree list` is git's own authoritative ordering and needs no path arithmetic. Rejected as less robust.
- *Keep `Toplevel` but only ever pass the original project root*: requires every caller to never pass a worktree path — exactly the invariant that already failed. Anchoring to the main checkout makes the resolver correct regardless of which directory it is handed. Rejected (fragile).

---

## R2 — Deterministic re-attach on restart

**Decision**: Record, per session, the absolute bound directory at bind time. On restart, re-attach the reopened session to that directory if it still exists and is a valid worktree (or the main checkout); otherwise re-attach to the main checkout and surface exactly one message (FR-004). Never call provisioning during a pure resume.

**Rationale**: Resume/Continue are directory-bound, and the working directory is applied via PTY injection (`internal/terminal/session.go:237-239`, `pty_windows.go:48-49,73-99`). The durable registry is git itself (`git worktree list`), so a recorded directory can be validated against the live worktree list at restart. Falling back to the main checkout — never to a guessed or nested path — is what makes resume predictable (SC-001/SC-008). This coordinates with the `011` redesign (default to main checkout, opt-in isolation): resume defaults to wherever the session was, and the main checkout is always a valid floor.

**Alternatives considered**:
- *Re-provision a fresh worktree on resume* (today's implicit behavior): the source of the bug. Rejected outright.
- *Persist the binding in a new on-disk store*: unnecessary — `git worktree list` plus the session's recorded directory is sufficient and avoids a new persistence format (Framework-First). Rejected.

---

## R3 — Where the verification gate hooks into the pipeline

**Decision**: Evaluate verification at the **phase-completion seam** — in `applySddPhaseEvent` for the `"complete"` event (`cmd/forge/handlers_sdd.go:162-174`), immediately before `HandlePhaseComplete()` opens the gate card. A blocking verdict prevents the phase from being presented as complete and surfaces the reason; a passing/exempt verdict proceeds unchanged.

**Rationale**: This is the single authoritative completion path (specs/010, "shared completion seam I1"). The touched-file list and baseline diff are already computed here for the report card (`buildSddPhaseReportCardForPipeline`, `sdd_report_card.go:178-183`), so behavior classification and evidence checks have their inputs for free. Placing the gate here means every completion — watcher-driven or event-driven — passes through it.

**Alternatives considered**:
- *Enforce only in the PreToolUse hook* (`sdd-gate-check.ps1`): that hook runs **before** a skill, not at completion, and is per-skill not per-change — wrong granularity for "did this phase's change get tested." We still extend it to *report* a verification-blocked phase (fail-closed signal), but the decision is computed server-side. Rejected as the sole site.
- *Enforce only at commit (existing workflow ledger pre-commit hook)*: catches untested commits but not untested *phase completions*, and the user's complaint is about phases passing, not commits. We reuse the ledger as the evidence store but evaluate at the phase seam. Rejected as the sole site.

---

## R4 — Behavior classification (which gate applies)

**Decision**: Add `ClassifyBehavior(touchedFiles)` to `internal/sdd/detector.go` returning `{behaviorChanging, userFacing, exemptReason}`. Heuristic over the report-card file list: source under `cmd/forge/**`, `internal/**`, `frontend/src/**` (excluding test files) ⇒ behavior-changing; user-facing ⇒ any non-test `frontend/src/**` change **OR** a backend code path known to alter user-visible output (terminal/prompt rendering, SDD message/report producers such as `cmd/forge/sdd_*`); only `*.md`/`specs/**`/`docs/**` ⇒ docs-only (`exemptReason` set by the classifier, never self-asserted); only test files (`*_test.go`, `*.test.jsx`, `tests/**`, `*.spec.js`) ⇒ refactor/test-only (TDD-satisfying by construction). **Both** axes fail safe: ambiguous ⇒ behavior-changing **and** user-facing, so no uncertain change skips either gate.

**Rationale**: The classifier needs no new data — it reads the already-computed `[]sddFileChange`. Defaulting ambiguity to "behavior-changing" honors FR's fail-safe stance: the gate never waves work through on uncertainty. `detector.go` already classifies artifacts by path/content (`classifyArtifact`, `detector.go:29-43`), so this is the same shape of logic in the same file.

**Alternatives considered**:
- *Ask the agent to self-declare behavior class*: self-reporting is exactly the hollow-proof problem the user is furious about. Rejected.
- *AST/semantic diff to detect behavior change*: heavy, language-specific, and unnecessary for a gate whose conservative default is "treat as behavior-changing." Rejected (over-engineered).

---

## R5 — TDD Red→Green evidence store (Framework-First)

**Decision**: Reuse the existing workflow ledger (`.forge/workflow-ticket.json`, written by `workflow_gate_record` and read by the pre-commit hook, `scripts/install-workflow-hooks.ps1`). Extend its recognized gates with a **`test-failed-first`** (Red) observation alongside the existing `tests-written`/`tests-passed`. The phase gate requires, for a behavior-changing phase, that the ledger shows Red (a test observed failing) **before** Green (`tests-passed`) — proving the test constrains the new behavior (FR-007/FR-008).

**Rationale**: Article VII — the ledger already exists, already persists timestamped gate evidence, already gates commits. Adding one observation type is far cheaper and more consistent than a parallel store. The Red-before-Green ordering is checkable from the ledger's existing `passedAt` timestamps.

**Alternatives considered**:
- *New per-phase test-evidence file*: duplicates the ledger. Rejected (Framework-First).
- *Infer Red from CI history*: there is no CI (Article VIII — local pipeline only). Rejected.

---

## R6 — Playwright UX evidence (what counts, what is rejected)

**Decision**: For a user-facing phase, require a **passing Playwright result** from the existing harness (`playwright.config.js` → `tests/e2e/*.spec.js`, run via `run-dev-clean.ps1`) whose run is recorded as the UX gate's evidence. Terminal-output assertions must read `window.term.buffer.active` (the harness already exposes `window.term` at `ForgeTerminal.jsx:1296` and tests already read the buffer, e.g. `tests/fixtures/forge.js`). Evidence that is only `grep`/`curl`/HTTP-status/log/compile-success is **rejected** as non-UX (FR-013). If Playwright cannot launch, the gate **fails closed** with an actionable message (FR-016).

**Rationale**: Article X made operational. The harness, fixtures, and buffer-reading pattern already exist (36 e2e specs, 10 reading the buffer), so the gate consumes existing infrastructure rather than inventing a UX runner. "Fail closed" guarantees a tooling failure can never be misread as a pass — the exact silent-green failure the user is escalating.

**Alternatives considered**:
- *Accept any passing test (unit/integration) as UX proof*: contradicts the explicit "USER EXPERIENCE perspective, not grep or curl" requirement. Unit/integration are required by the TDD gate (R5) but are not UX proof. Rejected.
- *Assert on the DOM*: forbidden by Article X (the rendered terminal lives in the xterm buffer, not the DOM). Rejected.

---

## R7 — Failure semantics, determinism, and audited bypass

**Decision**: Gates are pure functions of the `PhaseVerificationRecord` (classification + ledger evidence + Playwright result) → `GateDecision` ∈ {pass, block, exempt}, so the same inputs always yield the same decision (FR-019/SC-007). A failed or un-run required check yields `block` with the actual failing output surfaced (FR-017/FR-018). A single-use bypass reuses the ledger's existing `FORGE_BYPASS=1` + `FORGE_BYPASS_REASON` mechanism (logged to `.forge/bypasses.log`), so any override is explicit, reasoned, and auditable (FR-020) — never silent.

**Rationale**: Determinism is what "predictable" means operationally. Reusing the existing audited bypass avoids inventing a second escape hatch and keeps every override in one log reviewers already watch.

**Alternatives considered**:
- *No bypass at all*: a hard lock with no escape traps the developer in a genuine emergency and invites disabling the whole system. An audited, logged, single-use bypass is safer than an all-or-nothing gate. Rejected.
- *Silent “warn-only” mode*: reintroduces hollow green. Rejected (defeats the feature).

---

## Resolved unknowns

- **Main-checkout source**: `git worktree list --porcelain`, first entry (R1).
- **Resume directory truth**: recorded session directory validated against the live worktree list; main-checkout floor (R2).
- **Gate site**: phase-completion seam in `applySddPhaseEvent` (R3).
- **Behavior signal**: file-path classifier over the existing diff, fail-safe default (R4).
- **Red→Green store**: existing workflow ledger + one new observation type (R5).
- **UX proof**: existing Playwright harness, buffer-read assertions, fail-closed (R6).
- **Bypass**: existing audited ledger bypass (R7).

No `NEEDS CLARIFICATION` markers remain.
