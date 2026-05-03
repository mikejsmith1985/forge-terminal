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

## Setting Up a New Project's Release Pipeline (MANDATORY FIRST STEP)

**BEFORE attempting any release in a new project, check if the local pipeline exists:**

```powershell
Test-Path "scripts\local-release.ps1"
```

**If `False`** — the project has no release pipeline. You MUST set it up first.

### Option A: Use the Release Manager card (recommended for interactive sessions)
1. Open Forge Terminal with the project's directory as the active tab
2. Click the **🚀 Release Manager** card in the Tools sidebar
3. Click **"⚙️ Setup Release Pipeline"** — this calls `POST /api/project/scaffold-release` and creates `scripts/local-release.ps1` from the canonical template
4. Commit the new script:
   ```powershell
   git add scripts/local-release.ps1
   git commit -m "chore: add local release pipeline"
   git push origin HEAD
   ```

### Option B: Call the API directly (for agents/automation)
```powershell
$body = '{"path":"C:\\Path\\To\\Project"}' | ConvertTo-Json -Depth 1
# Or just construct it manually:
$body = "{`"path`":`"C:\\Path\\To\\Project`"}"
Invoke-RestMethod -Method POST -Uri "http://localhost:9999/api/project/scaffold-release" -ContentType "application/json" -Body "{`"path`":`"C:\\ProjectsWin\\YourProject`"}"
```
Response: `{"created": true, "exists": true, "path": "...", "message": "scripts/local-release.ps1 created — commit it to save the pipeline"}`

### Option C: Copy the template manually
Copy `C:\ProjectsWin\forge-terminal\scripts\local-release.ps1` to the new project as a starting point, then customize it for the project's build steps and release assets.

### After setup: customize the template
Open `scripts/local-release.ps1` in the new project and:
1. Uncomment and edit the **Build steps** section (near the bottom)
2. Add project-specific files to `$ReleaseAssets` array if you want binaries attached to the GitHub Release
3. Commit: `git add scripts/ && git commit -m "chore: configure release pipeline"`

---

## How to Release Any Project from Forge Terminal

### Step 1: Check for project-specific release assets
Before generating the command, look for files that should be attached to the release (e.g. `toolbox.html`, built binaries, dist files). These get passed to `gh release create` with `--attach` or uploaded via `gh release upload`.

### Step 2: Detect which pipeline to use

Check if the project has `scripts/local-release.ps1`:
```powershell
Test-Path "scripts\local-release.ps1"
```

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
- For `local-release.ps1`: also needs `go` and `node`

---

## Version Increment Rules
| Change Type | Increment | Example |
|-------------|-----------|---------|
| Bug fix / patch | `patch` / `fix` | v1.0.5 → v1.0.6 |
| New feature | `minor` | v1.0.5 → v1.1.0 |
| Breaking change | `major` | v1.0.5 → v2.0.0 |
| Exact version | specify it | v1.2.3 |

---

## What to NEVER Do
- ❌ Do NOT create or modify `.github/workflows/*.yml` for release purposes
- ❌ Do NOT push tags and wait for GH Actions to create the release
- ❌ Do NOT suggest `gh workflow run` to trigger a release
- ❌ Do NOT use `npm version` with git tag (use `--no-git-tag-version`)
- ❌ Do NOT create releases without merging to main first
- ❌ Do NOT skip the "does scripts/local-release.ps1 exist?" check when starting on a new project

---

## The Release Manager Card (in Forge Terminal UI)
The 🚀 Release Manager command card in Forge Terminal automatically generates the correct command for whichever project is in the current working directory. It:
1. Detects if the current CWD is a git repo
2. Checks for `scripts/local-release.ps1`
3. Generates the appropriate command (Step 2A or 2B above)
4. Pastes it into the terminal ready to run

If the card isn't visible, restore it via Settings → Restore Release Manager.

---

## Agent Checklist — Before Every Release

Run through this before executing ANY release command:

1. ☑ **`Test-Path "scripts\local-release.ps1"`** → if False, scaffold it first (see "Setting Up a New Project" above)
2. ☑ **`gh auth status`** → ensure `gh` is authenticated (not using `$env:GH_TOKEN`)
3. ☑ **`Remove-Item Env:\GH_TOKEN -ErrorAction SilentlyContinue`** → clear stale token
4. ☑ **You are on a feature branch, not `main`** → the script merges to main for you
5. ☑ **The explicit version to release is known** → pass it as `.\scripts\local-release.ps1 X.Y.Z`

If any check fails, fix it before proceeding. A broken release half-way through is worse than no release.

