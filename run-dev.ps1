# Forge Terminal - Development Mode (Windows)
# Run local build with auto-rebuild

param(
    [switch]$Build = $true,
    [switch]$Watch = $false
)

$ErrorActionPreference = "Stop"

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "     Forge Terminal - Development Mode                        " -ForegroundColor Cyan
Write-Host "     Running LOCAL build from source                          " -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

# Kill existing forge processes on port 8333
Write-Host "[*] Checking for existing Forge instances..." -ForegroundColor Yellow
$existingProcess = Get-NetTCPConnection -LocalPort 8333 -ErrorAction SilentlyContinue | 
                   Select-Object -ExpandProperty OwningProcess | 
                   Get-Process -ErrorAction SilentlyContinue

if ($existingProcess) {
    Write-Host "[!] Stopping existing Forge instance (PID: $($existingProcess.Id))..." -ForegroundColor Yellow
    Stop-Process -Id $existingProcess.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Build if requested
if ($Build) {
    Write-Host "[*] Building Forge from source..." -ForegroundColor Cyan
    go build -o forge-dev.exe ./cmd/forge
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Build failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "[+] Build successful!" -ForegroundColor Green
    Write-Host ""
}

# Run the dev build
Write-Host "[*] Starting Forge (Dev Build)..." -ForegroundColor Green
Write-Host "   URL: http://localhost:8333" -ForegroundColor Gray
Write-Host "   Logs: forge-output.log, forge-error.log" -ForegroundColor Gray
Write-Host ""
Write-Host "TIP: Use 'copilot --continue' to resume this session after refreshing!" -ForegroundColor Magenta
Write-Host ""

# Run forge-dev.exe
.\forge-dev.exe
