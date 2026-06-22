# Phase 1 Data Model: Automated Worktrees for Concurrent Same-Repo Pipelines

Entities are in-memory Go structures plus git's own durable worktree metadata. No new persisted store (R6). Field names are illustrative; final names follow Article IV (self-documenting, `is/has` booleans).

## Entity: WorktreeBinding

The association between one terminal session and the isolated workspace it operates in. Extends the existing per-session `sddPipeline` (keyed by `sessionId` in `sddPipelines`).

| Field | Type | Meaning | Source |
|---|---|---|---|
| `sessionID` | string | Tab/session id (== `FORGE_SESSION_ID`) | bind request |
| `gitCommonDir` | string | `git rev-parse --git-common-dir` — the logical-repo grouping key (R2) | git |
| `mainRepoRoot` | string | Toplevel of the repository's primary checkout | git |
| `worktreePath` | string | Absolute path under `.forge/worktrees/<id>/`; empty for the first (main-checkout) pipeline | provisioning |
| `branch` | string | Provisional (`forge/wt-<short-session>`) then `feature/<spec-dir-name>` | R4 |
| `baseBranch` | string | Branch the main checkout was on at provisioning; the merge target for cleanup (R5) | git at provision time |
| `isIsolated` | bool | True when this session runs in a provisioned worktree (false = first/main pipeline) | derived |
| `featureDir` | string | `specs/<NNN-name>` once `/speckit-specify` runs; empty until then | `activeSddFeatureDir` |

**Relationships**: one WorktreeBinding ↔ one `sddPipeline` ↔ one terminal session. Many bindings may share a `gitCommonDir` (concurrent pipelines in one repo); at most one of them has `isIsolated == false`.

**Validation / invariants**:
- For a given `gitCommonDir`, **exactly one** binding may have `isIsolated == false` (FR-005).
- `worktreePath` non-empty ⇔ `isIsolated == true` ⇔ `branch != baseBranch`.
- A second bind for an already-provisioned `featureDir` re-binds to the existing binding rather than creating a duplicate (FR-009).
- `pipeline.repoRoot == worktreePath` when isolated, else `== mainRepoRoot` — this is the single field that makes all specs/010 machinery isolate (R1).

## Entity: Isolated Workspace (on disk)

The git worktree itself — durable, owned by git. Not a Go struct we persist; queried via `git worktree list --porcelain`.

| Attribute | Source |
|---|---|
| path | `.forge/worktrees/<id>/` (R7) |
| branch | the worktree's checked-out branch |
| HEAD / locked state | `git worktree list --porcelain` |
| own `.specify/feature.json` | written by `/speckit-specify` *inside* the worktree (isolation, R1) |

## Entity: Workspace Registry (derived)

Not a stored object: the registry **is** `git worktree list --porcelain` filtered to `.forge/worktrees/` (R6). The backend holds only a transient in-memory `map[gitCommonDir][]WorktreeBinding`, rebuilt on bind and on startup enumeration. This avoids the inferred-vs-reported drift that caused prior failures.

## State transitions: a concurrent pipeline's lifecycle

```text
            (bind: first session for this git-common-dir)
   ─────────────────────────────────────────────► MAIN  (isIsolated=false, repoRoot=mainRepoRoot)

            (bind: another session, same git-common-dir → concurrency, FR-001)
   ─────────────────────────────────────────────► PROVISIONING
       │  git worktree add .forge/worktrees/<id> -b forge/wt-<id>   (R4, R7)
       │  inject `cd <worktree>` on PTY-quiet                       (R3)
       │  pipeline.repoRoot = worktreePath                          (R1)
       ▼
     ISOLATED-PROVISIONAL  (branch=forge/wt-<id>, featureDir="")
       │
       │  (/speckit-specify creates specs/NNN-name in the worktree; learned via activeSddFeatureDir)
       ▼
     ISOLATED-NAMED        (rename branch → feature/NNN-name; featureDir set)   (R4)
       │
       │  …pipeline runs all phases in the worktree; reports scoped by captureWorkTree(worktreePath)…
       │
       ├─ (session close OR startup sweep) ──► CLEANUP-EVAL                     (R5)
       │      ├─ branch merged into baseBranch AND tree clean ──► REMOVED
       │      │       git worktree remove; git branch -d; drop binding
       │      └─ otherwise ───────────────────► RETAINED + WARN  (FR-012)
       │
       └─ (provisioning fails: disk/lock/non-git) ──► DEGRADE-SAFE              (FR-014)
              keep the session on the main checkout as a single pipeline; surface a clear error;
              do NOT mutate the other session's pipeline
```

**Restart**: on startup, enumerate `git worktree list`; existing `.forge/worktrees/` entries are RETAINED and become re-bindable when a tab reconnects to that path (FR-013). No binding is fabricated for a path no tab is using; the worktree simply persists until a future safe-cleanup sweep.

## Mapping requirements → model

| Requirement | Model element |
|---|---|
| FR-001 detect concurrency | `gitCommonDir` grouping; >1 binding ⇒ concurrent |
| FR-002 auto-provision, no manual steps | PROVISIONING transition triggered by bind |
| FR-003 own files/feature-pointer/diff window | `repoRoot = worktreePath` (own `.specify/feature.json`, own tree) |
| FR-004 commands run in the worktree | `cd` injection (R3) |
| FR-005 first pipeline unchanged | exactly-one `isIsolated==false` invariant |
| FR-006 report scoped per pipeline | `captureWorkTree(worktreePath)` (already parameterized) |
| FR-007 visible binding | `branch` + `worktreePath` in status envelope |
| FR-008 preserve primary uncommitted work | worktree add never touches the main working tree |
| FR-009 no duplicate per feature | re-bind invariant on `featureDir` |
| FR-010 deterministic branch + collisions | provisional→`feature/<spec-dir-name>`; reuse-or-disambiguate |
| FR-011 safe auto-cleanup | CLEANUP-EVAL → REMOVED when merged+clean |
| FR-012 never destroy unmerged | CLEANUP-EVAL → RETAINED+WARN |
| FR-013 restart discovery | `git worktree list` enumeration |
| FR-014 degrade safely on failure | DEGRADE-SAFE transition |
| FR-015 keep specs/010 guarantees | binding extends `sddPipeline`; per-session scoping intact |
| FR-016 git-status-invisible location | `.forge/worktrees/` (already ignored) |
