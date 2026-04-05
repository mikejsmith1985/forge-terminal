#Requires -Version 5.1
<#
.SYNOPSIS
    Forge Terminal — Local Release Pipeline

.DESCRIPTION
    Builds release binaries for all platforms and publishes a GitHub Release
    without using GitHub Actions. Requires: Go, Node.js, gh CLI (authenticated).

.PARAMETER VersionType
    Version bump type: patch, minor, major, or a specific version like "3.19.0"

.EXAMPLE
    .\scripts\local-release.ps1 patch
    .\scripts\local-release.ps1 minor
    .\scripts\local-release.ps1 3.19.0
#>
param(
    [Parameter(Position=0)]
    [string]$VersionType = "patch"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
Set-Location $ROOT

# ── Colours ──────────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red; exit 1 }
function Write-Banner{ param($msg) Write-Host "`n============================================" -ForegroundColor DarkGray; Write-Host "  $msg" -ForegroundColor White; Write-Host "============================================" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "  +============================================+" -ForegroundColor Magenta
Write-Host "  |   Forge Terminal — Local Release Script  |" -ForegroundColor Magenta
Write-Host "  +============================================+" -ForegroundColor Magenta
Write-Host ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
Write-Banner "Pre-flight checks"

if (-not (Get-Command go -ErrorAction SilentlyContinue))  { Write-Fail "Go not found in PATH" }
Write-OK "Go $(go version | Select-String -Pattern 'go\d+\.\d+' -AllMatches | ForEach-Object { $_.Matches[0].Value })"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Fail "Node.js not found in PATH" }
Write-OK "Node $(node --version)"

if (-not (Get-Command gh -ErrorAction SilentlyContinue))  { Write-Fail "gh CLI not found in PATH" }
# Remove stale GH_TOKEN that would override keyring credentials
Remove-Item Env:\GH_TOKEN -ErrorAction SilentlyContinue
$ghUser = gh api user --jq '.login' 2>$null
if (-not $ghUser) { Write-Fail "gh CLI not authenticated. Run: gh auth login" }
Write-OK "gh CLI authenticated as $ghUser"

# Clean working tree check
$dirty = git status --porcelain 2>$null
if ($dirty) {
    Write-Warn "Uncommitted changes detected:"
    git status --short
    $confirm = Read-Host "`n  Stage and include all changes in this release? (y/N)"
    if ($confirm -notmatch '^[Yy]$') { Write-Fail "Release cancelled" }
}
Write-OK "Git status checked"

# ── Version calculation ───────────────────────────────────────────────────────
Write-Banner "Version"

$currentTag = git describe --tags --abbrev=0 2>$null
if (-not $currentTag) { $currentTag = "v0.0.0" }
$current = $currentTag.TrimStart('v')
Write-Step "Current: v$current"

if ($VersionType -match '^\d+\.\d+\.\d+$') {
    $NEW_VERSION = $VersionType
} else {
    $parts = $current -split '\.'
    $maj = [int]$parts[0]; $min = [int]$parts[1]; $pat = [int]$parts[2]
    switch ($VersionType) {
        "major" { $NEW_VERSION = "$($maj+1).0.0" }
        "minor" { $NEW_VERSION = "$maj.$($min+1).0" }
        "patch" { $NEW_VERSION = "$maj.$min.$($pat+1)" }
        default { Write-Fail "Unknown version type '$VersionType'. Use: patch, minor, major, or X.Y.Z" }
    }
}

Write-OK "New version: v$NEW_VERSION"
$TAG = "v$NEW_VERSION"

# ── Update version in source files ───────────────────────────────────────────
Write-Banner "Updating version files"
$utf8NoBOM = [System.Text.UTF8Encoding]::new($false)

function Update-FileContent {
    param($Path, $Pattern, $Replacement, $Label)
    if (Test-Path $Path) {
        $content = [System.IO.File]::ReadAllText($Path) -replace $Pattern, $Replacement
        [System.IO.File]::WriteAllText($Path, $content, $utf8NoBOM)
        Write-OK $Label
    }
}

Update-FileContent "$ROOT\internal\updater\updater.go" `
    'var Version = "[^"]*"' "var Version = `"$NEW_VERSION`"" `
    "internal/updater/updater.go"

Update-FileContent "$ROOT\frontend\package.json" `
    '"version": "[^"]*"' "`"version`": `"$NEW_VERSION`"" `
    "frontend/package.json"

Update-FileContent "$ROOT\frontend\src\config\tourSteps.js" `
    "const TOUR_VERSION = '[^']*'" "const TOUR_VERSION = '$NEW_VERSION'" `
    "frontend/src/config/tourSteps.js"

# ── Build frontend ────────────────────────────────────────────────────────────
Write-Banner "Building frontend"
Write-Step "Running npm run build..."
Push-Location "$ROOT\frontend"
try {
    $buildOut = cmd /c "npm run build 2>&1"
    $buildExit = $LASTEXITCODE
    $buildOut | ForEach-Object {
        if ($_ -match '^error ' -and $_ -notmatch 'deprecated') { Write-Host "  $_" -ForegroundColor Red }
        elseif ($_ -match 'built in') { Write-Host "  $_" -ForegroundColor Green }
    }
    if ($buildExit -ne 0) { Write-Fail "Frontend build failed (exit $buildExit)" }
    Write-OK "Frontend built"
} finally {
    Pop-Location
}

# ── Generate Windows resources ────────────────────────────────────────────────
Write-Banner "Generating Windows resources"
Write-Step "Running go generate (goversioninfo)..."
Push-Location "$ROOT\cmd\forge"
try {
    $genOut = go generate ./... 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "go generate had warnings (non-fatal): $genOut"
    } else {
        Write-OK "Windows resource file generated"
    }
} finally {
    Pop-Location
}

# ── Cross-compile all binaries ────────────────────────────────────────────────
Write-Banner "Building binaries"

$LDBASE  = "-s -w -X github.com/mikejsmith1985/forge-terminal/internal/updater.Version=$NEW_VERSION"
$LDWIN   = "$LDBASE -H windowsgui"
$BINDIR  = "$ROOT\bin"
New-Item -ItemType Directory -Force -Path $BINDIR | Out-Null

$builds = @(
    @{ GOOS="windows"; GOARCH="amd64"; Out="fterm.exe";          LD=$LDWIN  },
    @{ GOOS="linux";   GOARCH="amd64"; Out="forge-linux-amd64";  LD=$LDBASE },
    @{ GOOS="darwin";  GOARCH="amd64"; Out="forge-darwin-amd64"; LD=$LDBASE },
    @{ GOOS="darwin";  GOARCH="arm64"; Out="forge-darwin-arm64"; LD=$LDBASE }
)

foreach ($b in $builds) {
    Write-Step "Building $($b.Out) ($($b.GOOS)/$($b.GOARCH))..."
    $env:GOOS   = $b.GOOS
    $env:GOARCH = $b.GOARCH
    $outPath = "$BINDIR\$($b.Out)"
    go build -trimpath -ldflags $b.LD -o $outPath ./cmd/forge/
    if ($LASTEXITCODE -ne 0) { Write-Fail "Build failed for $($b.Out)" }
    $size = [math]::Round((Get-Item $outPath).Length / 1MB, 1)
    Write-OK "$($b.Out) — ${size} MB"
}

Remove-Item Env:\GOOS  -ErrorAction SilentlyContinue
Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue

# ── Commit version bump ───────────────────────────────────────────────────────
Write-Banner "Committing version bump"
git add -A
git commit -m "chore: release $TAG" --allow-empty
if ($LASTEXITCODE -ne 0) { Write-Fail "git commit failed" }
Write-OK "Committed: Release $TAG"

git push origin HEAD
if ($LASTEXITCODE -ne 0) { Write-Fail "git push failed" }
Write-OK "Pushed to origin"

# ── Git tag ───────────────────────────────────────────────────────────────────
Write-Banner "Tagging"

# Delete stale local tag if it exists (idempotent re-runs)
$existingLocal = git tag -l $TAG 2>$null
if ($existingLocal) {
    Write-Warn "Local tag $TAG exists — deleting and recreating"
    git tag -d $TAG | Out-Null
}
git tag -a $TAG -m "Release $TAG"
if ($LASTEXITCODE -ne 0) { Write-Fail "git tag failed" }
Write-OK "Tag $TAG created locally"

# Delete stale remote tag if it exists, then push fresh
$remoteTag = git ls-remote --tags origin "refs/tags/$TAG" 2>$null
if ($remoteTag) {
    Write-Warn "Remote tag $TAG exists — deleting stale remote tag"
    git push origin ":refs/tags/$TAG" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to delete stale remote tag $TAG" }
    Write-OK "Stale remote tag deleted"
}
git push origin $TAG
if ($LASTEXITCODE -ne 0) { Write-Fail "Tag push failed" }
Write-OK "Tag $TAG pushed to origin"

# ── Release notes ─────────────────────────────────────────────────────────────
Write-Banner "Release notes"
Write-Host "  Enter release notes (press Enter twice to finish):" -ForegroundColor Yellow
$lines = @()
$emptyCount = 0
while ($emptyCount -lt 1) {
    $line = Read-Host "  "
    if ($line -eq "") { $emptyCount++ } else { $emptyCount = 0; $lines += $line }
}
$RELEASE_NOTES = if ($lines.Count -gt 0) { $lines -join "`n" } else { "Release $TAG" }

# ── Create GitHub Release ─────────────────────────────────────────────────────
Write-Banner "Publishing GitHub Release"

# Delete stale GitHub release if it already exists (idempotent re-runs)
$existingRelease = $null
try { $existingRelease = gh release view $TAG --json tagName --jq '.tagName' 2>$null } catch {}
if ($LASTEXITCODE -eq 0 -and $existingRelease) {
    Write-Warn "GitHub release $TAG already exists — deleting stale release"
    gh release delete $TAG --yes 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to delete stale GitHub release $TAG" }
    Write-OK "Stale GitHub release deleted"
}

Write-Step "Creating draft release $TAG..."
$notesFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($notesFile, $RELEASE_NOTES, [System.Text.UTF8Encoding]::new($false))
gh release create $TAG `
    --title "Forge Terminal $TAG" `
    --notes-file $notesFile `
    --draft
if ($LASTEXITCODE -ne 0) { Remove-Item $notesFile -ErrorAction SilentlyContinue; Write-Fail "gh release create failed" }
Remove-Item $notesFile -ErrorAction SilentlyContinue
Write-OK "Draft release created"

Write-Step "Uploading binaries..."
$assets = @(
    "$BINDIR\fterm.exe",
    "$BINDIR\forge-linux-amd64",
    "$BINDIR\forge-darwin-amd64",
    "$BINDIR\forge-darwin-arm64"
)
foreach ($asset in $assets) {
    if (Test-Path $asset) {
        gh release upload $TAG $asset
        if ($LASTEXITCODE -ne 0) { Write-Fail "Upload failed for $asset" }
        Write-OK "Uploaded $(Split-Path $asset -Leaf)"
    } else {
        Write-Warn "Binary not found, skipping: $asset"
    }
}

Write-Step "Publishing release..."
gh release edit $TAG --draft=false
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to publish release" }
Write-OK "Release $TAG published"

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +============================================+" -ForegroundColor Green
Write-Host "  |     Release $TAG complete!   |" -ForegroundColor Green
Write-Host "  +============================================+" -ForegroundColor Green
Write-Host ""
Write-Host "  View: https://github.com/mikejsmith1985/forge-terminal/releases/tag/$TAG" -ForegroundColor Cyan
Write-Host ""
