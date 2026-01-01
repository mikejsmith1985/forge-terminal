# Manual AM Logging Test - v3.9.1 Fix Validation

## Setup
1. Server is running on http://localhost:8333
2. Binary: forge-new.exe (built 2025-12-31 19:29:11)
3. Debug logging: ENABLED

## Test Steps

### 1. Open Browser and Enable AM
- Navigate to http://localhost:8333
- Right-click on the tab
- Enable "AM Logging" checkbox
- **Expected:** Tab should show AM indicator in dev mode

### 2. Start a Test Command (Not Copilot CLI)
Since we can't actually run Copilot CLI in test, let's simulate:
- Type: `echo "test input"`
- Press Enter
- **Expected:** Should see in logs:
  - `[AsyncPipeline] Buffered INPUT`
  - `[AsyncPipeline] Flushing to conversation`

### 3. Check Debug Logs
Look at test-output.log for:
```
[AsyncPipeline] Tab X: Buffered INPUT
[AsyncPipeline] Tab X: Buffered OUTPUT
[AsyncPipeline] Tab X: Flushing to conversation
[LLM Logger] Tab X: AddOutput called
```

### 4. Check AM Status API
```powershell
Invoke-RestMethod -Uri "http://localhost:8333/api/am/tab-status/tab-ID?amEnabled=true"
```

**Expected Response:**
- `status: "broken"` if not capturing (RED state)
- `status: "active"` if capturing (GREEN state)

### 5. Check JSON File
```powershell
Get-ChildItem C:\Users\mikej\.forge\am\*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { Get-Content $_.FullName | ConvertFrom-Json }
```

**Expected:**
- Multiple turns with role "user" and "assistant"
- NOT just 1 turn with role "system"

## Current Status
**BLOCKED:** Can't actually test without running a real LLM CLI session.

The real test is:
1. You manually open http://localhost:8333
2. Enable AM on a tab
3. Run `gh copilot suggest "test"` or similar
4. Check the logs and JSON file

## What The Logs Will Tell Us

If you see this pattern, AM is BROKEN:
```
[Terminal] AM is ENABLED for tab X
[AsyncPipeline] Created new buffer for tab X
[AsyncPipeline] Tab X: Buffered INPUT (50 bytes)
[AsyncPipeline] Tab X: Buffered OUTPUT (200 bytes)
[AsyncPipeline] Tab X: No active conversation, discarding
```

If you see this pattern, AM is WORKING:
```
[Terminal] AM is ENABLED for tab X
[LLM Logger] Started conversation conv-XXX
[AsyncPipeline] Tab X: Flushing to conversation conv-XXX
[LLM Logger] Tab X: AddOutput called for conv-XXX
[LLM Logger] Captured user input for conv-XXX
```
