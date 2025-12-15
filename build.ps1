# Forge Terminal Build Script for Windows
# Alternative to Makefile for Windows environments without Make

param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$Clean
)

Write-Host "🔥 Forge Terminal Build Script" -ForegroundColor Cyan
Write-Host ""

# Clean build artifacts
if ($Clean) {
    Write-Host "🧹 Cleaning build artifacts..." -ForegroundColor Yellow
    Remove-Item -Path "bin" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "web\assets" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "frontend\dist" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "frontend\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Clean complete" -ForegroundColor Green
    Write-Host ""
}

# Build frontend
if (-not $SkipFrontend) {
    Write-Host "📦 Building frontend..." -ForegroundColor Yellow
    Push-Location frontend
    
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Installing npm dependencies..." -ForegroundColor Gray
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "✗ Frontend npm install failed" -ForegroundColor Red
            Pop-Location
            exit 1
        }
    }
    
    Write-Host "  Running build..." -ForegroundColor Gray
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Frontend build failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Pop-Location
    Write-Host "✓ Frontend built successfully" -ForegroundColor Green
    Write-Host ""
}

# Build backend
if (-not $SkipBackend) {
    Write-Host "🔨 Building backend..." -ForegroundColor Yellow
    
    # Get version from git tag or use "dev"
    $version = "dev"
    try {
        $gitVersion = git describe --tags --always --dirty 2>$null
        if ($LASTEXITCODE -eq 0 -and $gitVersion) {
            $version = $gitVersion
        }
    } catch {
        # Git not available or not in a repo, use "dev"
    }
    
    Write-Host "  Version: $version" -ForegroundColor Gray
    
    # Ensure bin directory exists
    if (-not (Test-Path "bin")) {
        New-Item -Path "bin" -ItemType Directory -Force | Out-Null
    }
    
    # Build with version info
    $ldflags = "-ldflags `"-s -w -X github.com/mikejsmith1985/forge-terminal/internal/updater.Version=$version -H windowsgui`""
    
    Write-Host "  Compiling..." -ForegroundColor Gray
    $cmd = "go build $ldflags -o bin\forge.exe .\cmd\forge"
    Invoke-Expression $cmd
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Backend build failed" -ForegroundColor Red
        exit 1
    }
    
    $binary = Get-Item "bin\forge.exe"
    $sizeMB = [math]::Round($binary.Length / 1MB, 1)
    Write-Host "✓ Backend built successfully ($sizeMB MB)" -ForegroundColor Green
    Write-Host ""
}

Write-Host "✅ Build complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Run the application:" -ForegroundColor Cyan
Write-Host "  .\bin\forge.exe" -ForegroundColor White
Write-Host ""
Write-Host "Build options:" -ForegroundColor Cyan
Write-Host "  .\build.ps1              # Full build (frontend + backend)" -ForegroundColor White
Write-Host "  .\build.ps1 -SkipFrontend # Backend only" -ForegroundColor White
Write-Host "  .\build.ps1 -SkipBackend  # Frontend only" -ForegroundColor White
Write-Host "  .\build.ps1 -Clean        # Clean all artifacts" -ForegroundColor White
