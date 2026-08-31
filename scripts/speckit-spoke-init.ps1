# speckit-spoke-init.ps1 — Onboard a repository as a Spec Kit SPOKE. Creates only the per-repo
# part (.specify/memory/constitution.md); every script and template comes from the central hub
# (~/.forge/speckit), so there is nothing to replicate or maintain per repo. Run the hub deploy
# (deploy-speckit-hub.ps1) once first.
#
# Usage:  .\scripts\speckit-spoke-init.ps1 -Target C:\Path\To\Repo
#         .\scripts\speckit-spoke-init.ps1 -Target C:\Path\To\Repo -Force   # overwrite constitution

param(
    [Parameter(Mandatory)][string]$Target,
    [switch]$Force
)
$ErrorActionPreference = "Stop"

$hub = Join-Path $env:USERPROFILE ".forge\speckit"
if (-not (Test-Path $hub)) { throw "Hub not found at $hub — run scripts\deploy-speckit-hub.ps1 first." }
if (-not (Test-Path $Target)) { throw "Target repo not found: $Target" }

$memoryDir    = Join-Path $Target ".specify\memory"
$constitution = Join-Path $memoryDir "constitution.md"
New-Item -ItemType Directory -Force -Path $memoryDir | Out-Null

if ((Test-Path $constitution) -and -not $Force) {
    Write-Host "Constitution already present: $constitution (use -Force to overwrite)." -ForegroundColor Yellow
} else {
    $template = Join-Path $hub "templates\constitution-template.md"
    if (Test-Path $template) {
        Copy-Item $template $constitution -Force
    } else {
        Set-Content -Path $constitution -Value "# $(Split-Path $Target -Leaf) — Project Constitution`n`n> Placeholder. Run /speckit-constitution in this repo to author its binding rules."
    }
    Write-Host "Wrote $constitution" -ForegroundColor Green
}

Write-Host "Spoke ready: /speckit-* now works in $Target (all machinery resolves from the hub)." -ForegroundColor Green
Write-Host "Next, in that repo: run /speckit-constitution to author its rules, then /speckit-specify." -ForegroundColor Gray
