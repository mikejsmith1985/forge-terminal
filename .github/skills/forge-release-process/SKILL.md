---
name: forge-release-process
description: Enforces the Forge local release pipeline for any project. Activates when user says "release", "create a release", "publish", "bump version", or asks about releasing any project.
---

# Forge Release Process — The One True Pipeline

## CRITICAL RULES
1. **NEVER create or suggest GitHub Actions workflows for releasing.** No exceptions.
2. **NEVER push a tag and wait for Actions to create the release.** That is the broken pattern.
3. **ALWAYS use `gh release create` directly** — the release is created locally via the `gh` CLI.
4. **If a `release.yml` workflow already exists in a repo, DELETE IT** and replace with the local pipeline below.

The `release.yml` workflow in forge-terminal is a legacy artifact (workflow_dispatch only, never runs automatically). Do NOT reference it. Do NOT enable it. Do NOT create similar files in other repos.

---

## How to Release Any Project from Forge Terminal

### Step 1: Check for project-specific release assets
Before generating the command, look for files that should be attached to the release (e.g. `toolbox.html`, built binaries, dist files). These get passed to `gh release create` with `--attach` or uploaded via `gh release upload`.

### Step 2: Detect which pipeline to use

**If `scripts/local-release.ps1` exists** (forge-terminal and projects that have adopted the full pipeline):
```powershell
.\scripts\local-release.ps1 patch    # bug fix
.\scripts\local-release.ps1 minor    # new feature  
.\scripts\local-release.ps1 major    # breaking change
.\scripts\local-release.ps1 1.2.3    # exact version
```

**If NO `scripts/local-release.ps1`** (most external projects): use the self-contained command below.

### Step 2B: Self-contained release command (no local-release.ps1)

**PowerShell** — replace `vX.Y.Z` with the actual version and add any release assets:
```powershell
cd "C:\Path\To\Project"
Remove-Item Env:\GH_TOKEN -ErrorAction SilentlyContinue  # clear stale token, use keyring
$ver = "vX.Y.Z"
$ver_success = $true
if (Test-Path package.json) {
    npm version $ver --no-git-tag-version --allow-same-version
    $ver_success = $?
}
if ($ver_success) {
    $b = git branch --show-current
    git add -A
    if ($?) { git commit -m "Release $ver" --allow-empty
    if ($?) { git push origin $b
    if ($?) { git checkout main
    if ($?) { git pull origin main
    if ($?) { git merge $b --no-edit
    if ($?) { git push origin main
    if ($?) { git push origin :refs/tags/$ver 2>$null; git tag -d $ver 2>$null; git tag $ver
    if ($?) { git push origin $ver
    if ($?) { gh release delete $ver --yes 2>$null
              gh release create $ver --title "Release $ver" --notes "Release $ver" --latest `
                toolbox.html   # <-- add any release asset files here, remove if none
              git checkout $b
              Write-Host "Release $ver published on GitHub." -ForegroundColor Green
    }}}}}}}}
}
```

**bash/zsh:**
```bash
cd /path/to/project
unset GH_TOKEN
ver="vX.Y.Z"
[ -f package.json ] && npm version $ver --no-git-tag-version --allow-same-version
b=$(git branch --show-current)
git add -A && git commit -m "Release $ver" --allow-empty \
  && git push origin $b \
  && git checkout main && git pull origin main \
  && git merge $b --no-edit && git push origin main \
  && git push origin :refs/tags/$ver 2>/dev/null; git tag -d $ver 2>/dev/null; git tag $ver \
  && git push origin $ver \
  && (gh release delete $ver --yes 2>/dev/null
      gh release create $ver --title "Release $ver" --notes "Release $ver" --latest \
        toolbox.html)  # <-- add any release asset files here, remove if none \
  && git checkout $b \
  && echo "Release $ver published on GitHub."
```

### Adding release assets
- Single-file tools (like `toolbox.html`): append the filename to `gh release create`
- Multiple files: `gh release create $ver file1 file2 file3 --title ...`
- Upload to existing release: `gh release upload $ver file.html --clobber`

---

## Cleaning Up GH Actions Workflows in a Project
If a `release.yml` or similar workflow was previously created, remove it:
```powershell
Remove-Item ".github\workflows\release.yml" -ErrorAction SilentlyContinue
git add -A
git commit -m "Remove GH Actions release workflow — using local gh CLI pipeline"
git push origin main
```

---

## Prerequisites
- `gh` CLI authenticated: `gh auth login` (use keyring, NOT `$env:GH_TOKEN`)
- `git` with push access to origin
- Remove `$env:GH_TOKEN` before running — a stale token overrides keyring auth and causes failures

---

## Version Increment Rules
| Change Type | Increment | Example |
|-------------|-----------|---------|
| Bug fix / patch | `patch` / `fix` | v1.0.5 → v1.0.6 |
| New feature | `minor` | v1.0.5 → v1.1.0 |
| Breaking change | `major` | v1.0.5 → v2.0.0 |
| Exact version | specify it | v1.2.3 |

---

## The Release Manager Card (in Forge Terminal UI)
The 🚀 Release Manager command card auto-detects the current project and generates the correct command. Click it, review the pasted command, press Enter. No Actions needed.


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
