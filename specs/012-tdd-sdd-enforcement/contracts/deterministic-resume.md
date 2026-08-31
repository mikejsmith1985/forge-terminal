# Contract: Deterministic Resume — Main-Checkout Anchoring & No Nesting

**Feature**: `012-tdd-sdd-enforcement` | Covers US1, FR-001–FR-005, SC-001/002/008

This contract governs where worktrees are provisioned and how a session re-attaches after restart.
It is a *behavioral* contract over existing internal seams (`resolveSddWorkspace`,
`provisionWorktreeForSession`, the PTY working-dir injection) — there is no new public HTTP route.

---

## C1 — Main-checkout resolution

**Given** any directory inside a git repository — the main checkout **or** a linked worktree —
**when** the system needs the repository's main checkout,
**then** it returns the **first entry** of `git worktree list --porcelain` (git's authoritative main worktree),
**and** the result is identical regardless of which worktree the query was issued from.

- Wrapper: `git.MainCheckout(dir) → absolutePath` (new).
- MUST NOT use `rev-parse --show-toplevel` for this purpose (returns the linked worktree's own root).

## C2 — Provisioning anchor

**Given** an explicit request to provision an isolated worktree,
**when** the worktree path is computed,
**then** it is `MainCheckout/.forge/worktrees/<token>` — anchored to the main checkout, never to the caller's current directory.

## C3 — No-nesting guard (hard invariant)

**Given** a computed worktree path,
**when** provisioning,
**then** the system MUST refuse any path whose parent chain already contains `/.forge/worktrees/`,
**and** there is at most **one** `.forge/worktrees/` level beneath the main checkout (SC-002).

```
assertNoNesting(path, mainCheckout):
  reject if toSlash(path) already under any existing .forge/worktrees/ segment
  reject if mainCheckout itself is under .forge/worktrees/  → re-resolve via C1
```

## C4 — Default bind is the main checkout

**Given** a session binds to a repository (first or concurrent),
**when** no explicit isolation opt-in has occurred,
**then** `boundDir == MainCheckout` and no worktree is created (coordinates with feature 011; FR-005).

## C5 — Deterministic re-attach on restart

**Given** a session reopens after an app restart/update with a recorded `boundDir`,
**when** it re-binds,
**then**:
- `boundDir` exists and appears in the live `git worktree list` (or equals `MainCheckout`) → re-attach to `boundDir` unchanged (FR-001).
- `boundDir` is missing/invalid → re-attach to `MainCheckout` and surface **exactly one** message explaining the prior worktree is gone (FR-004).
- A pure resume MUST NOT invoke provisioning (no new directory is created on resume).

## Acceptance checks (map to tasks/tests)

| Check | Type | Asserts |
|---|---|---|
| `MainCheckout` returns main root when called from a linked worktree | Go unit (fake runner returns ordered porcelain) | C1 |
| Provisioning twice in a row yields sibling worktrees, never nested | Go integration (real temp repo) | C2, C3, SC-002 |
| `assertNoNesting` rejects a path under an existing worktree | Go unit | C3 |
| Concurrent second bind stays on main checkout (no auto-worktree) | Go unit | C4, FR-005 |
| Restart re-attaches to same dir; missing worktree falls back to main + one message | Playwright (read `window.term.buffer.active` for the cwd prompt) | C5, SC-001/008 |
