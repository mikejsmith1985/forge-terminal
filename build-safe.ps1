#!/usr/bin/env pwsh
# PERMANENT BUILD SCRIPT - ONLY builds to forge-test.exe
# This script CANNOT build to fterm.exe (it's read-only)

Write-Host "Building Forge Terminal TEST VERSION..." -ForegroundColor Cyan
Write-Host ""

# Check if trying to build production (BLOCKED)
if ($args -contains "fterm.exe" -or $args -contains "fterm") {
    Write-Host "❌ BLOCKED: Cannot build to fterm.exe" -ForegroundColor Red
    Write-Host "   fterm.exe is read-only (user's production instance)" -ForegroundColor Yellow
    Write-Host "   Use this script without arguments to build forge-test.exe" -ForegroundColor Yellow
    exit 1
}

# Build test version
Write-Host "Building: forge-test.exe" -ForegroundColor Green
go build -o forge-test.exe ./cmd/forge

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Build complete: forge-test.exe" -ForegroundColor Green
    Write-Host ""
    Write-Host "To test:" -ForegroundColor Cyan
    Write-Host "  .\forge-test.exe"
    Write-Host ""
    Write-Host "To update production (USER ONLY):" -ForegroundColor Yellow
    Write-Host "  1. Stop fterm.exe"
    Write-Host "  2. attrib -R fterm.exe"
    Write-Host "  3. copy forge-test.exe fterm.exe"
    Write-Host "  4. attrib +R fterm.exe"
    Write-Host "  5. Start fterm.exe"
} else {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}
