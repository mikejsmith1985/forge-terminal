# Forge Terminal - PROPER Dev Workflow
# Rebuilds frontend AND Go binary, kills old processes, starts fresh
# NO CACHE ISSUES!

param(
    [switch]$NoBuild = $false
)

$ErrorActionPreference = "Stop"

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "     Forge Terminal - CACHE-FREE Development Mode             " -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill existing processes
Write-Host "[1/5] Stopping existing Forge instances..." -ForegroundColor Yellow
$existingProcesses = Get-Process -Name "forge-dev" -ErrorAction SilentlyContinue
if ($existingProcesses) {
    foreach ($proc in $existingProcesses) {
        Write-Host "  Killing PID: $($proc.Id)" -ForegroundColor Gray
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

if (-not $NoBuild) {
    # Step 2: Rebuild Frontend
    Write-Host "[2/5] Rebuilding frontend (this embeds your CSS/JS changes)..." -ForegroundColor Cyan
    Push-Location frontend
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "[X] Frontend build failed!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
    Write-Host "  ✓ Frontend built to cmd/forge/web/" -ForegroundColor Green
    Write-Host ""

    # Step 3: Rebuild Go Binary
    Write-Host "[3/5] Rebuilding Go binary (embeds frontend)..." -ForegroundColor Cyan
    go build -o forge-dev.exe ./cmd/forge
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Go build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ forge-dev.exe built" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[2-3/5] Skipping build (--NoBuild specified)" -ForegroundColor Gray
    Write-Host ""
}

# Step 4: Clear browser cache hint
Write-Host "[4/5] IMPORTANT: Clear your browser cache!" -ForegroundColor Magenta
Write-Host "  Method 1: Open DevTools (F12) → Network tab → Check 'Disable cache'" -ForegroundColor Gray
Write-Host "  Method 2: Ctrl+Shift+Delete → Clear cached images/files" -ForegroundColor Gray
Write-Host "  Method 3: Hard refresh with Ctrl+Shift+R" -ForegroundColor Gray
Write-Host ""

# Step 5: Run
Write-Host "[5/5] Starting Forge (Dev Build)..." -ForegroundColor Green
Write-Host "  URL: http://localhost:8333" -ForegroundColor White
Write-Host "  Logs: forge-output.log, forge-error.log" -ForegroundColor Gray
Write-Host ""
Write-Host "TIP: Press Ctrl+/ in browser to open Power Features" -ForegroundColor Magenta
Write-Host "TIP: Keep DevTools Network tab open with 'Disable cache' checked!" -ForegroundColor Magenta
Write-Host ""

# Run
.\forge-dev.exe
