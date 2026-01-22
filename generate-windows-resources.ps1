# Script to generate Windows resource file (.syso) for version info and manifest embedding
# This helps avoid false positives from antivirus software

Write-Host "🔧 Generating Windows resource file..." -ForegroundColor Cyan

# Check if goversioninfo is installed
$goversioninfo = Get-Command goversioninfo -ErrorAction SilentlyContinue

if (-not $goversioninfo) {
    Write-Host "📦 Installing goversioninfo..." -ForegroundColor Yellow
    go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest
    
    # Add GOPATH/bin to PATH if not already there
    $gopath = go env GOPATH
    $gopathBin = Join-Path $gopath "bin"
    if ($env:PATH -notlike "*$gopathBin*") {
        $env:PATH = "$gopathBin;$env:PATH"
        Write-Host "✅ Added $gopathBin to PATH" -ForegroundColor Green
    }
}

# Navigate to cmd/forge directory
Push-Location cmd/forge

try {
    # Generate the .syso file
    Write-Host "📝 Processing versioninfo.json..." -ForegroundColor Yellow
    & goversioninfo -64 -o resource_windows_amd64.syso
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully generated resource_windows_amd64.syso" -ForegroundColor Green
        Write-Host ""
        Write-Host "This file embeds:" -ForegroundColor Cyan
        Write-Host "  • Version information" -ForegroundColor White
        Write-Host "  • Application manifest" -ForegroundColor White
        Write-Host "  • Company and product metadata" -ForegroundColor White
        Write-Host ""
        Write-Host "This significantly reduces false positives from antivirus software." -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to generate resource file" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}
