# install-sdd-hook.ps1 — Installs the SDD gate enforcement PreToolUse hook into the
# project-level Claude Code settings (.claude/settings.json). Run this once after
# cloning, or after any time .claude/settings.json is reset.
# specs/008-sdd-real-enforcement FR-001.

param([switch]$Force)

$settingsPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..' '.claude' 'settings.json'))
$hookCommand  = 'powershell -NoProfile -NonInteractive -File scripts/sdd-gate-check.ps1'

# Load existing settings or start with an empty object.
$raw = '{}'
if (Test-Path $settingsPath) {
    $raw = Get-Content $settingsPath -Raw -Encoding UTF8
}

# Use PowerShell 5-compatible JSON parsing (no -AsHashtable flag needed).
$settings = $raw | ConvertFrom-Json

# Ensure hooks.PreToolUse exists as an array.
if (-not (Get-Member -InputObject $settings -Name 'hooks' -MemberType NoteProperty)) {
    $settings | Add-Member -MemberType NoteProperty -Name 'hooks' -Value (New-Object PSObject)
}
if (-not (Get-Member -InputObject $settings.hooks -Name 'PreToolUse' -MemberType NoteProperty)) {
    $settings.hooks | Add-Member -MemberType NoteProperty -Name 'PreToolUse' -Value @()
}

# Check whether our hook command is already present.
$alreadyInstalled = $settings.hooks.PreToolUse | Where-Object {
    $_.matcher -eq 'Skill' -and ($_.hooks | Where-Object { $_.command -eq $hookCommand })
}

if ($alreadyInstalled -and -not $Force) {
    Write-Host 'SDD gate enforcement hook is already installed.' -ForegroundColor Green
    exit 0
}

# Build and append the new hook entry.
$newEntry = [PSCustomObject]@{
    matcher = 'Skill'
    hooks   = @([PSCustomObject]@{ type = 'command'; command = $hookCommand })
}
$settings.hooks.PreToolUse = @($settings.hooks.PreToolUse) + $newEntry

# Write back — ensure the parent directory exists.
$null = New-Item -ItemType Directory -Path (Split-Path $settingsPath) -Force
$settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8

$msg = 'SDD gate enforcement hook installed at ' + $settingsPath
Write-Host $msg -ForegroundColor Green
Write-Host 'Restart Claude Code for the hook to take effect.' -ForegroundColor Cyan
