---
name: forge-release-process
description: Enforces the Forge local release pipeline for any project. Activates when user says "release", "create a release", "publish", "bump version", or asks about releasing any project.
---

# Forge Release Process — The One True Pipeline

## CRITICAL RULE
**NEVER suggest or generate GitHub Actions workflows for releasing.** The Forge release process is 100% local using `gh` CLI. No GH Actions. No exceptions.

The `release.yml` workflow that exists in forge-terminal is a legacy artifact. It does NOT run automatically (workflow_dispatch only). Do NOT reference it. Do NOT suggest enabling it.

---

## How to Release Any Project from Forge Terminal

### Step 1: Detect which pipeline to use

Check if the project has `scripts/local-release.ps1`:
```powershell
Test-Path "scripts\local-release.ps1"
```

### Step 2A: Project HAS `scripts/local-release.ps1` (preferred)
Use it directly. This is the full pipeline: frontend build, binary cross-compilation, gh release create.

```powershell
# PowerShell (from the project root)
.\scripts\local-release.ps1 patch    # bug fix
.\scripts\local-release.ps1 minor    # new feature
.\scripts\local-release.ps1 major    # breaking change
.\scripts\local-release.ps1 1.2.3    # exact version
```

```bash
# bash/zsh
pwsh -File ./scripts/local-release.ps1 patch
```

### Step 2B: Project does NOT have `scripts/local-release.ps1`
Use this self-contained command. It commits, merges to main, tags, and creates the GitHub Release — all via `gh` CLI:

**PowerShell:**
```powershell
cd "C:\Path\To\Project"
$ver_success = $true
if (Test-Path package.json) {
    npm version vX.Y.Z --no-git-tag-version --allow-same-version
    $ver_success = $?
}
if ($ver_success) {
    $b = git branch --show-current
    git add -A
    if ($?) { git commit -m "Release vX.Y.Z" --allow-empty
    if ($?) { git push origin $b
    if ($?) { git checkout main
    if ($?) { git pull origin main
    if ($?) { git merge $b --no-edit
    if ($?) { git push origin main
    if ($?) { git push origin :refs/tags/vX.Y.Z 2>$null; git tag -d vX.Y.Z 2>$null; git tag vX.Y.Z
    if ($?) { git push origin vX.Y.Z
    if ($?) { gh release delete vX.Y.Z --yes 2>$null
              gh release create vX.Y.Z --title "Release vX.Y.Z" --notes "Release vX.Y.Z" --latest
              git checkout $b
              Write-Host "Release vX.Y.Z published." -ForegroundColor Green
    }}}}}}}}
}
```

**bash/zsh:**
```bash
cd /path/to/project
[ -f package.json ] && npm version vX.Y.Z --no-git-tag-version --allow-same-version
b=$(git branch --show-current)
git add -A && git commit -m "Release vX.Y.Z" --allow-empty \
  && git push origin $b \
  && git checkout main && git pull origin main \
  && git merge $b --no-edit && git push origin main \
  && git push origin :refs/tags/vX.Y.Z 2>/dev/null; git tag -d vX.Y.Z 2>/dev/null; git tag vX.Y.Z \
  && git push origin vX.Y.Z \
  && (gh release delete vX.Y.Z --yes 2>/dev/null; gh release create vX.Y.Z --title "Release vX.Y.Z" --notes "Release vX.Y.Z" --latest) \
  && git checkout $b \
  && echo "Release vX.Y.Z published."
```

---

## Prerequisites (Required in every environment)
- `gh` CLI installed and authenticated: `gh auth login`
- `git` configured with push access to origin
- For `local-release.ps1`: also needs `go`, `node`

---

## Version Increment Rules
| Change Type | Increment | Example |
|-------------|-----------|---------|
| Bug fix / patch | `patch` / `fix` | v1.0.5 → v1.0.6 |
| New feature (backwards compatible) | `minor` | v1.0.5 → v1.1.0 |
| Breaking change | `major` | v1.0.5 → v2.0.0 |
| Exact version | specify it | v1.2.3 |

---

## What to NEVER Do
- ❌ Do NOT create or modify `.github/workflows/*.yml` for release purposes
- ❌ Do NOT push tags and wait for GH Actions to create the release
- ❌ Do NOT suggest `gh workflow run` to trigger a release
- ❌ Do NOT use `npm version` with git tag (use `--no-git-tag-version`)
- ❌ Do NOT create releases without merging to main first

---

## The Release Manager Card (in Forge Terminal UI)
The 🚀 Release Manager command card in Forge Terminal automatically generates the correct command for whichever project is in the current working directory. It:
1. Detects if the current CWD is a git repo
2. Checks for `scripts/local-release.ps1`
3. Generates the appropriate command (Step 2A or 2B above)
4. Pastes it into the terminal ready to run

If the card isn't visible, restore it via Settings → Restore Release Manager.
