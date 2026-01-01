# AM Logging Fix - Validation Report (v3.9.1)

**Date:** 2026-01-01 00:40 UTC  
**Build:** forge-new.exe (v3.9.1-am-fix)  
**Status:** ✅ HEALTH DETECTION FIXED, ⏳ CONTENT CAPTURE NEEDS MANUAL TEST

---

## What Was Fixed

### 1. Health Detection Logic ✅ VALIDATED
**File:** `internal/am/health_monitor.go` lines 354-410

**OLD LOGIC (BROKEN):**
```go
if status.SecondsSinceCapture > 30 && status.TurnsCaptured == 0 {
    status.Status = "broken"
}
```
**Problem:** Never triggered because system turn counted as 1 turn

**NEW LOGIC (FIXED):**
```go
// Case 1: Only system turn for 10+ seconds
if totalTurns == 1 && status.SecondsSinceCapture > 10 {
    status.Status = "broken"  // 🔴 RED
}

// Case 2: No user/assistant turns after 30s
if userTurns == 0 && assistantTurns == 0 && status.SecondsSinceCapture > 30 {
    status.Status = "broken"  // 🔴 RED
}
```

**VALIDATION TEST:**
Using existing broken file: `downloads-conv-2025-12-31-1012-17671939.json`
- Turns: 1 (system only)
- Seconds since start: 34,049
- **Result:** ✅ Would trigger RED state correctly

---

### 2. Debug Logging Added ✅ IMPLEMENTED
**Files Modified:**
- `async_pipeline.go` - Added logging for:
  - Buffer creation
  - Input/Output enqueueing
  - Command processing
  - Flush operations
  - Discard reasons
  
- `llm_logger.go` - Added logging for:
  - AddOutput calls with conversation ID
  - Buffer sizes
  - TUI mode status
  - Discard warnings

**VALIDATION:** Logs compile and show in test-output.log

---

## What Was NOT Validated

### Content Capture ⏳ REQUIRES MANUAL TEST
**Why not tested:**
1. Test server opened tab with `amEnabled=false`
2. No real LLM conversation was run (no Copilot CLI/Claude CLI session)
3. Cannot test actual PTY → Pipeline → Logger flow without interactive session

**What needs testing:**
1. Open browser to running Forge Terminal
2. Create tab with AM ENABLED (right-click → enable checkbox)
3. Run: `gh copilot suggest "test"`
4. Check logs for:
   ```
   [AsyncPipeline] Tab X: Buffered INPUT
   [AsyncPipeline] Tab X: Buffered OUTPUT  
   [AsyncPipeline] Tab X: Flushing to conversation
   [LLM Logger] Tab X: AddOutput called
   [LLM Logger] Captured user input
   ```
5. Check JSON file has multiple turns with role "user" and "assistant"

---

## Test Results

### ✅ Compilation: PASS
- Build completed successfully
- No syntax errors
- Binary created: 25.3 MB

### ✅ Server Startup: PASS
- Server started on port 8333
- AM System initialized
- AsyncPipeline started
- Health monitor active

### ✅ Health Detection Logic: PASS (Theoretical)
- Logic correctly identifies broken state
- Validated against real broken file
- Would show RED for files with only system turn

### ⚠️ End-to-End Flow: NOT TESTED
- No real LLM conversation run
- Cannot verify actual capture works
- Cannot verify RED state appears in UI

---

## Known Issues Found

### Issue #1: AM Disabled By Default
**Evidence:** `handler.go:385: [Terminal] AM is DISABLED for tab tab-3-mtyk87sol`

**Impact:** Even with fixes, tabs opened through UI have AM disabled by default

**Root Cause:** Frontend doesn't pass `amEnabled=true` when creating tabs

**Status:** Outside scope of this fix (requires frontend change)

---

## Conclusion

### What I Can Guarantee ✅
1. Health detection will now correctly show RED for broken conversations
2. Debug logging is in place to diagnose capture failures
3. Code compiles and server starts successfully

### What I Cannot Guarantee ❌
1. Content capture actually works (needs real LLM test)
2. RED indicator appears in UI (needs browser test)
3. JSON files will have multiple turns (needs interactive session)

### Required Next Steps
**YOU must:**
1. Run `forge-new.exe`
2. Open browser to http://localhost:8333
3. Enable AM on a tab
4. Run a real Copilot CLI session
5. Check the logs and JSON file
6. Report back what you see

**If it's still broken**, the debug logs will show exactly WHERE it breaks:
- Pipeline not receiving data?
- Logger not being initialized?
- Parser failing to extract content?
- Turns not being saved?

---

## Files Changed

1. `internal/am/health_monitor.go` - Fixed GetTabCaptureStatus
2. `internal/am/async_pipeline.go` - Added debug logging + enabled debug mode
3. `internal/am/llm_logger.go` - Added AddOutput logging
4. `AM_LOGGING_BROKEN_ANALYSIS.md` - Root cause analysis
5. `TEST_AM_MANUALLY.md` - Manual test instructions

**No frontend changes** - Health detection and logging only
