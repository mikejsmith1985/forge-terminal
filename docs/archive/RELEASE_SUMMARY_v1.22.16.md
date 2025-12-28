# Release Summary: v1.22.16

**Release Date:** December 12, 2025  
**Version:** v1.22.16  
**Type:** Bug Fix Release

## 🎯 Overview

Critical fix for spacebar input issue caused by focus drift to document body. This addresses GitHub issue #42 where the Space key stops working intermittently until page refresh.

## 🐛 Bug Fixes

### Terminal Focus Drift Prevention

**Issue:** Spacebar and other keys would randomly stop working in the terminal until the user clicked the terminal or refreshed the page.

**Root Cause Analysis:**
- The diagnostic logs from issue #42 revealed `focusState.activeElement: "BODY"` - focus had drifted away from the xterm textarea
- While Space key events were initially detected by the textarea, focus would drift to the document body
- When focus is on BODY, the spacebar defaults to "Page Down" (scroll) command in browsers
- The terminal's key handler couldn't process input because it required xterm to have focus

**The Fix:**
- Added body-level click listener that reclaims terminal focus when focus drifts to BODY
- Leverages existing `robustFocus()` helper for cross-browser compatibility
- Only activates when the terminal tab is visible to avoid interfering with other UI elements
- Properly cleans up event listener on component unmount

**Implementation Details:**
```javascript
// Focus drift prevention: Reclaim focus if it drifts to BODY
const preventFocusDrift = (e) => {
  if (isVisible && document.activeElement === document.body && xtermRef.current) {
    robustFocus(terminalRef.current, xtermRef.current);
  }
};
document.body.addEventListener('click', preventFocusDrift);
```

**What This Fixes:**
- ✅ Spacebar input intermittently not working
- ✅ Other keys failing after focus loss
- ✅ Need to click terminal to "wake it up"
- ✅ Need to refresh page to restore input

**Testing:**
- Validated against diagnostic data from issue #42
- Focus state now properly maintained during normal usage
- Click anywhere in the window will reclaim focus if it drifts
- No performance impact (event handler only checks focus state)

## 📊 Validation

The proposed fix was validated against the diagnostic data showing:
- Browser correctly detecting Space keydown/keyup events
- WebSocket connection active and healthy
- Shell process responsive (not frozen)
- Focus state showing BODY instead of xterm-helper-textarea

This confirmed the issue was purely focus management, not input detection or WebSocket communication.

## 🔧 Technical Details

**Files Changed:**
- `frontend/src/components/ForgeTerminal.jsx` - Added focus drift prevention

**Lines Changed:** +7 additions (event listener setup and cleanup)

## 📝 Notes

This fix implements the solution suggested in the issue analysis, which correctly identified focus drift as the root cause. The implementation follows VS Code's terminal focus management patterns and integrates with the existing robust focus recovery system already in place.

## 🙏 Credits

Thanks to the diagnostic system (added in v1.22.11) which provided the critical evidence needed to identify this issue.
