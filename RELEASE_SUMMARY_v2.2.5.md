# v2.2.5 - Fix Auto-Respond Regression

## Critical Fix: Restore requestIdleCallback

### Root Cause
Between v2.0.2 (working) and v2.2.3+ (broken), the auto-respond detection was changed from:
- **v2.0.2**: Used \equestIdleCallback\ (non-blocking, runs when browser is idle)
- **v2.2.3+**: Used \setTimeout(500ms)\ (blocking, fixed delay)

The setTimeout approach caused detection to be too slow or miss prompts entirely.

### Fix Applied
**File**: \rontend/src/components/ForgeTerminal.jsx\

**Restored v2.0.2 logic**:
\\\javascript
// Use requestIdleCallback (already defined at top of file)
if (waitingCheckIdleRef.current) {
  cancelIdleWork(waitingCheckIdleRef.current);
}
waitingCheckIdleRef.current = scheduleIdleWork(() => {
  // Detection runs when browser is idle
  const { waiting, responseType, confidence } = detectCliPrompt(buf.data, false);
  // ... rest of logic
});
\\\

### Why This Works
- \equestIdleCallback\ schedules work during browser idle time
- Non-blocking - doesn't interfere with terminal rendering
- Triggers immediately when output stream pauses (e.g., waiting at prompt)
- Falls back to \setTimeout(100ms)\ in browsers that don't support it

### Removed Changes
- Reverted buffer size back to 800 (it was never the issue)
- Removed \waitingCheckTimeoutRef\ (not needed with idle callback)
- Kept the \uf.data\ fix (was correct)

---

## Other Fixes in This Build

### ImageDropZone UX Improvements ✅
- Focus state with orange border
- "Ready - Press Ctrl+V" indicator
- Spinning icon during processing
- Green checkmark on success
- Better error handling

### Paste Crash Protection ✅
- Backend panic recovery
- Better validation
- Enhanced error logging

---

## Testing v2.2.5

1. **Auto-Respond**: 
   - Enable on a tab
   - Run \gh copilot suggest "list files"\
   - Should detect and respond immediately when prompt appears
   - Check Debug panel for detection logs

2. **Connection Stability**:
   - Terminal should maintain connection
   - No reconnection loops
   - Fast, responsive terminal

---

## Files Modified
- \rontend/src/components/ForgeTerminal.jsx\ (auto-respond timing)
- \rontend/src/components/ImageDropZone.jsx\ (UX improvements)  
- \cmd/forge/tempimages.go\ (crash protection)

