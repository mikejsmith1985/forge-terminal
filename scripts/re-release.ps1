# Re-Release Helper Script (PowerShell)
# 
# Allows manual re-release of a failed version by:
# 1. Deleting the existing (failed) GitHub release
# 2. Force-pushing the same tag to trigger workflow
# 
# Usage: .\scripts\re-release.ps1 <version>
# Example: .\scripts\re-release.ps1 v3.12.11

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

# Ensure version starts with 'v'
$tag = if ($Version.StartsWith('v')) { $Version } else { "v$Version" }

Write-Host "`n🔄 Re-Release Tool" -ForegroundColor Cyan
Write-Host "==================`n" -ForegroundColor Cyan
Write-Host "Version: $tag`n" -ForegroundColor Yellow

# Check if tag exists locally
Write-Host "🔍 Checking local tag..." -ForegroundColor Cyan
$tagExists = git tag -l $tag
if (-not $tagExists) {
    Write-Host "❌ Error: Tag $tag does not exist locally" -ForegroundColor Red
    Write-Host "Available tags:" -ForegroundColor Yellow
    git tag | Select-Object -Last 10
    exit 1
}

Write-Host "✅ Tag exists locally`n" -ForegroundColor Green

# Check if release exists on GitHub
Write-Host "🔍 Checking GitHub for existing release..." -ForegroundColor Cyan
$releaseCheck = gh release view $tag 2>&1 | Out-String

if ($releaseCheck -notmatch 'release not found') {
    Write-Host "📦 Found existing release on GitHub`n" -ForegroundColor Yellow
    
    $confirmation = Read-Host "⚠️  Delete existing release and re-release? (yes/no)"
    
    if ($confirmation -ne 'yes') {
        Write-Host "`n❌ Aborted by user" -ForegroundColor Red
        exit 0
    }

    Write-Host "`n🗑️  Deleting existing release..." -ForegroundColor Cyan
    try {
        gh release delete $tag --yes
        Write-Host "✅ Release deleted" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to delete release" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "ℹ️  No existing release found (tag may have failed to create release)`n" -ForegroundColor Gray
}

# Force push the tag
Write-Host "`n🚀 Force-pushing tag to trigger workflow..." -ForegroundColor Cyan

try {
    git push origin $tag --force
    Write-Host "✅ Tag pushed successfully`n" -ForegroundColor Green
} catch {
    Write-Host "`n❌ Failed to push tag" -ForegroundColor Red
    exit 1
}

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Re-release initiated!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan
Write-Host "📊 Monitor the workflow at:" -ForegroundColor Yellow
Write-Host "   https://github.com/mikejsmith1985/forge-terminal/actions`n" -ForegroundColor White
Write-Host "The workflow will:" -ForegroundColor Yellow
Write-Host "  1. Clean up any remaining release artifacts" -ForegroundColor White
Write-Host "  2. Build all platform binaries" -ForegroundColor White
Write-Host "  3. Create a new release with the same version`n" -ForegroundColor White
