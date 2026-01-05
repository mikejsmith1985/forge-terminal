# Forge Process Safeguard Module
# Prevents accidental killing of the active Forge session
# Version: v3.11.6
# CRITICAL: This prevents $100M+ session kill disasters

function Test-IsSafeToKillProcess {
    param(
        [Parameter(Mandatory=$true)]
        [int]$TargetPID
    )
    
    $forgePID = $env:FORGE_INSTANCE_PID
    $forgePort = $env:FORGE_INSTANCE_PORT
    
    Write-Host "`n🔍 PROCESS KILL SAFETY CHECK" -ForegroundColor Yellow
    Write-Host "================================" -ForegroundColor Yellow
    
    # Layer 1: Environment Variable Check
    Write-Host "`n[Layer 1] Environment Variables:" -ForegroundColor Cyan
    if ($forgePID) {
        Write-Host "  ✓ FORGE_INSTANCE_PID = $forgePID" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ FORGE_INSTANCE_PID not set" -ForegroundColor Yellow
    }
    
    if ($forgePort) {
        Write-Host "  ✓ FORGE_INSTANCE_PORT = $forgePort" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ FORGE_INSTANCE_PORT not set" -ForegroundColor Yellow
    }
    
    # Layer 2: Port Ownership Check
    Write-Host "`n[Layer 2] Port Ownership:" -ForegroundColor Cyan
    $portOwners = @()
    
    # Check common Forge ports
    $commonPorts = @(3005, 9999)
    if ($forgePort) {
        $commonPorts += [int]$forgePort
    }
    
    foreach ($port in ($commonPorts | Select-Object -Unique)) {
        try {
            $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($connection) {
                $portOwners += $connection.OwningProcess
                Write-Host "  ✓ Port $port owned by PID: $($connection.OwningProcess)" -ForegroundColor Green
            }
        } catch {
            # Port not in use
        }
    }
    
    # Layer 3: Parent Process Chain Walk
    Write-Host "`n[Layer 3] Parent Process Chain:" -ForegroundColor Cyan
    $currentPID = $PID
    $parentChain = @($currentPID)
    
    $proc = Get-Process -Id $currentPID -ErrorAction SilentlyContinue
    Write-Host "  Current PowerShell PID: $currentPID" -ForegroundColor White
    
    while ($proc) {
        try {
            $wmiProc = Get-WmiObject Win32_Process -Filter "ProcessId=$($proc.Id)" -ErrorAction Stop
            if ($wmiProc.ParentProcessId) {
                $parentChain += $wmiProc.ParentProcessId
                $parentProc = Get-Process -Id $wmiProc.ParentProcessId -ErrorAction SilentlyContinue
                if ($parentProc) {
                    Write-Host "    ↑ Parent: $($parentProc.Name) (PID: $($parentProc.Id))" -ForegroundColor Gray
                }
                $proc = $parentProc
            } else {
                break
            }
        } catch {
            break
        }
    }
    
    # Layer 4: Process Name Check
    Write-Host "`n[Layer 4] Target Process Analysis:" -ForegroundColor Cyan
    $targetProc = Get-Process -Id $TargetPID -ErrorAction SilentlyContinue
    if (-not $targetProc) {
        Write-Host "  ⚠ Target process PID $TargetPID not found (already dead?)" -ForegroundColor Yellow
        return $true  # Safe to "kill" - it's already gone
    }
    
    Write-Host "  Target: $($targetProc.Name) (PID: $TargetPID)" -ForegroundColor White
    Write-Host "  Path: $($targetProc.Path)" -ForegroundColor Gray
    
    # CRITICAL CHECKS
    $isDangerous = $false
    $reasons = @()
    
    # Check 1: Is it in parent chain?
    if ($parentChain -contains $TargetPID) {
        $isDangerous = $true
        $reasons += "🚨 TARGET IS IN YOUR PARENT PROCESS CHAIN"
    }
    
    # Check 2: Is it the env var PID?
    if ($forgePID -and ([int]$forgePID -eq $TargetPID)) {
        $isDangerous = $true
        $reasons += "🚨 TARGET IS YOUR ACTIVE FORGE SESSION (FORGE_INSTANCE_PID=$forgePID)"
    }
    
    # Check 3: Does it own a Forge port?
    if ($portOwners -contains $TargetPID) {
        $isDangerous = $true
        $reasons += "🚨 TARGET OWNS A FORGE PORT (likely active session)"
    }
    
    # Check 4: Is it a forge process?
    if ($targetProc.Name -match "forge") {
        Write-Host "`n  ⚠ WARNING: Target is a forge process" -ForegroundColor Yellow
        
        # Extra verification for forge processes
        if ($portOwners -contains $TargetPID -or ($forgePID -and [int]$forgePID -eq $TargetPID)) {
            $isDangerous = $true
        }
    }
    
    # VERDICT
    Write-Host "`n================================" -ForegroundColor Yellow
    if ($isDangerous) {
        Write-Host "❌ DANGER: KILLING THIS PROCESS WILL TERMINATE YOUR SESSION!" -ForegroundColor Red -BackgroundColor Black
        Write-Host "" -ForegroundColor Red
        foreach ($reason in $reasons) {
            Write-Host "   $reason" -ForegroundColor Red
        }
        Write-Host "" -ForegroundColor Red
        Write-Host "This has historically cost $100M+ from lost context and work." -ForegroundColor Red
        Write-Host "" -ForegroundColor Red
        return $false
    } else {
        Write-Host "✅ SAFE: Process is not in your parent chain or active Forge session" -ForegroundColor Green
        Write-Host "" -ForegroundColor Green
        return $true
    }
}

function Stop-ProcessSafe {
    param(
        [Parameter(Mandatory=$true)]
        [int]$Id,
        [switch]$Force
    )
    
    if (-not (Test-IsSafeToKillProcess -TargetPID $Id)) {
        Write-Host "`n⚠️  KILL OPERATION BLOCKED" -ForegroundColor Red
        Write-Host "If you REALLY want to kill this process and understand the consequences," -ForegroundColor Yellow
        Write-Host "type exactly:" -ForegroundColor Yellow
        Write-Host "" -ForegroundColor Yellow
        Write-Host '    "I UNDERSTAND THIS WILL KILL MY SESSION"' -ForegroundColor White -BackgroundColor DarkRed
        Write-Host "" -ForegroundColor Yellow
        
        $confirmation = Read-Host "Your response"
        
        if ($confirmation -ceq "I UNDERSTAND THIS WILL KILL MY SESSION") {
            Write-Host "`n💀 User explicitly confirmed session kill. Proceeding..." -ForegroundColor Red
            Stop-Process -Id $Id -Force:$Force
        } else {
            Write-Host "`n✋ Kill operation aborted. Your session is safe." -ForegroundColor Green
        }
    } else {
        Write-Host "`n✅ Proceeding with safe kill..." -ForegroundColor Green
        Stop-Process -Id $Id -Force:$Force
    }
}

# Export functions
Export-ModuleMember -Function Test-IsSafeToKillProcess, Stop-ProcessSafe

# Display banner when module loads
Write-Host "🛡️  Forge Process Safeguard loaded" -ForegroundColor Cyan
Write-Host "   Use Stop-ProcessSafe instead of Stop-Process for forge processes" -ForegroundColor Gray
