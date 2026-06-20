# install-sdd-hook.ps1 — Installs the SDD gate enforcement PreToolUse hook into the
# GLOBAL Claude Code settings (~/.claude/settings.json) and copies the gate-check script
# to ~/.claude/scripts/ so the hook fires in every repository, not just forge-terminal.
# Run this once per machine after initial setup, or after a settings reset.
# specs/008-sdd-real-enforcement FR-001.

param([switch]$Force)

$claudeUserDir   = Join-Path $env:USERPROFILE '.claude'
$globalScriptsDir = Join-Path $claudeUserDir 'scripts'
$globalSettings  = Join-Path $claudeUserDir 'settings.json'
$sourceScript    = Join-Path $PSScriptRoot 'sdd-gate-check.ps1'
$destScript      = Join-Path $globalScriptsDir 'sdd-gate-check.ps1'

# The hook command uses an absolute path so it resolves regardless of the CWD
# in which the hook fires (i.e. any repository the developer works in).
$hookCommand = "powershell -NoProfile -NonInteractive -File `"$destScript`""

# --- Step 1: copy the gate-check script to the global scripts directory -----------

$null = New-Item -ItemType Directory -Path $globalScriptsDir -Force
Copy-Item -Path $sourceScript -Destination $destScript -Force
Write-Host "Gate-check script copied to: $destScript" -ForegroundColor Cyan

# --- Step 2: load or initialise the global settings file -------------------------

$raw = '{}'
if (Test-Path $globalSettings) {
    $raw = Get-Content $globalSettings -Raw -Encoding UTF8
}

# PS 5.1-compatible JSON parsing — no -AsHashtable flag available.
$settings = $raw | ConvertFrom-Json

# --- Step 3: ensure the PreToolUse hook array exists -----------------------------

if (-not (Get-Member -InputObject $settings -Name 'hooks' -MemberType NoteProperty)) {
    $settings | Add-Member -MemberType NoteProperty -Name 'hooks' -Value (New-Object PSObject)
}
if (-not (Get-Member -InputObject $settings.hooks -Name 'PreToolUse' -MemberType NoteProperty)) {
    $settings.hooks | Add-Member -MemberType NoteProperty -Name 'PreToolUse' -Value @()
}

# --- Step 4: skip if already installed (unless -Force was passed) ----------------

$isAlreadyInstalled = $settings.hooks.PreToolUse | Where-Object {
    $_.matcher -eq 'Skill' -and ($_.hooks | Where-Object { $_.command -eq $hookCommand })
}

if ($isAlreadyInstalled -and -not $Force) {
    Write-Host 'SDD gate enforcement hook is already installed in global settings.' -ForegroundColor Green
    exit 0
}

# --- Step 5: append the hook entry and write back --------------------------------

$newEntry = [PSCustomObject]@{
    matcher = 'Skill'
    hooks   = @([PSCustomObject]@{ type = 'command'; command = $hookCommand })
}
$settings.hooks.PreToolUse = @($settings.hooks.PreToolUse) + $newEntry

$settings | ConvertTo-Json -Depth 10 | Set-Content $globalSettings -Encoding UTF8

Write-Host "SDD gate enforcement hook installed in: $globalSettings" -ForegroundColor Green
Write-Host 'Restart Claude Code for the hook to take effect.' -ForegroundColor Cyan
