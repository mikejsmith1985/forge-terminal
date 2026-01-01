# AM Logging System - Broken Analysis (v3.9.1)

**Date:** 2026-01-01  
**Status:** CRITICAL - System Not Working As Designed  
**Reporter:** User

## THE PROBLEM

The AM logging system **detects when LLM conversations start** but **DOES NOT CAPTURE ANY ACTUAL CONVERSATION CONTENT** (user input or assistant output).

### Evidence from Production Logs

```powershell
# Recent AM logs from C:\Users\mikej\.forge\am\
downloads-conv-2025-12-31-1012-17671939.json:  1 turn, Complete: False
downloads-conv-2025-12-31-1010-17671938.json:  1 turn, Complete: False  
downloads-conv-2025-12-31-0831-17671878.json: 10 turns, Complete: True  ✓ (Working)
downloads-conv-2025-12-31-0627-17671804.json:  1 turn, Complete: True
downloads-conv-2025-12-31-0625-17671803.json:  1 turn, Complete: False
downloads-conv-2025-12-31-0601-17671788.json:  1 turn, Complete: True
```

**Pattern:** Most conversations have only **1 turn** - the system "process_detection" event. No user input, no assistant output.

### What The Logs Actually Contain

```json
{
  "conversationId": "conv-1767193968515257100",
  "provider": "github-copilot",
  "startTime": "2025-12-31T10:12:48",
  "complete": false,
  "turns": [
    {
      "role": "system",
      "content": "LLM process started: github-copilot (PID 0)",
      "captureMethod": "process_detection",
      "timestamp": "2025-12-31T10:12:48"
    }
  ]
}
```

**That's it. No user input. No assistant output. Nothing.**

---

## THE ROOT CAUSE

### 1. The "Green Always" Bug in AM Monitor

The AM Monitor (frontend component) shows:
- **Green:** "5 logs" (because it counts files)
- **Status:** Always "active"
- **Reality:** Most logs contain ZERO conversation content

**File:** `frontend/src/components/AMMonitor.jsx`

The health check at `health_monitor.go:320-384` (`GetTabCaptureStatus`) has flawed logic:

```go
// Line 373: "Broken" detection REQUIRES BOTH conditions
if status.SecondsSinceCapture > 30 && status.TurnsCaptured == 0 {
    status.Status = "broken"
}
```

**BUG:** It only detects "broken" if `TurnsCaptured == 0` AND more than 30 seconds have passed. But conversations with 1 turn (the system turn) have `TurnsCaptured = 1`, so they're considered "healthy" even though they're not capturing anything.

**Expected Behavior (v3.9.1 Release Notes):**
- 🟢 Green: "AM Logging is Active in this tab" - **Actually capturing data**
- 🟡 Yellow: "AM Logging is Disabled for this tab" - **User toggled off**
- 🔴 Red: "AM Logging is enabled but not capturing data" - **Broken pipeline**

**Actual Behavior:**
- 🟢 Green: Always shows green if `amEnabled=true`, even when not capturing
- 🟡 Yellow: Only when `amEnabled=false`
- 🔴 Red: NEVER shows - the detection logic is too narrow

---

### 2. The Capture Pipeline IS Running But Not Receiving Data

The async pipeline in `async_pipeline.go` is initialized and running:
- `EnqueueInput()` - Ready to receive keyboard input
- `EnqueueOutput()` - Ready to receive LLM responses
- `EnqueueCommand()` - Ready to receive commands

**File:** `internal/terminal/handler.go:571-574, 829-832, 840-842`

The PTY handler checks `amEnabled` and calls the pipeline:

```go
if amSystem != nil && amEnabled {
    amSystem.EnqueueOutput(tabID, buf[:n])  // Line 573
    amSystem.EnqueueInput(tabID, data)      // Line 831
    amSystem.EnqueueCommand(tabID, commandLine) // Line 841
}
```

**Questions to investigate:**
1. Is `amEnabled` actually `true` for tabs where conversations are started?
2. Is the pipeline worker thread actually processing messages?
3. Is the LLM logger receiving the data from the pipeline?
4. Are parsers failing to extract content from PTY data?

---

### 3. Process Detection Works, But Content Capture Doesn't

The system successfully detects:
- **Layer 1:** PTY I/O is captured (lines 571-574, 829-832)
- **Layer 2:** LLM commands are detected (conversation starts)
- **Layer 3:** Process PID is recorded (though usually 0)

