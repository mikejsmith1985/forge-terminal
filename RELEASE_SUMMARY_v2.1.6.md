# Release Summary v2.1.6

## 🚀 Critical Fixes

### 1. Windows Connection Fix (PTY)
- **Issue**: The generated `.exe` was failing to connect on some Windows systems because it couldn't find the shell.
- **Fix**: Updated `internal/terminal/pty_windows.go` to use the `COMSPEC` environment variable to locate the system shell (usually `cmd.exe`) instead of relying on a hardcoded path. This ensures compatibility across different Windows configurations.

### 2. Connection Reliability
- **Issue**: The backend was strictly binding to `127.0.0.1`, which could cause issues on systems where IPv6 is preferred or `localhost` resolves differently.
- **Fix**: Updated `cmd/forge/main.go` to bind to `localhost`, allowing the OS to handle name resolution and protocol selection (IPv4/IPv6) appropriately.

### 3. Improved Error Visibility
- **Issue**: When the WebSocket connection failed (e.g., PTY start failure), the frontend would silently retry indefinitely, giving the appearance of a broken connection without feedback.
- **Fix**: Updated `frontend/src/components/ForgeTerminal.jsx` to parse and display error messages sent from the backend. The terminal now stops the reconnection loop and shows the specific error (e.g., "Failed to start PTY") to the user.

### 4. Backend Panic Fix (AM System)
- **Issue**: The backend was panicking on startup when the AM system was disabled (default state), causing connection refused errors in the frontend. The panic occurred due to a nil pointer dereference when accessing the LLM logger.
- **Fix**: Updated `internal/terminal/handler.go` to safely check for nil pointers before accessing LLM logger methods. This prevents the crash and ensures stable connections even when AM is disabled.

## 📦 Build Information
- **Version**: v2.1.6
- **Platform**: Windows (amd64)
- **Binaries**: `bin/forge.exe`

## 🧪 Verification
- Validated that the backend correctly identifies the shell using `COMSPEC`.
- Verified that connection errors are now visible in the terminal UI.
- Confirmed successful build of both frontend and backend components.
