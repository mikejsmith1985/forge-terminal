# Forge Terminal v1.9.9 - Shell Configuration Enhancements

**Release Date:** December 14, 2025  
**Version:** 1.9.9  
**Type:** Feature Release

---

## 🎯 Overview

This release adds two critical improvements to keyboard input and shell configuration:

1. **Fixed Spacebar & Double Paste Issues** - Resolves input bugs from previous versions
2. **Configurable Home Directories for All Shell Types** - Allows users to set default working directory for CMD, PowerShell, and WSL

---

## ✨ New Features

### Configurable Shell Home Directories

Users can now set default working directories for each shell type through the Settings modal:

#### For CMD (Windows Command Prompt)
- Set default directory (e.g., `C:\ProjectsWin`)
- Terminal starts in specified location automatically
- Works across drive changes (uses `cd /d`)

#### For PowerShell
- Set default directory (e.g., `C:\ProjectsWin`)
- Terminal starts in specified location automatically
- Uses `Set-Location` for clean directory changes

#### For WSL
- Existing functionality preserved
- Can still specify WSL distribution and Linux home path
- Fully backward compatible

#### Features
- **Per-Shell Configuration**: Each shell type has independent home directory setting
- **Per-Tab Configuration**: Each tab remembers its shell settings
- **Persistent Storage**: Settings saved and restored across sessions
- **Global Defaults**: Set system-wide defaults in Settings modal
- **Optional**: Leave empty to use shell defaults

### Example Use Cases

```
📁 Project Directory Structure:
  C:\ProjectsWin     ← Personal projects (CMD)
  C:\Dev             ← Work projects (PowerShell)
  /home/user/linux   ← Linux projects (WSL)
```

Users can now have:
- **Tab 1 (CMD)**: Starts in `C:\ProjectsWin`
- **Tab 2 (PowerShell)**: Starts in `C:\Dev`
- **Tab 3 (WSL)**: Starts in `/home/user/linux`

---

## 🐛 Bug Fixes

### 1. Spacebar Not Working
**Issue:** Spacebar input was being blocked globally  
**Root Cause:** WelcomeModal was calling `preventDefault()` on Space key at document level  
**Fix:** Removed Space from preventDefault block - users can still close modal with Escape/Enter  
**Impact:** Spacebar now works reliably in all terminal shells

### 2. Double Paste (Ctrl+V)
**Issue:** Pasting text resulted in duplicate content  
**Root Cause:** xterm's built-in clipboard mode was racing with custom paste handler  
**Fix:** Disabled xterm's clipboardMode ('off') - custom handler has full control  
**Impact:** Single, clean paste without duplication

---

## 🔧 Technical Changes

### Backend

#### `internal/terminal/session.go`
- Extended `ShellConfig` struct with `CmdHomePath` and `PSHomePath` fields
- Updated `NewTerminalSessionWithConfig` to extract and use shell-specific home paths
- Pass working directory to PTY startup function

#### `internal/terminal/handler.go`
- Updated WebSocket query parameter parsing:
  - `home` → `wslHome` (WSL specific)
  - Added `cmdHome` (CMD specific)
  - Added `psHome` (PowerShell specific)

#### `internal/terminal/pty_windows.go`
- Updated `startPTYWithShell` signature to accept `workingDir` parameter
- Sends `cd /d "path"` for CMD or `Set-Location "path"` for PowerShell immediately after shell startup
- Handles paths with spaces properly with quoted strings

#### `internal/terminal/pty_unix.go`
- Updated `startPTYWithShell` signature for consistency across platforms
- Supports `workingDir` parameter for future use

### Frontend

#### `frontend/src/App.jsx`
- Extended shell config state with `cmdHomePath` and `psHomePath`
- Updated config loading to include all home path fields

#### `frontend/src/components/SettingsModal.jsx`
- Added "Home Directory" input field for CMD shell
- Added "Home Directory" input field for PowerShell shell
- Conditional rendering based on selected shell type
- Help text with examples (e.g., `C:\ProjectsWin`)

#### `frontend/src/components/ForgeTerminal.jsx`
- Updated WebSocket query parameter building
- Each shell type now sends its appropriate home path parameter
- Parameters only sent if configured (no empty values)

#### `frontend/src/components/WelcomeModal.jsx`
- Removed Space key from preventDefault to fix spacebar blocking

---

## 📊 Configuration

### Settings Modal UI
1. Open **Settings** (⚙️ gear icon)
2. Select shell type (CMD, PowerShell, or WSL)
3. Based on selection, configure:
   - **CMD**: Home Directory (Windows path)
   - **PowerShell**: Home Directory (Windows path)
   - **WSL**: Distribution + Linux Home Directory

### Configuration Persistence
- Global settings saved in browser/backend storage
- Per-tab settings stored with each tab
- Settings restored on page reload

### Backward Compatibility
- Existing WSL configurations continue to work
- Old query parameter `home` automatically converted to `wslHome`
- New parameters are optional (graceful degradation if not provided)

---

## 🚀 Deployment

### Build Status
✅ Frontend: Compiled successfully  
✅ Backend: Compiled successfully  
✅ No errors or warnings  

### Tested Scenarios
- [x] Spacebar input in terminal
- [x] Paste via Ctrl+V (single, clean paste)
- [x] CMD with custom home directory
- [x] PowerShell with custom home directory
- [x] WSL with existing configuration
- [x] Settings persistence across reload
- [x] Multiple tabs with different shell configs

### Known Limitations
- Home directory must exist (shell will error if invalid path)
- UNC paths not tested (standard Windows paths recommended)
- Environment variable expansion (e.g., `%USERPROFILE%`) not yet supported

---

## 📝 Migration Notes

### For Users
No action required. All existing configurations work as before.

**New Feature Opt-In:**
1. Open Settings
2. Select shell type
3. Enter home directory (optional)
4. Restart terminal

### For Developers
If building custom shell configs, note the parameter name changes:
- Use `wslHome` instead of `home` for WSL
- New: `cmdHome` for CMD
- New: `psHome` for PowerShell

---

## 🔍 Files Modified

- `internal/terminal/session.go`
- `internal/terminal/handler.go`
- `internal/terminal/pty_windows.go`
- `internal/terminal/pty_unix.go`
- `frontend/src/App.jsx`
- `frontend/src/components/SettingsModal.jsx`
- `frontend/src/components/ForgeTerminal.jsx`
- `frontend/src/components/WelcomeModal.jsx`

---

## 📚 Documentation

Complete implementation details available in:
- `docs/sessions/2025-12-14-keyboard-paste-fixes.md`
- `docs/sessions/2025-12-14-configurable-shell-home-directories.md`

---

## 🙏 Acknowledgments

Built with attention to user experience and terminal consistency across Windows and WSL.

---

**Version:** 1.9.9  
**Commit:** `8b04ae3`  
**Build Date:** December 14, 2025 15:15 UTC
