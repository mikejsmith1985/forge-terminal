# PTY BYTE LOGGING - QUICK REFERENCE

## 🚀 Quick Start

```bash
# Build
go build -o forge-test-pty.exe ./cmd/forge

# Run
./forge-test-pty.exe
```

## 🔌 API Cheat Sheet

### WebSocket Control Messages

```javascript
// Enable logging
ws.send(JSON.stringify({ type: "PTY_LOG_ENABLE" }));

// Disable logging
ws.send(JSON.stringify({ type: "PTY_LOG_DISABLE" }));

// Get logs
ws.send(JSON.stringify({ type: "PTY_LOG_GET" }));
```

### HTTP API

```javascript
// Get logs for session
fetch(`/api/debug/pty-logs?sessionId=${tabId}`)
  .then(res => res.json())
  .then(data => console.log(data));
```

## 📦 Log Entry Format

```json
{
  "timestamp": 1234567890123,
  "direction": "to_pty",
  "data": "7f",
  "size": 1,
  "text": "\\x7F",
  "sessionId": "abc-123"
}
```

## 🔍 Debugging Backspace

### What to Look For

| Issue | Symptom in Logs |
|-------|----------------|
| Lost backspace | No `0x7F` or `0x08` in "to_pty" logs |
| Timing delay | Gap > 100ms between keystroke and PTY write |
| Out of order | Backspace arrives before the character |
| Duplicate | Same `0x7F` byte logged multiple times |

### Common Byte Values

| Hex | ASCII | Text | Meaning |
|-----|-------|------|---------|
| `08` | BS | `\b` | Backspace (some terminals) |
| `7f` | DEL | `\x7F` | Backspace (most terminals) |
| `0d` | CR | `\r` | Carriage return |
| `0a` | LF | `\n` | Line feed |
| `09` | TAB | `\t` | Tab |
| `1b` | ESC | `\e` | Escape (ANSI) |

## 🧪 Browser Console Test

```javascript
// 1. Enable logging
terminalWs.send(JSON.stringify({type: "PTY_LOG_ENABLE"}));

// 2. Type in terminal, then backspace

// 3. Get logs
terminalWs.send(JSON.stringify({type: "PTY_LOG_GET"}));

// 4. Check HTTP API
fetch('/api/debug/pty-logs?sessionId=YOUR_TAB_ID')
  .then(r => r.json())
  .then(d => {
    console.log(`${d.count} entries captured`);
    console.table(d.logs.filter(l => l.direction === 'to_pty'));
  });
```

## 📋 Frontend Integration Snippet

```javascript
// In FollowMeDebugger.jsx
const handleStartRecording = () => {
  setIsRecording(true);
  
  // Enable PTY logging
  terminalWs.send(JSON.stringify({
    type: "PTY_LOG_ENABLE"
  }));
};

const handleStopRecording = async () => {
  setIsRecording(false);
  
  // Get PTY logs
  const response = await fetch(
    `/api/debug/pty-logs?sessionId=${tabId}`
  );
  const { logs } = await response.json();
  
  // Calculate stats
  const bytesSent = logs
    .filter(l => l.direction === "to_pty")
    .reduce((sum, l) => sum + l.size, 0);
  
  const bytesReceived = logs
    .filter(l => l.direction === "from_pty")
    .reduce((sum, l) => sum + l.size, 0);
  
  // Add to session
  sessionData.ptyLogs = logs;
  sessionData.summary.ptyBytesSent = bytesSent;
  sessionData.summary.ptyBytesReceived = bytesReceived;
  
  // Save
  await saveDebugSession(sessionData);
  
  // Cleanup
  terminalWs.send(JSON.stringify({
    type: "PTY_LOG_DISABLE"
  }));
};
```

## 🎯 Files Modified

| File | Changes |
|------|---------|
| `internal/terminal/handler.go` | Added PTYLogger, instrumentation, WebSocket handlers |
| `cmd/forge/handlers_debug_session.go` | Added PTYLogs field, HTTP handler |
| `cmd/forge/main.go` | Registered `/api/debug/pty-logs` endpoint |

## ✅ Status

- ✅ Backend: Complete and tested
- ⏳ Frontend: Integration needed
- 📦 Build: `forge-test-pty.exe`
- 📄 Docs: `BACKSPACE_PTY_LOGGING_SUMMARY.md`
- 🎨 Dashboard: `BACKSPACE_PTY_LOGGING_COMPLETE.html`

## 💡 Pro Tips

1. **Enable logging BEFORE reproducing bug** - can't capture what happens before logging starts
2. **Check both directions** - bug could be in send (to_pty) or receive (from_pty)
3. **Look for timing patterns** - timestamps reveal if issue is delay-related
4. **Compare with DOM events** - Follow Me captures both, correlate them
5. **Disable when done** - frees memory and prevents log file bloat

## 🚨 Troubleshooting

| Problem | Solution |
|---------|----------|
| No logs captured | Verify logging enabled: check for PTY_LOG_ENABLED response |
| Empty logs array | Wait longer before fetching - terminal needs time to process input |
| Backend error | Check console logs, verify sessionID matches active terminal |
| Frontend can't access | Ensure terminalWs is the correct WebSocket connection |

---

**Quick Test:** `node test-pty-logging.mjs` (after starting forge-test-pty.exe)
