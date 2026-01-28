#!/usr/bin/env pwsh
# install-github-image-skill-all.ps1
# Installs the GitHub Issue Images skill to ALL git repos in a parent directory
#
# Usage:
#   .\scripts\install-github-image-skill-all.ps1 -ParentDir "C:\ProjectsWin"

param(
    [Parameter(Mandatory=$true)]
    [string]$ParentDir
)

$scriptPath = Join-Path $PSScriptRoot "install-github-image-skill.ps1"

if (-not (Test-Path $scriptPath)) {
    Write-Error "Cannot find install script at: $scriptPath"
    exit 1
}

$repos = Get-ChildItem -Path $ParentDir -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName ".git")
}

Write-Host "Found $($repos.Count) git repositories in $ParentDir" -ForegroundColor Cyan
Write-Host ""

$installed = 0
$skipped = 0

foreach ($repo in $repos) {
    $skillFile = Join-Path $repo.FullName ".github\skills\github-issue-images\SKILL.md"
    
    if (Test-Path $skillFile) {
        Write-Host "  [SKIP] $($repo.Name) - already has skill" -ForegroundColor Yellow
        $skipped++
    } else {
        & $scriptPath -TargetRepo $repo.FullName -Force 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [OK] $($repo.Name)" -ForegroundColor Green
            $installed++
        } else {
            Write-Host "  [FAIL] $($repo.Name)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Summary: Installed to $installed repos, skipped $skipped" -ForegroundColor Cyan
