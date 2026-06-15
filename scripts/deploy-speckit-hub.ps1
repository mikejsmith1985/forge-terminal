# deploy-speckit-hub.ps1 — Builds the central Spec Kit HUB and installs the global, hub-calling
# speckit skills. This is the SINGLE maintenance point for the hub-and-spoke model: forge-terminal
# is the canonical source; running this script publishes its machinery so every spoke repo (any
# repo with a .specify/ + constitution) picks up the change without per-repo replication.
#
# What it produces:
#   ~/.forge/speckit/{scripts,templates,extensions}   — shared machinery (one copy, machine-wide)
#   ~/.claude/skills/speckit-*                          — global skills, with their script paths
#                                                          rewritten from .specify/scripts/bash/ to
#                                                          the hub, so they call the hub from anywhere
#
# A spoke repo therefore needs only: .specify/memory/constitution.md (its own rules). The scripts
# resolve the repo from the current directory (find_specify_root) and read templates from the hub
# (common.sh Priority-5 fallback).
#
# Usage:  .\scripts\deploy-speckit-hub.ps1            # build/refresh the hub + global skills
#         .\scripts\deploy-speckit-hub.ps1 -DryRun    # preview without writing

param([switch]$DryRun)
$ErrorActionPreference = "Stop"

$forgeRoot   = Split-Path $PSScriptRoot -Parent
$specifySrc  = Join-Path $forgeRoot ".specify"
$skillsSrc   = Join-Path $forgeRoot ".claude\skills"
$hub         = Join-Path $env:USERPROFILE ".forge\speckit"
$globalSkills = Join-Path $env:USERPROFILE ".claude\skills"

# The literal path written INTO the skills. Single-quoted so $HOME stays literal — the agent's
# bash expands it at run time, which works cross-platform (unlike a hard-coded C:\Users\... path).
$hubScriptPath = '$HOME/.forge/speckit/scripts/bash/'

Write-Host "Spec Kit hub deploy ($(if ($DryRun) { 'DRY RUN' } else { 'LIVE' }))" -ForegroundColor Cyan
Write-Host "  source: $forgeRoot"
Write-Host "  hub:    $hub"

# 1. Machinery -> hub (scripts, templates, extensions). Replace wholesale so removals propagate.
foreach ($part in @("scripts", "templates", "extensions")) {
    $src = Join-Path $specifySrc $part
    $dst = Join-Path $hub $part
    if (-not (Test-Path $src)) { continue }
    if ($DryRun) { Write-Host "  would sync .specify/$part -> $dst"; continue }
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $hub | Out-Null
    Copy-Item $src $dst -Recurse -Force
    Write-Host "  synced .specify/$part" -ForegroundColor Green
}

# 2. Global hub-calling skills: copy each speckit-* skill and rewrite its script invocations to
#    the hub. Deriving them (rather than hand-editing) keeps forge-terminal the single source.
$skillCount = 0
Get-ChildItem $skillsSrc -Directory -Filter "speckit-*" | ForEach-Object {
    $dst = Join-Path $globalSkills $_.Name
    if ($DryRun) { Write-Host "  would install skill $($_.Name) (paths -> hub)"; return }
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $globalSkills | Out-Null
    Copy-Item $_.FullName $dst -Recurse -Force
    Get-ChildItem $dst -Recurse -Filter "*.md" | ForEach-Object {
        $content = Get-Content $_.FullName -Raw
        $rewritten = $content -replace '\.specify/scripts/bash/', $hubScriptPath
        if ($rewritten -ne $content) { [IO.File]::WriteAllText($_.FullName, $rewritten) }
    }
    $script:skillCount++
}

if (-not $DryRun) {
    Write-Host "Done. Hub at $hub; $skillCount global speckit skills call the hub." -ForegroundColor Green
    Write-Host "Onboard a repo as a spoke with: .\scripts\speckit-spoke-init.ps1 -Target <repo>" -ForegroundColor Gray
}
