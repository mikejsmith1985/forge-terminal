# Phase 1 Data Model: Recovery-First Worktrees

The feature adds one durable entity (the recovery binding record) and re-purposes existing
in-memory binding state. No database; the new persistence is a single JSON file.

## Entity: WorktreeBindingRecord (NEW, persisted)

The durable mapping that makes recovery survive an app restart. One entry per isolated session.

| Field | Type | Description |
|---|---|---|
| `sessionId` | string | The owning tab/session id (map key). |
| `worktreePath` | string (abs) | The isolated worktree directory the session belongs to. |
| `branch` | string | The worktree's branch (`forge/wt-<token>` or promoted `feature/<dir>`). |
| `baseBranch` | string | The branch the worktree was created from (needed by safe cleanup). |
| `mainRepoRoot` | string (abs) | The repository main checkout that anchors the worktree. |

**Storage**: `~/.forge/sdd/worktree-bindings.json` (object keyed by `sessionId`), under the
existing `sddStateDir()`. The same location and JSON-on-disk pattern as the workflow ticket.

**Lifecycle / state transitions**:
- **Created** when an isolated worktree is provisioned by explicit consent (proactive action or
  confirmed collision prompt).
- **Read** on every `handleSddBind` to decide re-attach vs main-checkout (recovery).
- **Evicted** when (a) the recorded worktree no longer exists/is invalid at bind time (→ fall
  back to main checkout with one message), or (b) the worktree is safely cleaned up
  (merged + clean) by the existing `safeCleanupWorktree` / startup sweep.

**Validation rules**:
- `worktreePath` MUST be under `mainRepoRoot/.forge/worktrees/` (one nesting level only); a
  record that would imply nesting is rejected/evicted (reuses `assertNoNesting` / `isForgeWorktreePath`).
- A record whose `worktreePath` is not a valid git worktree is treated as absent (fail-safe to
  recovery, never to provisioning).

## Entity: sddWorktreeBinding (EXISTING, in-memory — unchanged shape)

Already defined in `cmd/forge/sdd_worktree.go`. Returned by `resolveSddWorkspace` and copied
onto the live `sddPipeline`. The zero value (`isIsolated:false`) means "main checkout." This
feature changes *how* it is produced (recovery-first, never auto-provision), not its shape.

## Entity: CollisionPrompt (NEW, transient — WS message only)

Pushed over the existing WS hub when a genuine second concurrent SDD pipeline is detected. Not
persisted.

| Field | Type | Description |
|---|---|---|
| `type` | string | `"SDD_WORKTREE_COLLISION"` discriminator on the existing hub. |
| `sessionId` | string | The session being offered isolation. |
| `repoRoot` | string | The shared checkout where the collision was detected. |
| `message` | string | Human-readable "this repo already has an active pipeline…" text. |

**Lifecycle**: emitted at bind when collision detected → resolved by the developer either
confirming (`POST /api/sdd/worktree`) or dismissing (no server state changes; stay shared).

## Entity: Directory Inventory (TEST-ONLY, from spec)

The set of directories on disk under the test repo, captured before/after tab operations by the
Playwright spec to prove zero were created (SC-001/SC-003). Not a runtime entity.

## Relationships

- `WorktreeBindingRecord (1) ── owns ──> (1) worktree directory` (under the main checkout).
- `sessionId` is the shared key linking a live `sddPipeline`, its `WorktreeBindingRecord`, and
  any `CollisionPrompt` addressed to it.
- The main checkout `(1) ── has ──> (0..n) WorktreeBindingRecords`, each a distinct un-nested
  worktree.
