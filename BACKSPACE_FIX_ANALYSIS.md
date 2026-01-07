# Backspace Fix Analysis & Implementation

## Problem
Backspace key not deleting characters when using **GitHub Copilot CLI**. The diagnostics showed:
- ✅ Backspace keypress reaches TEXTAREA
- ✅ Terminal receives "Backspace" 
- ❌ **NO actual deletion happens**

Interestingly, the issue **does NOT occur with Claude CLI**, suggesting a CLI-specific escape sequence incompatibility.

## Root Cause Analysis

### What's happening:
1. User presses Backspace
2. xterm.js receives the keydown event via `attachCustomKeyEventHandler()`
3. Our handler returns `true` → tells xterm to process it
4. xterm.js converts Backspace to an escape sequence via `onData()`
5. **The problem**: xterm might be sending the wrong escape code

### The Two Backspace Codes:
Different terminals/CLIs expect different backspace characters:

| Code | Hex   | Name | Used By |
|------|-------|------|---------|
| `\x7f` | 0x7F | DEL  | Unix/Linux terminals, most modern CLIs, **Claude** |
| `\x08` | 0x08 | BS   | Some Windows terminals, legacy systems |

**Hypothesis**: GitHub Copilot CLI expects `\x7f` (DEL), but xterm might be sending `\x08` (BS) or vice versa.

## Solution Implemented

### Approach: Explicit Backspace Interception

Instead of letting xterm.js decide which escape code to send, we **intercept Backspace** in the custom key handler and **explicitly send `\x7f` (DEL)** - the most universally compatible code.

### Code Changes

**File**: `frontend/src/components/ForgeTerminal.jsx`

**Location**: Lines 1101-1115 (in `attachCustomKeyEventHandler()`)

**Change**:
```javascript
// FIX: Explicitly handle Backspace to ensure correct escape sequence
// Different CLIs expect different codes: \x7f (DEL) vs \x08 (BS)
// We'll send \x7f which is the standard for most Unix terminals and modern CLIs
if (arg.code === 'Backspace' && arg.type === 'keydown') {
  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
    // Send DEL character (\x7f) directly to ensure it reaches the CLI
    wsRef.current.send('\x7f');
    console.log('[Terminal] Backspace intercepted - sending \\x7f (DEL)');
    return false; // Prevent xterm from also handling it
  }
  return true; // Let xterm handle if websocket not ready
}
```

### How It Works:

1. **Intercepts** Backspace keydown event BEFORE xterm processes it
2. **Sends `\x7f`** directly to the WebSocket (bypassing xterm's escape code logic)
3. **Returns `false`** to prevent xterm from also processing it (avoid double-send)
4. **Logs** the interception for diagnostics visibility

### Why This Should Work:

- ✅ **Universal compatibility**: `\x7f` (DEL) is the POSIX standard and works with most modern CLIs
- ✅ **Claude already works**: Suggests Claude expects `\x7f`, and this matches it
- ✅ **Direct control**: Bypasses xterm's potentially incorrect escape sequence conversion
- ✅ **Consistent behavior**: Same code sent every time, regardless of platform/terminal config

## Testing Plan

### Manual Testing:
1. Start `forge-backspace-fix.exe`
2. Open GitHub Copilot CLI in a terminal
3. Type some text: `hello world`
4. Press Backspace 5 times
5. **Expected**: Should delete "world" character by character
6. Check diagnostics panel for log: `[Terminal] Backspace intercepted - sending \x7f (DEL)`

### Fallback Testing:
1. Test with Claude CLI (should still work)
2. Test with regular PowerShell (should still work)
3. Test with bash/WSL (should still work)

## Alternative Solutions (if this doesn't work)

### Option 1: Try `\x08` (BS) instead
If Copilot expects BS not DEL, change line to:
```javascript
wsRef.current.send('\x08');
```

### Option 2: CLI-Specific Detection
Detect if Copilot is running and send appropriate code:
```javascript
const isCopilot = /* detect copilot process */;
wsRef.current.send(isCopilot ? '\x08' : '\x7f');
```

### Option 3: xterm Configuration
Configure xterm's built-in backspace behavior (requires xterm.js API investigation):
```javascript
const term = new Terminal({
  // ... existing options
  // Hypothetical option (needs verification):
  // backspaceKeyCode: 127 // Force DEL
});
```

## Build Output
- ✅ Frontend built successfully (12.76s)
- ✅ Backend compiled successfully
- ✅ Binary: `forge-backspace-fix.exe`

## Next Steps
1. User tests with Copilot CLI
2. If still doesn't work: Try `\x08` instead of `\x7f`
3. If still doesn't work: Investigate xterm.js Backspace configuration options
4. Confirm Claude CLI still works (shouldn't be affected)
