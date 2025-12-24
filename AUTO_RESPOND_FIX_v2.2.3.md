# Auto-Respond Detection Fix v2.2.3

**Date**: 2024-12-24  
**Issue**: Auto-respond detection was coupled to AM (Artificial Memory) system, which is unreliable and has been disabled.

## Problem

The auto-respond logic for detecting when GitHub Copilot CLI is waiting for user input was tightly integrated with the AM (Artificial Memory) system:

1. Detection logic was in `internal/am/capture.go`
2. State management was in `internal/am/llm_logger.go`
3. When AM is disabled, auto-respond also stops working
4. AM is unreliable and needs to remain off

## Solution

Created a **standalone auto-respond detection system** that is completely independent of AM:

### New File: `internal/terminal/auto_respond.go`

Features:
- **Independent State Machine**: Tracks conversation state without AM
  - `StateIdle` - No active conversation
  - `StateUserTyping` - User is typing
  - `StateWaitingForAssistant` - Waiting for response
  - `StateAssistantResponding` - Assistant is replying

- **Smart Prompt Detection**:
  - Detects GitHub Copilot CLI prompt patterns
  - Handles ANSI codes and terminal escape sequences
  - Timeout-based fallback (3 seconds of silence)
  - Callback-based architecture for real-time notifications

- **Zero Dependencies on AM**: Works regardless of AM state

### Integration Points

Modified `internal/terminal/handler.go`:

1. **Added New Control Message Type**:
   ```go
   type AutoRespondControlMessage struct {
       Type    string `json:"type"` // "AUTO_RESPOND_TOGGLE"
       Enabled bool   `json:"enabled"`
   }
   ```

2. **Created Detector Instance**:
   ```go
   autoRespondDetector := NewAutoRespondDetector("github-copilot")
   ```

3. **Integrated with PTY Output**:
   ```go
   autoRespondDetector.ProcessOutput(buf[:n])
   ```

4. **Integrated with User Input**:
   ```go
   autoRespondDetector.ProcessInput(data)
   ```

5. **Periodic State Checking** (500ms intervals):
   ```go
   go func() {
       ticker := time.NewTicker(500 * time.Millisecond)
       for {
           if autoRespondDetector.Check() {
               // Waiting for user detected
           }
       }
   }()
   ```

6. **WebSocket Control Handler**:
   ```go
   if autoRespondMsg.Type == "AUTO_RESPOND_TOGGLE" {
       autoRespondDetector.SetEnabled(autoRespondMsg.Enabled)
       // Send confirmation back to client
   }
   ```

## How It Works

### Output Processing Flow

```
PTY Output → WebSocket (user sees immediately)
           → autoRespondDetector.ProcessOutput()
           → Buffer accumulation
           → State detection
```

### Input Processing Flow

```
User Input → PTY (terminal gets immediately)
           → autoRespondDetector.ProcessInput()
           → State tracking
           → Enter key detection → StateWaitingForAssistant
```

### Detection Logic

Every 500ms, the detector checks:
1. **Prompt Pattern Match**: Looks for empty lines, cursor position indicators
2. **Timeout**: 3 seconds since last output = likely waiting
3. **State Transitions**: `AssistantResponding` → `Idle` when waiting detected

### Copilot CLI Prompt Detection

The key insight: Copilot CLI shows an **empty input line** when waiting for user input. Detection criteria:

- Empty line at end (just newline)
- Cursor at line start with no text
- Last line < 3 characters
- No streaming text indicators

## Client-Side Integration

Frontend sends control message:
```javascript
websocket.send(JSON.stringify({
    type: "AUTO_RESPOND_TOGGLE",
    enabled: true
}));
```

Frontend receives state notifications:
```javascript
// When waiting for user input
{
    type: "AUTO_RESPOND_STATE",
    state: "waiting_for_user",
    timestamp: ...
}

// When assistant is responding
{
    type: "AUTO_RESPOND_STATE",
    state: "assistant_responding",
    timestamp: ...
}
```

## Benefits

1. **Works Without AM**: No dependency on unreliable AM system
2. **Real-Time**: 500ms check interval for responsive detection
3. **Lightweight**: Minimal memory footprint (2KB buffer)
4. **Extensible**: Easy to add support for Claude, Aider, etc.
5. **Observable**: Stats available via `GetStats()` API

## Testing

To test the fix:

1. Start Forge Terminal v2.2.3
2. Enable auto-respond via UI toggle
3. Start GitHub Copilot CLI: `gh copilot`
4. Type a prompt and press Enter
5. Check backend logs for:
   ```
   [AutoRespond] Detected: Assistant responding
   [AutoRespond] Detected: Waiting for user input
   ```

## Next Steps

- [ ] Update frontend to use new `AUTO_RESPOND_TOGGLE` message
- [ ] Add UI indicator showing auto-respond state
- [ ] Implement auto-reply trigger when `waiting_for_user` detected
- [ ] Add configuration for detection timeout (currently hardcoded 3s)
- [ ] Add support for Claude and other providers
- [ ] Create integration tests

## Files Changed

1. **NEW**: `internal/terminal/auto_respond.go` (287 lines)
2. **MODIFIED**: `internal/terminal/handler.go`
   - Added `AutoRespondControlMessage` type
   - Integrated detector into PTY loops
   - Added control message handling
   - Added periodic state checking

## Backward Compatibility

- Old AM-based auto-respond still works if AM is enabled
- New standalone system can run in parallel
- Frontend can use either system (or both)
- Zero breaking changes to existing APIs

## Performance Impact

- **Memory**: +2KB per session (output buffer)
- **CPU**: Minimal (500ms check interval, simple string matching)
- **Latency**: Zero impact on terminal responsiveness (all async)

---

**Status**: ✅ Implementation Complete - Ready for Testing
