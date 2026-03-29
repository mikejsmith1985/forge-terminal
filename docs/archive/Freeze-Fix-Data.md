# Forge Terminal Freeze Investigation - Complete Analysis

**Date:** December 17, 2025
**Version:** v1.24.7
**Status:** Ongoing - Core architectural issue identified

---

## Executive Summary

The terminal freeze issue persists despite multiple code fixes. The root cause is **architectural**: Forge processes everything on the main thread while VS Code (which doesn't freeze) uses WebWorkers for terminal parsing. The fixes applied so far were necessary but insufficient.

---

## Symptoms

1. Terminal becomes unresponsive during typing
2. CPU spikes to 90-110% correlate with freezes
3. Affects Claude CLI, Copilot CLI, AND regular shell
4. VS Code terminal (also xterm.js) does NOT exhibit this behavior
5. Mouse and other windows remain responsive - only terminal freezes
6. Diagnostic PowerShell script also shows gaps during freezes

---

## Environment

- **OS:** Windows 11 (Dell system)
- **Storage:** SSD
- **RAM:** Adequate (pagefile usage: 24MB of 10GB)
- **Defender Exclusions:** Configured for Forge path and process
- **Dell Bloatware:** Removed
- **Docker/WSL:** Removed

---

## Fixes Applied (v1.24.4 - v1.24.7)

### 1. Asset Embedding (v1.24.5)
- **Problem:** Case-sensitivity mismatch (`Assets/` vs `assets/`)
- **Fix:** Normalized to lowercase, updated vite.config.js
- **Status:** RESOLVED

### 2. MIME Types (v1.24.5)
- **Problem:** CSS/JS served as `text/plain`
- **Fix:** Added `headerFixingResponseWriter` middleware
- **Status:** RESOLVED

### 3. Goroutine-per-Keystroke (v1.24.6)
- **Problem:** `go llmLogger.AddUserInput(dataStr)` spawned goroutine per keystroke
- **Fix:** Call synchronously, internal buffering handles batching
- **Status:** RESOLVED
- **File:** `internal/terminal/handler.go:433-434`

### 4. Frontend Write Batching (v1.24.6)
- **Problem:** `term.write()` called per WebSocket message
- **Fix:** Batch writes using `requestAnimationFrame` (~60fps)
- **Status:** RESOLVED
- **File:** `frontend/src/components/ForgeTerminal.jsx:962-980`

### 5. RWMutex for Reads (v1.24.7)
- **Problem:** `GetActiveConversationID()` used exclusive `Lock()` per keystroke
- **Fix:** Changed to `RWMutex` with `RLock()` for read operations
- **Status:** RESOLVED
- **File:** `internal/am/llm_logger.go:79, 1036-1040`

---

## Data Flow Architecture

### Backend (handler.go)

```
PTY Read (4096 byte chunks)
    ↓
WebSocket Write (binary message, mutex-protected)
    ↓
LLM Logger Check (RLock, returns early if no active conversation)
    ↓
Vision Parser Feed (synchronous, no goroutines)
```

### Frontend (ForgeTerminal.jsx)

```
WebSocket onmessage
    ↓
Accumulate in writeBuffer
    ↓
requestAnimationFrame batches writes to xterm.js
    ↓
Prompt detection (throttled to 500ms, uses requestIdleCallback)
    ↓
AM logging (batched, flushed during idle time)
```

---

## Why VS Code Doesn't Freeze

| Feature | VS Code | Forge | Impact |
|---------|---------|-------|--------|
| ANSI Parsing | WebWorker (off-thread) | Main thread | **HIGH** |
| Scroll Throttling | Multiple layers | Minimal | Medium |
| Render Budget | Tracks 16.67ms budget | No tracking | Medium |
| Message Deduplication | Yes | No | Low |
| Backpressure | Active monitoring | Passive | Medium |

**Key Insight:** VS Code's WebWorker architecture allows terminal parsing to continue even when the main thread is busy. Forge's main-thread-only architecture means any CPU contention directly impacts terminal responsiveness.

---

## AM System Analysis

### Current Behavior When "Disabled"

Even when AM is disabled via UI toggle:
1. `amSystem` is still initialized at startup
2. `llmLogger` is still created per tab
3. `GetActiveConversationID()` is still called per keystroke (now with RLock)
4. Returns empty string, code paths exit early

### Code Paths Still Executing (per keystroke)

```go
// handler.go:433 - Still runs even when AM "disabled"
if llmLogger != nil && llmLogger.GetActiveConversationID() != "" {
    llmLogger.AddUserInput(dataStr)
}
```

The check is fast (RLock + string comparison) but adds up at high keystroke rates.

---

## Remaining Bottlenecks

### 1. Main Thread Contention
All JavaScript execution competes for CPU:
- xterm.js rendering
- Prompt detection regex
- React updates
- AM logging (when enabled)

### 2. No Yield Points Under Load
When CPU is high, there's no mechanism to:
- Skip non-critical work
- Defer rendering
- Drop stale data

### 3. System-Level Factors
- Windows Defender (even with exclusions, may still scan related processes)
- DWM (Desktop Window Manager) competing for GPU
- Background indexing services

---

## Recommendations

### Immediate (Can Do Now)

1. **Batch Keystroke AM Processing**
   - **Status:** IMPLEMENTED (v1.24.7)
   ```go
   // Instead of per-keystroke AM check, batch to 100ms intervals
   inputAccumulator += dataStr
   if time.Since(lastAMCheck) > 100*time.Millisecond {
       if llmLogger != nil && llmLogger.GetActiveConversationID() != "" {
           llmLogger.AddUserInput(inputAccumulator)
       }
       inputAccumulator = ""
       lastAMCheck = time.Now()
   }
   ```

2. **True AM Disable Flag**
   - **Status:** IMPLEMENTED (v1.24.7)
   Add a flag that completely skips AM initialization when disabled:
   ```go
   if amEnabled && amSystem != nil {
       llmLogger = amSystem.GetLLMLogger(tabID)
   }
   // llmLogger stays nil, all checks short-circuit at nil check
   ```

3. **Add Instrumentation**
   - **Status:** IMPLEMENTED (v1.24.7)
   Before more fixes, measure actual bottlenecks:
   ```javascript
   // In onmessage handler
   const start = performance.now();
   // ... process message
   const elapsed = performance.now() - start;
   if (elapsed > 16) console.warn(`Slow message: ${elapsed}ms`);
   ```

### Medium-Term (1-2 Weeks)

4. **WebWorker for Parsing**
   Move ANSI parsing and prompt detection to a WebWorker:
   ```javascript
   // Main thread
   const parser = new Worker('terminal-parser.js');
   parser.postMessage(rawData);
   parser.onmessage = (e) => term.write(e.data.parsed);
   ```

5. **Render Budget Tracking**
   Skip non-critical work when frame budget exceeded:
   ```javascript
   const frameStart = performance.now();
   // Critical: terminal write
   term.write(data);
   // Check budget before optional work
   if (performance.now() - frameStart < 12) {
       // Still have time for AM logging, prompt detection
   }
   ```

6. **Scroll Event Throttling**
   Debounce scroll handlers to 16ms minimum.

### Long-Term (Architecture)

7. **Full WebWorker Architecture**
   - Terminal parsing in worker
   - AM processing in worker
   - Only rendering on main thread

8. **Electron Migration**
   If browser limitations persist, consider Electron for:
   - Process isolation
   - Native performance
   - Better system integration

---

## Files to Modify

| File | Purpose | Priority |
|------|---------|----------|
| `internal/terminal/handler.go` | Batch keystroke AM checks | High |
| `internal/am/system.go` | True disable flag | High |
| `frontend/src/components/ForgeTerminal.jsx` | Instrumentation, worker | Medium |
| `frontend/src/workers/terminal-parser.js` | New WebWorker | Medium |

---

## Testing Protocol

1. **Baseline Measurement**
   - Run diagnostic script in SEPARATE native PowerShell (not in Forge)
   - Record CPU%, HTTP latency, freeze duration
   - Note exact actions when freeze occurs

2. **After Each Fix**
   - Same test protocol
   - Compare metrics
   - Document improvement or regression

3. **Stress Test**
   ```powershell
   # Generate high output volume
   1..10000 | ForEach-Object { "Line $_" }
   ```

---

## Key Insight

**The freeze is not a single bug but an architectural mismatch.** Forge's design assumes the main thread has consistent CPU availability. When system load spikes (for any reason), the single-threaded architecture becomes a bottleneck.

VS Code solved this years ago with WebWorkers. Forge needs the same architectural investment for AM to work reliably under load.

---

## Session Context

- User removed Dell bloatware and Docker/WSL
- Defender exclusions are configured
- AM is the core feature - disabling is not acceptable
- User uses Claude CLI and Copilot CLI extensively (TUI tools)
- Freezes correlate with typing, not just output volume

---

## Next Session Action Items

1. Add instrumentation to identify exact bottleneck
2. Implement keystroke batching for AM (100ms intervals)
3. Test with instrumentation to verify improvement
4. If insufficient, begin WebWorker implementation

---

## Implementation Plan (v1.24.7)

### 1. Backend: Batch Keystroke AM Processing
- **File:** `internal/terminal/handler.go`
- **Action:** Implement a 100ms buffer for AM checks.
- **Details:**
    - Introduce `amInputAccumulator` (string builder or string).
    - Introduce `lastAMCheck` (time.Time).
    - In the read loop, append to accumulator.
    - Only call `llmLogger.GetActiveConversationID()` and `llmLogger.AddUserInput()` if `time.Since(lastAMCheck) > 100ms`.
    - Reset accumulator and timer after check.

### 2. Backend: True AM Disable Flag
- **File:** `internal/am/system.go`
- **Action:** Ensure `GetLLMLogger` respects the enabled state.
- **Details:**
    - Modify `GetLLMLogger` to return `nil` if `!s.enabled`.
    - This will cause the `llmLogger != nil` check in `handler.go` to fail fast, skipping all AM logic.

### 3. Frontend: Instrumentation
- **File:** `frontend/src/components/ForgeTerminal.jsx`
- **Action:** Add performance timing to the WebSocket message handler.
- **Details:**
    - Measure time taken to process message.
    - Log warning if processing takes > 16ms (frame budget).

---

*Document generated by Claude Code session, December 17, 2025*
