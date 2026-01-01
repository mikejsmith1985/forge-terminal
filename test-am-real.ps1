# Test AM Logging with Real LLM Conversation
$baseUrl = "http://localhost:8333"

# 1. Create a new tab with AM enabled
Write-Host "1. Creating tab with AM enabled..."
$createTabResponse = Invoke-RestMethod -Uri "$baseUrl/api/terminal/create" -Method POST -Body (@{
    shellType = "powershell"
    amEnabled = $true
} | ConvertTo-Json) -ContentType "application/json"
$tabId = $createTabResponse.sessionId
Write-Host "   Tab created: $tabId"

Start-Sleep -Seconds 2

# 2. Check initial AM status
Write-Host "`n2. Checking initial AM status..."
$status = Invoke-RestMethod -Uri "$baseUrl/api/am/tab-status/$tabId?amEnabled=true"
Write-Host "   Status: $($status.status)"
Write-Host "   Text: $($status.statusText)"

# 3. Start a real LLM conversation via Chat API
Write-Host "`n3. Starting LLM conversation..."
$chatRequest = @{
    tabId = $tabId
    provider = "github-copilot"
    model = "gpt-4o-mini"
    messages = @(
        @{
            role = "user"
            content = "Say hello and explain what 2+2 equals in one sentence."
        }
    )
} | ConvertTo-Json -Depth 10

$chatResponse = Invoke-RestMethod -Uri "$baseUrl/api/chat" -Method POST -Body $chatRequest -ContentType "application/json"
Write-Host "   Chat response received: $($chatResponse.choices[0].message.content.Substring(0, 50))..."

Start-Sleep -Seconds 3

# 4. Check AM status after conversation
Write-Host "`n4. Checking AM status after conversation..."
$statusAfter = Invoke-RestMethod -Uri "$baseUrl/api/am/tab-status/$tabId?amEnabled=true"
Write-Host "   Status: $($statusAfter.status)"
Write-Host "   Has Active Conv: $($statusAfter.hasActiveConversation)"
Write-Host "   Turns Captured: $($statusAfter.turnsCaptured)"

# 5. Check for conversation file
Write-Host "`n5. Checking for conversation file..."
$amFiles = Get-ChildItem "C:\Users\mikej\.forge\am\*$tabId*.json" -ErrorAction SilentlyContinue
if ($amFiles) {
    $latestFile = $amFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $conv = Get-Content $latestFile.FullName | ConvertFrom-Json
    Write-Host "   File: $($latestFile.Name)"
    Write-Host "   Turns: $($conv.turns.Count)"
    Write-Host "   Complete: $($conv.complete)"
    
    foreach ($turn in $conv.turns) {
        Write-Host "   - $($turn.role): $($turn.content.Substring(0, [Math]::Min(60, $turn.content.Length)))..."
    }
} else {
    Write-Host "   ⚠️ NO CONVERSATION FILE FOUND"
}

Write-Host "`n6. Result:"
if ($statusAfter.status -eq "broken") {
    Write-Host "   🔴 AM IS BROKEN - Status shows RED as expected" -ForegroundColor Red
} elseif ($statusAfter.turnsCaptured -gt 1) {
    Write-Host "   🟢 AM IS WORKING - Captured $($statusAfter.turnsCaptured) turns" -ForegroundColor Green
} else {
    Write-Host "   🟡 AM STATUS UNCLEAR - Only $($statusAfter.turnsCaptured) turn(s)" -ForegroundColor Yellow
}
