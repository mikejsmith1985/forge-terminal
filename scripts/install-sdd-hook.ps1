# install-sdd-hook.ps1 — Installs the SDD gate enforcement PreToolUse hook into the
# project-level Claude Code settings (.claude/settings.json). Run this once after
# cloning, or after any time .claude/settings.json is reset.
#
# The hook blocks any speckit Skill invocation when an SDD gate is open, giving the
# HITL gate system real enforcement rather than advisory review cards.
# specs/008-sdd-real-enforcement FR-001.

param(
    [switch]$Force
)

$settingsPath = Join-Path $PSScriptRoot '..' '.claude' 'settings.json'
$settingsPath = [System.IO.Path]::GetFullPath($settingsPath)

$hookCommand = 'powershell -NoProfile -NonInteractive -File scripts/sdd-gate-check.ps1'

$settings = @{}
if (Test-Path $settingsPath) {
    try {
        $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json -AsHashtable -ErrorAction Stop
    } catch {
        Write-Warning "Could not parse existing $settingsPath — starting fresh."
    }
}

# Ensure the hooks.PreToolUse array exists.
if (-not $settings.ContainsKey('hooks')) { $settings['hooks'] = @{} }
if (-not $settings['hooks'].ContainsKey('PreToolUse')) { $settings['hooks']['PreToolUse'] = @() }

# Check if the SDD gate hook is already registered.
$alreadyInstalled = $settings['hooks']['PreToolUse'] | Where-Object {
    $_.matcher -eq 'Skill' -and ($_.hooks | Where-Object { $_.command -eq $hookCommand })
}

if ($alreadyInstalled -and -not $Force) {
    Write-Host 'SDD gate enforcement hook is already installed.' -ForegroundColor Green
    exit 0
}

# Append the hook entry.
$settings['hooks']['PreToolUse'] += @{
    matcher = 'Skill'
    hooks   = @(
        @{ type = 'command'; command = $hookCommand }
    )
}

$settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8
Write-Host "SDD gate enforcement hook installed at $settingsPath" -ForegroundColor Green
Write-Host 'Restart Claude Code for the hook to take effect.' -ForegroundColor Cyan
