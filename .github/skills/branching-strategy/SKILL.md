---
name: branching-strategy
description: "Enforces GitHub Flow branching strategy. Activates on keywords: branch, merge, commit, push, pull request, PR, git."
---

# Branching Strategy — GitHub Flow

## Rules (MANDATORY)

1. **NEVER commit directly to `main`** — All work happens on feature branches
2. **Branch naming convention:**
   - `feature/<descriptive-name>` — New functionality
   - `fix/<descriptive-name>` — Bug fixes
   - `chore/<descriptive-name>` — Maintenance, dependency updates
   - `docs/<descriptive-name>` — Documentation only
3. **Every merge to main requires a Pull Request** — No exceptions
4. **Branch names MUST be descriptive:** `feature/add-user-authentication` not `feature/auth`
5. **Delete branches after merge** — Keep the branch list clean
6. **Rebase before merge** when the branch is behind main (keep history linear)

## Workflow

```
1. Create branch:  git checkout -b feature/descriptive-name
2. Make changes:   Commit often with clear messages
3. Push:           git push origin feature/descriptive-name
4. Open PR:        Create PR with filled template and checklist
5. Review:         Address feedback, ensure CI passes
6. Merge:          Squash merge for features, merge commit for releases
7. Clean up:       Delete the feature branch
```

## Commit Message Format

```
<type>: <description>

[optional body explaining WHY, not WHAT]

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

Types: feat, fix, chore, docs, test, refactor, perf
