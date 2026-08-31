# Branching Strategy — Branch Before Code

This skill enforces the non-negotiable rule: **a branch must exist before a single file is edited.**

---

## Step 1 — Check current branch

Run this immediately:

```
git branch --show-current
```

If the output is `main` or `master`: **STOP. Do not edit any file.** Create your branch first.

---

## Step 2 — Create the correct branch type

| Change type | Prefix | Example |
|---|---|---|
| Bug fix | `fix/` | `fix/command-card-tool-variants-startup` |
| New feature | `feature/` | `feature/claude-code-workflow-skills` |
| Refactor / cleanup | `chore/` | `chore/remove-deprecated-backup-api` |
| Documentation only | `docs/` | `docs/update-agents-md-skill-list` |
| Tests only | `test/` | `test/migration-tool-variants` |

Branch names must be:
- **Lowercase and hyphenated** — no spaces, no underscores, no camelCase
- **Descriptive** — a reader should know what the branch does from its name alone
- **Scoped to one concern** — don't bundle unrelated changes on one branch

```powershell
git checkout -b fix/<descriptive-name>
git branch --show-current   # confirm — must NOT output "main"
```

---

## Step 3 — Confirm before proceeding

After creating the branch, output the branch name to the user so they can see it was created. Then proceed with planning (the SDD specify/plan stage).

---

## Hard rules

- **One branch per concern.** A fix for bug A and a new feature B go on separate branches.
- **Never commit directly to main.** All changes reach main via a PR.
- **Never force-push to main.** If a force-push is needed on a feature branch, confirm with the user first.
- **Branch from main** unless you have an explicit reason to branch from another branch (and you have told the user why).

---

## If you already wrote code on main

1. STOP. Tell the user you violated the branching rule.
2. Stash the changes: `git stash`
3. Create the correct branch: `git checkout -b fix/<name>`
4. Apply the stash: `git stash pop`
5. Continue with the task.
