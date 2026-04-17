# deploy-skills.ps1 — Copies Forge Terminal Copilot skills to all sibling git repos.
#
# Skills live in forge-terminal/.github/skills/ and need to be present in EVERY
# project that is developed inside Forge Terminal, so that agents working in those
# projects automatically load the correct workflow enforcement and vault knowledge.
#
# Usage:
#   .\scripts\deploy-skills.ps1                  # deploy to all sibling git repos
#   .\scripts\deploy-skills.ps1 -Target C:\Path  # deploy to a specific project
#   .\scripts\deploy-skills.ps1 -DryRun           # preview without writing files
#
# The script is safe to re-run — it overwrites existing skill files with the
# latest version from forge-terminal.

param(
    [string]$Target = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$forgeTerminalRoot = Split-Path $PSScriptRoot -Parent
$skillsSource      = Join-Path $forgeTerminalRoot ".github\skills"
$projectsRoot      = Split-Path $forgeTerminalRoot -Parent

Write-Host ""
Write-Host "+================================================+" -ForegroundColor Cyan
Write-Host "|   Forge Terminal — Deploy Skills               |" -ForegroundColor Cyan
Write-Host "+================================================+" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "  [DRY RUN] No files will be written." -ForegroundColor Yellow
    Write-Host ""
}

# Collect target repos
$targetRepos = @()

if ($Target -ne "") {
    if (-not (Test-Path $Target)) {
        Write-Host "  [ERROR] Target path not found: $Target" -ForegroundColor Red
        exit 1
    }
    $targetRepos = @($Target)
} else {
    # All sibling git repos, excluding forge-terminal itself
    $targetRepos = Get-ChildItem $projectsRoot -Directory |
        Where-Object {
            $_.FullName -ne $forgeTerminalRoot -and
            (Test-Path (Join-Path $_.FullName ".git"))
        } |
        Select-Object -ExpandProperty FullName
}

if ($targetRepos.Count -eq 0) {
    Write-Host "  No target repos found." -ForegroundColor Yellow
    exit 0
}

Write-Host "  Source : $skillsSource"
Write-Host "  Targets: $($targetRepos.Count) repo(s)"
Write-Host ""

$successCount = 0
$skillDirs    = Get-ChildItem $skillsSource -Directory | Select-Object -ExpandProperty FullName

foreach ($repoPath in $targetRepos) {
    $repoName      = Split-Path $repoPath -Leaf
    $destSkillsDir = Join-Path $repoPath ".github\skills"

    Write-Host "  --> $repoName" -ForegroundColor White

    foreach ($skillDir in $skillDirs) {
        $skillName  = Split-Path $skillDir -Leaf
        $skillFile  = Join-Path $skillDir "SKILL.md"
        $destDir    = Join-Path $destSkillsDir $skillName
        $destFile   = Join-Path $destDir "SKILL.md"

        if (-not (Test-Path $skillFile)) { continue }

        if (-not $DryRun) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            Copy-Item -Path $skillFile -Destination $destFile -Force
        }

        Write-Host "      [OK] $skillName" -ForegroundColor Green
    }

    $successCount++
    Write-Host ""
}

Write-Host "+================================================+" -ForegroundColor Cyan
Write-Host "  Skills deployed to $successCount repo(s)$(if ($DryRun) { ' [DRY RUN]' })" -ForegroundColor Green
Write-Host "+================================================+" -ForegroundColor Cyan
Write-Host ""
