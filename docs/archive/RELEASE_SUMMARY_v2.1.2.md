# Forge Terminal v2.1.2 Release

**Release Date:** December 21, 2025

## Overview
Stability and reliability improvements for update detection and auto-respond features.

## What's Fixed

### 1. **Update Refresh Bug (Critical)**
- **Issue:** Application would enter an infinite reload loop when an update was detected via SSE
- **Root Cause:** SSE handler immediately called `window.location.reload()` on update event
- **Fix:** Changed to display a toast notification instead of auto-reloading
- **Impact:** Users can now safely check for updates without terminal disruption

### 2. **System Card Copy Button Crash**
- **Issue:** Clicking the copy button on system command cards would crash the app
- **Root Cause:** Incorrect `onToast` function signature (passing object instead of args)
- **Fix:** Updated SystemCommandCard and ReleaseManagerCard to use correct signature
- **Files Modified:**
  - `frontend/src/components/SystemCommandCard.jsx`
  - `frontend/src/components/ReleaseManagerCard.jsx`

### 3. **Auto-Respond Feature Improvements**
- **Issue:** Auto-respond would trigger on low-confidence prompt detections
- **Fix:** Added confidence level check to ignore low-confidence detections
- **Benefit:** Prevents accidental command execution when prompt detection is uncertain
- **Files Modified:**
  - `frontend/src/components/ForgeTerminal.jsx`

### 4. **Prompt Detection Patterns**
- **Enhancement:** Improved Y/N prompt patterns to handle optional colons (e.g., `[Y/n]:`)
- **Updated Patterns:** More robust detection for various CLI tools
- **Test Coverage:** All 19 prompt detection tests passing

## Technical Details

### Changes to App.jsx (SSE Update Handler)
```javascript
// BEFORE: Auto-reload immediately on update event
if (data.available) {
  window.location.reload();
}

// AFTER: Display toast and show update modal
if (data.available) {
  setUpdateInfo(data);
  addToast(`Update available: ${data.latestVersion}`, 'update', 0, {
    action: 'View Update',
    onAction: () => setIsUpdateModalOpen(true),
    secondaryAction: 'Later',
    onSecondaryAction: () => {
      localStorage.setItem('updateDismissedAt', Date.now().toString());
      localStorage.setItem('updateDismissedVersion', data.latestVersion);
    }
  });
}
```

### Changes to ForgeTerminal.jsx (Auto-Respond)
```javascript
// Auto-respond logic
if (waiting && autoRespondRef.current && ws.readyState === WebSocket.OPEN) {
  // Don't auto-respond to low confidence detections to avoid accidental execution
  if (confidence === 'low') {
    return;
  }
  // ... send response
}
```

## Testing

### Playwright Tests
- ✅ `update-refresh.spec.js` - Verifies SSE doesn't trigger reload
- ✅ `promptDetection.test.js` - All 19 tests passing

### Test Results
```
Test Files: 1 passed
Tests: 19 passed
Duration: 4.8s
```

## Files Modified

### Frontend
- `frontend/src/App.jsx` - SSE update handler fix
- `frontend/src/components/ForgeTerminal.jsx` - Auto-respond confidence check
- `frontend/src/components/SystemCommandCard.jsx` - Toast function signature
- `frontend/src/components/ReleaseManagerCard.jsx` - Toast function signature
- `frontend/src/utils/promptDetection.test.js` - Pattern updates
- `frontend/playwright.mock.config.js` - Test configuration (new)
- `frontend/tests/playwright/update-refresh.spec.js` - New test (new)

## User Impact

✅ **No Disruption:** Update checks no longer interrupt your work
✅ **Safer Auto-Respond:** Low-confidence prompts no longer trigger automatic responses
✅ **Better Copy UX:** System card copy buttons work reliably
✅ **More Reliable Updates:** When you choose to update, the process is smoother

## Breaking Changes
None

## Known Issues
None

## Upgrade Instructions
Simply download and install v2.1.2. The update system will automatically notify you.

## Contributors
- Bug fixes and testing improvements

## Next Steps
- Continue monitoring for edge cases in prompt detection
- Gather user feedback on auto-respond confidence levels
- Plan improvements to update download progress indication
