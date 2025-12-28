# Forge Terminal v1.20.12 - Ctrl+C Copy Fix

**Release Date**: December 10, 2025

## 🎯 Critical Bug Fix

### Ctrl+C Behavior Restored

**Problem:**
Ctrl+C was unconditionally sending SIGINT to the terminal, making it impossible to copy selected text. Users trying to copy terminal output would accidentally terminate their CLI/TUI processes (like `gh copilot`, `claude`, etc.).

**Solution:**
Modified the keyboard handler to check if text is selected before deciding action:
- **With selection**: Allows browser to copy text (doesn't send SIGINT)
- **Without selection**: Sends SIGINT to interrupt process as expected

### Technical Details

**File Modified:** `frontend/src/components/ForgeTerminal.jsx`

**Change:**
```javascript
// BEFORE - Always sent SIGINT:
if (event.ctrlKey && (event.key === 'c' || event.key === 'C')) {
  event.preventDefault();
  wsRef.current.send('\x03'); // Always interrupt
  return false;
}

// AFTER - Check for selection first:
if (event.ctrlKey && (event.key === 'c' || event.key === 'C')) {
  const hasSelection = term.hasSelection();
  
  if (hasSelection) {
    return true; // Allow copy
  } else {
    event.preventDefault();
    wsRef.current.send('\x03'); // Send SIGINT
    return false;
  }
}
```

**API Used:** xterm.js `terminal.hasSelection()` method

---

## ✅ Testing

All test scenarios verified:

| Scenario | Result | Notes |
|----------|--------|-------|
| Copy with selection | ✅ PASS | Text copied to clipboard, process continues |
| SIGINT without selection | ✅ PASS | Process interrupted, prompt returns |
| Multiple Ctrl+C | ✅ PASS | Stable, no crashes |
| TUI applications | ✅ PASS | Both behaviors work correctly |

**Console Logs:**
- With selection: `[Terminal] Ctrl+C with selection - allowing copy`
- Without selection: `[Terminal] Ctrl+C without selection - sending SIGINT`

---

## 📦 Changes

### Modified Files
- `frontend/src/components/ForgeTerminal.jsx` - Added selection check
- `cmd/forge/web/` - Updated built assets

### Added Files
- `frontend/tests/playwright/ctrl-c-copy-vs-sigint.spec.js` - Test suite (4 tests)

### Documentation
- `docs/sessions/2025-12-10-ctrl-c-fix/MANUAL_TEST_VERIFICATION.md` - Test verification

---

## 🚀 Impact

### User Experience
- ✅ Can now copy terminal output with Ctrl+C
- ✅ Can still interrupt processes with Ctrl+C (when no text selected)
- ✅ Behavior matches user expectations from other terminals
- ✅ No more accidentally terminated CLI tools

### Backward Compatibility
- ✅ Fully backward compatible
- ✅ SIGINT behavior preserved when expected
- ✅ No breaking changes

---

## 🐛 Bug Fixed

**Issue:** User reported that Ctrl+C was terminating CLI/TUI instances instead of copying text

**Root Cause:** Keyboard handler was not checking for text selection before sending SIGINT

**Resolution:** Added `term.hasSelection()` check to determine correct action

---

## 📝 Version Info

- **Version**: 1.20.12
- **Previous**: 1.20.11 (AM Architecture Simplification)
- **Release Date**: December 10, 2025
- **Type**: Bug fix
- **Priority**: High (affects daily usability)

---

## 🎉 Deployment Ready

This release is:
- ✅ Tested and verified
- ✅ Backward compatible
- ✅ Production ready
- ✅ No dependencies updated
- ✅ No breaking changes

The Ctrl+C issue is now resolved. Users can copy terminal text without fear of terminating their processes.

---

**To upgrade:**
```bash
git pull
# Or download latest release from GitHub
```

**Questions?** See the main README.md or open an issue on GitHub.
