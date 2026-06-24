# Contract: Explicit Worktree Opt-In

Defines the *only* two ways a worktree is ever created: a proactive per-tab action and a
reactive collision prompt. Both require explicit developer consent. Verified by Go
unit/integration tests and the Playwright opt-in spec.

## Proactive surface — `POST /api/sdd/worktree`

**Request**: `{ "sessionId": "<tab id>" }`
**Response (200)**: `{ "isolated": true, "worktreePath": "...", "branch": "..." }`
**Response (409/200 shared)**: when provisioning fails, the tab stays on the main checkout and
the body reports `{ "isolated": false, "message": "..." }` — never a half-made directory.

### C7 — Explicit request creates exactly one un-nested worktree

**Given** a tab on the main checkout
**When** the developer invokes the per-tab "Isolate this tab" action (→ `POST /api/sdd/worktree`)
**Then** exactly one worktree is created under `MainCheckout/.forge/worktrees/<token>` (one
nesting level, `assertNoNesting` enforced), the requesting tab's shell is retargeted into it, a
`WorktreeBindingRecord` is persisted, and only that tab is affected.
*(FR-007, FR-008, FR-009, FR-010.)*

### C8 — Provision failure degrades safe

**Given** an explicit request
**When** `provisionWorktreeForSession` fails (git error)
**Then** the tab remains on the main checkout with a clear message; no partial/nested directory
is left behind and no binding record is written.
*(FR-011.)*

### C9 — Opt-in from inside a worktree never nests

**Given** the action is invoked from a tab already inside an isolated worktree
**When** the request resolves
**Then** the system reuses the current worktree or clearly declines; it never creates a worktree
inside a worktree (`assertNoNesting`).
*(FR-009, edge case.)*

## Reactive surface — collision prompt (`SDD_WORKTREE_COLLISION` over the WS hub)

### C10 — A genuine concurrent pipeline prompts, never auto-provisions

**Given** an active SDD pipeline in a checkout
**When** a second session starts a concurrent SDD pipeline in the same `gitCommonDir`
**Then** the system pushes one `SDD_WORKTREE_COLLISION` prompt to that session and takes NO
provisioning action; both pipelines remain on the shared main checkout until the developer acts.
*(FR-003.)*

### C11 — Confirm provisions; dismiss stays shared

**Given** a displayed collision prompt
**When** the developer **confirms** → it calls `POST /api/sdd/worktree` (C7 applies);
**when** the developer **dismisses** → no worktree is created, the pipeline stays on the shared
checkout, and nothing is persisted.
*(FR-003, FR-007. Dismiss is the safe default — consistent with "recovery-first, opt-in worktree.")*

## C12 — No silent path exists

**Given** the entire bind/collision flow
**When** the developer never invokes the action and never confirms a prompt
**Then** no worktree is ever created — the negative guarantee tying back to C1/C5.
*(FR-003, SC-003.)*
