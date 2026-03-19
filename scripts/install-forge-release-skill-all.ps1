#!/usr/bin/env pwsh
# install-forge-release-skill-all.ps1
# Installs the Forge Release Process skill to ALL git repos in a parent directory.
# Also removes any stale GH Actions release.yml from each repo.
#
# Usage:
#   .\scripts\install-forge-release-skill-all.ps1 -ParentDir "C:\ProjectsWin"

param(
    [Parameter(Mandatory=$true)]
    [string]$ParentDir
)

$scriptPath = Join-Path $PSScriptRoot "install-forge-release-skill.ps1"

if (-not (Test-Path $scriptPath)) {
    Write-Error "Cannot find install script at: $scriptPath"
    exit 1
}

$repos = Get-ChildItem -Path $ParentDir -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName ".git")
}

Write-Host ""
Write-Host "  Forge Release Skill Installer" -ForegroundColor Magenta
Write-Host "  Found $($repos.Count) git repositories in $ParentDir" -ForegroundColor Cyan
Write-Host ""

$installed = 0
$skipped   = 0
$failed    = 0

foreach ($repo in $repos) {
    & $scriptPath -TargetRepo $repo.FullName -Force
    if ($LASTEXITCODE -eq 0) { $installed++ } else { $failed++ }
}

Write-Host ""
Write-Host "  Done: $installed updated, $skipped skipped, $failed failed" -ForegroundColor Cyan
Write-Host ""
