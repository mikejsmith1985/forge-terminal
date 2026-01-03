# Forge Terminal - PROPER Dev Workflow
# Rebuilds frontend AND Go binary, kills old processes, starts fresh on DEV PORTS
# NO CACHE ISSUES!

param(
    [switch]$NoBuild = $false,
    [int]$Port = 9999  # Dev port - different from production ports
)

$ErrorActionPreference = "Stop"

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "     Forge Terminal - CACHE-FREE Development Mode             " -ForegroundColor Cyan
Write-Host "     Port: $Port (isolated from production)                   " -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill existing dev processes on dev port
Write-Host "[1/6] Stopping existing dev instances on port $Port..." -ForegroundColor Yellow
$devProcess = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | 
              Select-Object -ExpandProperty OwningProcess | 
              Get-Process -ErrorAction SilentlyContinue
if ($devProcess) {
    Write-Host "  Killing PID: $($devProcess.Id)" -ForegroundColor Gray
    Stop-Process -Id $devProcess.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Also kill any forge-dev.exe processes
$existingProcesses = Get-Process -Name "forge-dev" -ErrorAction SilentlyContinue
if ($existingProcesses) {
    foreach ($proc in $existingProcesses) {
        Write-Host "  Killing forge-dev PID: $($proc.Id)" -ForegroundColor Gray
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

if (-not $NoBuild) {
    # Step 2: Clean old builds
    Write-Host "[2/6] Cleaning old build artifacts..." -ForegroundColor Yellow
    if (Test-Path "cmd/forge/web/assets") {
        Remove-Item "cmd/forge/web/assets/*" -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path "forge-dev.exe") {
        Remove-Item "forge-dev.exe" -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  ✓ Old artifacts cleaned" -ForegroundColor Green
    Write-Host ""
    
    # Step 3: Rebuild Frontend with cache busting
    Write-Host "[3/6] Rebuilding frontend (fresh build)..." -ForegroundColor Cyan
    Push-Location frontend
    
    # Clear Vite cache
    if (Test-Path "node_modules/.vite") {
        Remove-Item "node_modules/.vite" -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "[X] Frontend build failed!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
    Write-Host "  ✓ Frontend built to cmd/forge/web/" -ForegroundColor Green
    Write-Host ""

    # Step 4: Rebuild Go Binary with ldflags for dev mode
    Write-Host "[4/6] Rebuilding Go binary (dev mode)..." -ForegroundColor Cyan
    $buildTime = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"
    go build -ldflags "-X main.buildTime=$buildTime -X main.devMode=true" -o forge-dev.exe ./cmd/forge
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Go build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ forge-dev.exe built (timestamp: $buildTime)" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[2-4/6] Skipping build (-NoBuild specified)" -ForegroundColor Gray
    Write-Host ""
}

# Step 5: Set environment for dev mode
Write-Host "[5/6] Setting dev environment..." -ForegroundColor Cyan
$env:FORGE_DEV_MODE = "true"
$env:FORGE_PORT = $Port
Write-Host "  FORGE_DEV_MODE=true" -ForegroundColor Gray
Write-Host "  FORGE_PORT=$Port" -ForegroundColor Gray
Write-Host ""

# Step 6: Run
Write-Host "[6/6] Starting Forge (Dev Build)..." -ForegroundColor Green
Write-Host ""
Write-Host "  ╔════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║  DEV URL: http://localhost:$Port                    ║" -ForegroundColor Magenta
Write-Host "  ║  (Production runs on 3005/8333 - no conflicts!)   ║" -ForegroundColor Magenta
Write-Host "  ╚════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""
Write-Host "TIPS:" -ForegroundColor Yellow
Write-Host "  • F12 → Network → ☑ Disable cache (keep open!)" -ForegroundColor Gray
Write-Host "  • Ctrl+/ to open Power Features" -ForegroundColor Gray
Write-Host "  • Changes require re-running this script" -ForegroundColor Gray
Write-Host ""

# Run on dev port
.\forge-dev.exe --port $Port
