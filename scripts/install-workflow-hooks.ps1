# install-workflow-hooks.ps1 — put the Forge workflow gate into the pre-commit hook git runs.
#
# The hook calls `forge workflow preflight` and refuses any commit whose
# .forge/workflow-ticket.json is missing a required gate or belongs to another
# branch. Set FORGE_BYPASS=1 to override (logged to .forge/bypasses.log).
#
# This script no longer carries its own copy of the hook. It delegates to
# `forge workflow hooks`, which asks git where hooks live (core.hooksPath),
# merges the gate into Forge's own scaffold hook when one is present, and
# refuses to touch a hook written by another tool. Three hand-maintained
# copies of the hook body are how the gate drifted out of every scaffolded
# repository; one source of truth is the fix.
#
# Usage:
#   .\scripts\install-workflow-hooks.ps1            # install into current repo
#   .\scripts\install-workflow-hooks.ps1 -Path C:\path\to\repo

param(
  [string]$Path = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path (Join-Path $Path ".git"))) {
  Write-Error "Not a git repository: $Path"
}

# Locate Forge Terminal. FORGE_BIN is exported into every Forge tab; a bare
# "forge" on PATH is deliberately not tried, because an unrelated package
# answers to that name.
$forgeBin = $null
$candidates = @(
  $env:FORGE_BIN,
  (Join-Path $Path "fterm.exe"),
  (Join-Path $Path "forge.exe")
) | Where-Object { $_ -and (Test-Path $_) }
if ($candidates.Count -gt 0) {
  $forgeBin = $candidates[0]
} elseif (Get-Command fterm -ErrorAction SilentlyContinue) {
  $forgeBin = (Get-Command fterm).Source
}

if (-not $forgeBin) {
  Write-Error ("Forge Terminal not found. Run this from a Forge Terminal tab (FORGE_BIN is set there), " +
    "or put fterm on PATH. The hook needs the same binary at commit time, so an install without it would enforce nothing.")
}

Push-Location $Path
try {
  & $forgeBin workflow hooks
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
