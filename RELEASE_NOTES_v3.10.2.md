# Release Notes v3.10.2

## WebSocket Stability & Connection Reliability

This release fixes critical connection stability issues that caused terminal disconnects during long operations.

### 🔴 Critical Fix: PTY Watchdog Timer

**Problem:** PTY read operations could block indefinitely (up to 9+ minutes) when shell processes hung, causing WebSocket timeouts and connection drops.

**Solution:** Added a 30-second watchdog timer that:
- Monitors PTY read operations in real-time
- Detects hung reads and forces clean connection close
- Logs critical warnings for slow reads (>5 seconds)
- Prevents cascading connection failures

### Changes

#### Backend (`internal/terminal/handler.go`)
- Added `lastReadTime` tracking for watchdog monitoring
- Added watchdog goroutine with 10-second check interval
- Added 30-second timeout for detecting hung PTY reads
- Added critical logging for PTY reads >5 seconds
- Clean connection close on PTY timeout

#### Testing
- Added `frontend/e2e/websocket-stability.spec.js` with tests for:
  - WebSocket connection during rapid tab switching
  - WebSocket reconnection after disconnect
  - WebSocket cleanup on tab close
  - Goroutine leak prevention

### Previous v3.10.x Fixes Included

All fixes from v3.10.0 and v3.10.1 are included:

1. **Quick Instructions** - Toggle-able text snippets that append to prompts
2. **Auto-respond exclusion** - Prevents firing on /model selection menus
3. **Paste fallback** - Enhanced clipboard permission handling
4. **AM Monitor updates** - Real-time activity via EventBus
5. **Dev workflow improvements** - Isolated dev port (9999)

### Upgrade Notes

This is a stability-focused release. No breaking changes.

### Files Modified

- `internal/terminal/handler.go` - PTY watchdog timer
- `frontend/e2e/websocket-stability.spec.js` - Stability tests (new)
- `task-dashboard.html` - Visual documentation
