#!/usr/bin/env pwsh
# Manual Test Script: Persistent Instruction Injection
# Following copilot-instructions.md Phase 4: Deterministic Verification

Write-Host "`n════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MANUAL TEST: Persistent Instruction Injection" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "Prerequisites:" -ForegroundColor Yellow
Write-Host "  1. Dev server running on http://localhost:9999"
Write-Host "  2. Open Forge Terminal in browser"
Write-Host "  3. Open Browser Console (F12)`n"

# Step 1: Configure via API
Write-Host "[Step 1] Configuring persistent instruction via API..." -ForegroundColor Green
$config = @{
    enabled = $true
    template = "TEST_INJECTION_PROOF_XYZ123"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://localhost:9999/api/persistent-instruction" `
        -Method POST `
        -Body $config `
        -ContentType "application/json" `
        -UseBasicParsing
    
    Write-Host "  ✓ API Response: $($response.Content)" -ForegroundColor Green
    
    # Verify
    $verify = (Invoke-WebRequest -Uri "http://localhost:9999/api/persistent-instruction" `
        -Method GET `
        -UseBasicParsing).Content | ConvertFrom-Json
    
    if ($verify.enabled -and $verify.template -eq "TEST_INJECTION_PROOF_XYZ123") {
        Write-Host "  ✓ Verification: Config saved correctly" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Verification FAILED" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ✗ API request failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n[Step 2] Manual WebSocket Configuration Required" -ForegroundColor Yellow
Write-Host @"
Open Browser Console (F12) in Forge Terminal and paste this code:

// Get the first terminal's WebSocket
const terminalRefs = Object.values(window.terminalRefs || {});
if (terminalRefs.length === 0) {
  console.error('No terminal refs found. Try opening a new tab first.');
} else {
  const ref = terminalRefs[0];
  const ws = ref.wsRef.current;
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not open');
  } else {
    // Send persistent instruction config
    ws.send(JSON.stringify({
      type: 'PROMPT_INJECTION_CONFIG',
      enabled: true,
      instruction: 'TEST_INJECTION_PROOF_XYZ123'
    }));
    console.log('✓ Sent WebSocket config');
  }
}

"@ -ForegroundColor Cyan

Write-Host "Press Enter after running the browser console code..." -ForegroundColor Yellow
Read-Host

Write-Host "`n[Step 3] Test Command Execution" -ForegroundColor Green
Write-Host @"
Now in the Forge Terminal, type this command and press Enter:

    echo test

Expected Result:
  - The backend should detect this is NOT an LLM command
  - NO injection should happen
  - You should see: test

"@ -ForegroundColor White

Write-Host "Did you see 'test' without any injection? (y/n): " -ForegroundColor Yellow -NoNewline
$result1 = Read-Host

if ($result1 -ne 'y') {
    Write-Host "  ✗ Test FAILED: Regular command was modified" -ForegroundColor Red
    exit 1
}

Write-Host "`n[Step 4] Test LLM Command Injection" -ForegroundColor Green
Write-Host @"
Now in the Forge Terminal, type this command and press Enter:

    copilot what is 2+2

Expected Result:
  - The backend should detect this IS an LLM command
  - Injection SHOULD happen
  - GitHub Copilot should receive: "what is 2+2 TEST_INJECTION_PROOF_XYZ123"
  - Copilot might respond with something about "TEST_INJECTION_PROOF_XYZ123"

"@ -ForegroundColor White

Write-Host "Check the dev server terminal output for this log:" -ForegroundColor Yellow
Write-Host "  [ContextManager] Injecting persistent instruction for session..." -ForegroundColor Cyan

Write-Host "`nDid you see the injection log in the backend? (y/n): " -ForegroundColor Yellow -NoNewline
$result2 = Read-Host

if ($result2 -ne 'y') {
    Write-Host "  ✗ Test FAILED: No injection log found" -ForegroundColor Red
    Write-Host "`nDEBUGGING TIPS:" -ForegroundColor Yellow
    Write-Host "  1. Check if WebSocket config was sent (browser console should show 'Sent WebSocket config')"
    Write-Host "  2. Look for backend log: [ContextManager] Context configured"
    Write-Host "  3. Verify command started with 'copilot'"
    Write-Host "  4. Check internal/terminal/handler.go line 1025 for log statement"
    exit 1
}

Write-Host "`nDid GitHub Copilot's response mention the test string? (y/n): " -ForegroundColor Yellow -NoNewline
$result3 = Read-Host

if ($result3 -eq 'y') {
    Write-Host "`n════════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✓ ALL TESTS PASSED - INJECTION IS WORKING!" -ForegroundColor Green
    Write-Host "════════════════════════════════════════════════════════════════`n" -ForegroundColor Green
    
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "  ✓ API configuration works"
    Write-Host "  ✓ WebSocket communication works"
    Write-Host "  ✓ Regular commands NOT modified"
    Write-Host "  ✓ LLM commands ARE modified"
    Write-Host "  ✓ Backend injection log appears"
    Write-Host "  ✓ LLM receives injected context`n"
    
    exit 0
} else {
    Write-Host "`n════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "  ⚠ PARTIAL SUCCESS - Backend injects but LLM didn't respond" -ForegroundColor Yellow
    Write-Host "════════════════════════════════════════════════════════════════`n" -ForegroundColor Yellow
    
    Write-Host "This could mean:" -ForegroundColor White
    Write-Host "  1. GitHub Copilot CLI ignored the extra context (not unusual)"
    Write-Host "  2. The injection happened but Copilot didn't mention it in response"
    Write-Host "  3. You don't have GitHub Copilot CLI installed`n"
    
    Write-Host "The critical test is: DID YOU SEE THE BACKEND LOG?" -ForegroundColor Yellow
    Write-Host "If yes, then the injection mechanism is working correctly.`n"
    
    exit 0
}
