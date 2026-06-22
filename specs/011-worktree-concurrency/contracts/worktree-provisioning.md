# Contract: Worktree Provisioning (bind-time concurrency detection)

Provisioning is **internal to the existing `POST /api/sdd/bind` flow** — no new public HTTP route. This contract specifies the behavior added inside `handleSddBind` → `startSddPipeline` (`cmd/forge/sdd_wiring.go`) and the `internal/git` worktree wrapper it calls.

## Trigger

`POST /api/sdd/bind` with the existing body:

```json
{ "sessionId": "tab-…", "repoRoot": "C:\\path\\to\\checkout" }
```

## Decision procedure (additive to current bind)

1. Resolve `gitCommonDir = git rev-parse --git-common-dir` for `repoRoot`. If not a git repo → behave exactly as today (single pipeline, no isolation); return `{"status":"bound"}` (FR-014 safe degrade, non-git assumption).
2. Look up existing bindings sharing `gitCommonDir`.
   - **None** → this is the first pipeline. Bind on the main checkout, `isIsolated=false`, `repoRoot=mainRepoRoot`. No worktree. (FR-005)
   - **An existing active binding** for the same `gitCommonDir`, different `sessionId` → **concurrency** (FR-001). Proceed to provisioning.
   - **An existing binding for the same `sessionId`** already isolated → idempotent no-op (current re-bind behavior preserved).
3. Provisioning (FR-002):
   1. `worktreePath = <mainRepoRoot>/.forge/worktrees/<provisional-id>` (R7).
   2. `git worktree add <worktreePath> -b forge/wt-<short-session-id> <baseBranch>` where `baseBranch` is the main checkout's current branch (captured for later merge checks). (R4)
   3. Inject `cd <worktreePath>` into the session's PTY on quiet (R3).
   4. Start the session's pipeline with `repoRoot = worktreePath`; record the `WorktreeBinding`.
4. Respond `{"status":"bound","isolated":true,"worktreePath":"…","branch":"forge/wt-…"}` (additive fields; existing clients ignore them).

## Branch reconciliation (post-specify)

When the worktree's pipeline learns its feature dir (existing `activeSddFeatureDir` read on phase-event/bind):

- If still on the provisional branch → `git branch -m forge/wt-<id> feature/<spec-dir-name>` and update the binding. (R4, FR-010)
- If a `feature/<spec-dir-name>` already exists for **this** feature/session → reuse (no duplicate, FR-009).
- On a genuine name collision with an unrelated branch → disambiguate deterministically (e.g., suffix) rather than overwrite (FR-010).

## Error / edge behavior

| Condition | Behavior | Req |
|---|---|---|
| `repoRoot` not a git repo | No isolation; single pipeline; clear message | FR-014 |
| `git worktree add` fails (disk/lock) | Abort provisioning; keep session on main checkout as single pipeline; surface actionable error; **do not** touch the other session's pipeline | FR-014 |
| Same feature already provisioned | Re-bind to existing worktree | FR-009 |
| Primary checkout has uncommitted changes | Unaffected — `worktree add` never touches the main working tree | FR-008 |
| PTY busy at injection time | `cd` deferred until PTY-quiet (existing mechanism) | FR-004 |

## Invariants (assertable in tests)

- After a concurrent bind, exactly one binding for the `gitCommonDir` has `isIsolated=false`.
- The isolated session's `pipeline.repoRoot` equals its `worktreePath`.
- The worktree directory exists on disk under `.forge/worktrees/` and is on its own branch.
- The main checkout's working tree and `.specify/feature.json` are unchanged by provisioning.
