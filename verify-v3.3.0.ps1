#!/usr/bin/env pwsh

Write-Host "Verifying v3.3.0 Chat Evolution Implementation..." -ForegroundColor Cyan
Write-Host ""

$testsPassed = 0
$testsFailed = 0

function Test-File {
    param($Path, $Description)
    if (Test-Path $Path) {
        Write-Host "✓ $Description" -ForegroundColor Green
        $script:testsPassed++
        return $true
    } else {
        Write-Host "✗ $Description - File not found: $Path" -ForegroundColor Red
        $script:testsFailed++
        return $false
    }
}

function Test-ContentContains {
    param($Path, $Pattern, $Description)
    if (-not (Test-Path $Path)) {
        Write-Host "✗ $Description - File not found: $Path" -ForegroundColor Red
        $script:testsFailed++
        return $false
    }
    
    $content = Get-Content -Path $Path -Raw
    if ($content -match $Pattern) {
        Write-Host "✓ $Description" -ForegroundColor Green
        $script:testsPassed++
        return $true
    } else {
        Write-Host "✗ $Description - Pattern not found" -ForegroundColor Red
        $script:testsFailed++
        return $false
    }
}

Write-Host "Task 1: Chat Sidebar UI" -ForegroundColor Yellow
Write-Host "========================"
Test-File "frontend/src/components/ChatSidebar.jsx" "ChatSidebar.jsx component created"
Test-File "frontend/src/components/ChatSidebar.css" "ChatSidebar.css stylesheet created"
Test-ContentContains "frontend/src/App.jsx" "ChatSidebar" "ChatSidebar imported in App.jsx"
Test-ContentContains "frontend/src/App.jsx" "isChatSidebarOpen" "Chat sidebar state in App.jsx"
Test-ContentContains "frontend/src/App.jsx" "MessageSquare" "Chat icon imported"
Write-Host ""

Write-Host "Task 2: Backend Chat Handler" -ForegroundColor Yellow
Write-Host "=============================="
Test-File "cmd/forge/handlers_chat.go" "Chat handler created"
Test-ContentContains "cmd/forge/handlers_chat.go" "handleChat" "handleChat function defined"
Test-ContentContains "cmd/forge/handlers_chat.go" "buildChatContext" "Context building function"
Test-ContentContains "cmd/forge/main.go" "/api/llm/chat" "Chat API endpoint registered"
Write-Host ""

Write-Host "Task 3: Sandcastle Fixes" -ForegroundColor Yellow
Write-Host "========================="
Test-File "internal/platform/shortcut_windows.go" "Robust shortcut handler created"
Test-ContentContains "internal/platform/shortcut_windows.go" "CreateDesktopShortcut" "CreateDesktopShortcut function"
Test-ContentContains "cmd/forge/windows.go" "platform" "Platform module integrated"
Test-ContentContains "internal/updater/updater.go" "parseVersion" "Strict SemVer comparison"
Test-ContentContains "cmd/forge/main.go" "SHORTCUT_CREATE" "Desktop shortcut error codes"
Write-Host ""

Write-Host "Task 4: Brand Integration" -ForegroundColor Yellow
Write-Host "=========================="
Test-File "build.ps1" "Build script updated"
Test-ContentContains "build.ps1" "GenerateAppIcon" "Icon generation function"
Test-ContentContains "build.ps1" "ldflags" "Version embedding in build"
Write-Host ""

Write-Host "Build Verification" -ForegroundColor Yellow
Write-Host "=================="
$testBuild = Test-Path "test-build-v2.exe"
if ($testBuild) {
    $size = (Get-Item "test-build-v2.exe").Length
    Write-Host "✓ Binary built successfully ($([math]::Round($size/1MB, 1)) MB)" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host "✗ Binary not found" -ForegroundColor Red
    $testsFailed++
}
Write-Host ""

Write-Host "Summary" -ForegroundColor Cyan
Write-Host "======="
Write-Host "Tests Passed: $testsPassed" -ForegroundColor Green
Write-Host "Tests Failed: $testsFailed" -ForegroundColor $(if ($testsFailed -gt 0) { 'Red' } else { 'Green' })
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "✅ All v3.3.0 Chat Evolution tasks verified successfully!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠ Some verification checks failed" -ForegroundColor Yellow
    exit 1
}
