#!/usr/bin/env pwsh
# install-forge-release-skill.ps1
# Installs the Forge Release Process skill to a target repository.
# Also removes any GH Actions release.yml that may have been created by mistake.
#
# Usage:
#   .\scripts\install-forge-release-skill.ps1 -TargetRepo "C:\ProjectsWin\ToolBox"
#   .\scripts\install-forge-release-skill.ps1 -TargetRepo "C:\ProjectsWin\ToolBox" -Force

param(
    [Parameter(Mandatory=$true)]
    [string]$TargetRepo,

    [switch]$Force
)

# Read the canonical SKILL.md from forge-terminal's own copy
$sourceSkill = Join-Path $PSScriptRoot ".." ".github" "skills" "forge-release-process" "SKILL.md"
$resolved = Resolve-Path $sourceSkill -ErrorAction SilentlyContinue
if ($resolved) { $sourceSkill = $resolved.Path }

if (-not (Test-Path $sourceSkill)) {
    Write-Error "Cannot find source skill at: $sourceSkill"
    Write-Error "Run this script from the forge-terminal repo."
    exit 1
}

# Validate target repo
if (-not (Test-Path $TargetRepo)) {
    Write-Error "Target repository does not exist: $TargetRepo"
    exit 1
}

if (-not (Test-Path (Join-Path $TargetRepo ".git"))) {
    Write-Warning "Target path is not a git repository: $TargetRepo"
    if (-not $Force) {
        Write-Error "Use -Force to install anyway"
        exit 1
    }
}

$repoName = Split-Path $TargetRepo -Leaf

# ── Install skill ─────────────────────────────────────────────────────────────
$skillDir  = Join-Path $TargetRepo ".github" "skills" "forge-release-process"
$skillFile = Join-Path $skillDir "SKILL.md"

if ((Test-Path $skillFile) -and -not $Force) {
    Write-Host "  [SKIP] $repoName — skill already installed (use -Force to overwrite)" -ForegroundColor Yellow
} else {
    New-Item -ItemType Directory -Path $skillDir -Force | Out-Null
    # Skip copy if source and destination are the same file (i.e. forge-terminal itself)
    $srcResolved = (Resolve-Path $sourceSkill).Path
    $dstResolved = if (Test-Path $skillFile) { (Resolve-Path $skillFile).Path } else { $skillFile }
    if ($srcResolved -ne $dstResolved) {
        Copy-Item $sourceSkill $skillFile -Force
    }
    Write-Host "  [OK]   $repoName — forge-release-process skill installed" -ForegroundColor Green
}

# ── Remove stale GH Actions release workflow if present ───────────────────────
$badWorkflow = Join-Path $TargetRepo ".github" "workflows" "release.yml"
if (Test-Path $badWorkflow) {
    Remove-Item $badWorkflow -Force
    Write-Host "  [FIX]  $repoName — removed .github/workflows/release.yml (GH Actions not used for releases)" -ForegroundColor Cyan

    # Commit the removal
    Push-Location $TargetRepo
    try {
        git add ".github/workflows/release.yml" 2>$null
        git commit -m "chore: remove GH Actions release workflow

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" 2>$null
        git push origin (git branch --show-current) 2>$null
        Write-Host "  [OK]   $repoName — removal committed and pushed" -ForegroundColor Green
    } catch {
        Write-Warning "  Could not auto-commit removal in $repoName — remove manually"
    } finally {
        Pop-Location
    }
}

# ── Commit skill to target repo ───────────────────────────────────────────────
Push-Location $TargetRepo
try {
    $status = git status --porcelain ".github/skills/forge-release-process" 2>$null
    if ($status) {
        git add ".github/skills/forge-release-process" 2>$null
        git commit -m "chore: add forge-release-process skill

Ensures releases always use the local gh CLI pipeline.
Never uses GitHub Actions for releases.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" 2>$null
        git push origin (git branch --show-current) 2>$null
        Write-Host "  [OK]   $repoName — skill committed and pushed" -ForegroundColor Green
    }
} catch {
    Write-Warning "  Could not auto-commit skill in $repoName — add manually"
} finally {
    Pop-Location
}