But it FAILS at:
- **Parsing user input from PTY data**
- **Parsing assistant output from PTY data**
- **Recording actual conversation turns**

---

## THE DELIVERABLE GAP

### What Was Promised in v3.9.1

From `RELEASE_NOTES_v3.9.1.md`:

> ### AM Monitor Health Tracking
> - **3-State Indicator**:
>   - 🟢 Green: "AM Logging is Active in this tab"
>   - 🟡 Yellow: "AM Logging is Disabled for this tab"
>   - 🔴 Red: "AM Logging is enabled but not capturing data"
> - **Real-time Health Detection**: Monitors pipeline activity and file writes

### What Was Actually Delivered

- ❌ 3-state indicator shows GREEN when not capturing
- ❌ "Real-time health detection" doesn't detect broken capture
- ❌ Conversations are started but content is not captured
- ✅ File creation works (empty files are written)
- ✅ Process detection works (knows when Copilot starts)

---

## REQUIRED FIXES

### Priority 1: Fix Health Detection (Makes Red State Actually Work)

**File:** `internal/am/health_monitor.go:320-384`

Change the logic to detect "broken" when:
1. `amEnabled = true`
2. Active conversation exists
3. **Either:**
   - No turns captured after 30s, OR
   - Only 1 turn (system turn) and more than 10s have passed

```go
// PROPOSED FIX (lines 370-382)
totalTurns := len(conv.Turns)
userTurns := 0
for _, turn := range conv.Turns {
    if turn.Role == "user" || turn.Role == "assistant" {
        userTurns++
    }
}

// Active conversation but no actual content captured
if status.HasActiveConv {
    // Been active for 10+ seconds but only has the system turn
    if totalTurns == 1 && status.SecondsSinceCapture > 10 {
        status.Status = "broken"
        status.StatusText = "AM Logging is enabled but not capturing data"
        status.IsCapturing = false
        return status
    }
    
    // Has turns but no user/assistant turns
    if userTurns == 0 && status.SecondsSinceCapture > 30 {
        status.Status = "broken"
        status.StatusText = "AM Logging is enabled but not capturing data"
        status.IsCapturing = false
        return status
    }
}
```

### Priority 2: Fix Actual Content Capture (Makes Logging Actually Work)

**Investigation needed:**
1. Add debug logging to `async_pipeline.go:worker()` to see if messages are being processed
2. Add debug logging to LLM logger to see if `ProcessInput/ProcessOutput` are being called
3. Check if parsers in `parser_core.go` are failing to extract content
4. Verify `amEnabled` is actually `true` when conversations start

**Likely culprits:**
- Parser failures (can't extract user input/output from Copilot CLI's TUI)
- TUI capture mode not working for Copilot CLI sessions
- LLM logger not being initialized before PTY data arrives

### Priority 3: Add Pipeline Health Metrics to AM Monitor

**File:** `frontend/src/components/AMMonitor.jsx`

Add display of pipeline stats:
- Messages processed
- Messages dropped
- Last successful capture time

This would make it obvious when capture is broken.

---

## USER IMPACT

"The AM logging is useless - it tells me there are 5 logs and it's green all the time."

**Translation:** 
- System creates 5 empty log files
- Shows green indicator (healthy)
- But logs contain no actual conversation data
- User can't recover conversations because there's nothing to recover

**This violates the core promise of the AM system:** Session recovery and disaster recovery for legal compliance.

---

## TESTING CHECKLIST

To verify fixes:

1. ✅ Enable AM logging on a tab
2. ✅ Start a Copilot CLI session (`gh copilot suggest`)
3. ✅ Type a prompt and get a response
4. ⏱️ Wait 15 seconds
5. 🔴 **Expected:** AM Monitor should show RED if no content captured
6. 📝 Check the JSON file in `~/.forge/am/`
7. ✅ **Expected:** File should have `turns` with role "user" and "assistant"

**Current behavior:** File has 1 turn (system), monitor shows GREEN.

---

## CONCLUSION

The v3.9.1 "enhanced AM Log feature" **does not work**. The health monitoring promised in the release notes does not detect when logging is broken, and the actual content capture is failing in most cases.

The only thing that works is:
- Process detection (knows when CLI starts)
- File creation (empty files are written)
- Status API (returns wrong status)

**Priority:** CRITICAL - This breaks the core promise of AM for legal compliance and disaster recovery.
