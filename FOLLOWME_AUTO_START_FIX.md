# Follow-Me Auto-Start Fix (v3.15)

## Problem
Opening the Web Tools sidebar tab automatically started Follow-Me recording, even when the user only wanted to view the tab.

## Root Cause
The `FollowMeDebugger` component had session recovery logic that couldn't distinguish between:
1. **True interruption** (page refresh, crash) - should auto-restore
2. **Normal tab switching** (user switches away from Web Tools) - should NOT auto-restore

**Buggy Flow:**
1. User starts recording in Web Tools tab
2. User switches to Cards/Files tab → `FollowMeDebugger` unmounts → saves session to localStorage
3. User reopens Web Tools tab → `FollowMeDebugger` mounts → auto-restores recording ❌

## Solution
Added `beforeunload` event detection to distinguish true page interruptions from component unmounts:

### Changes
**File:** `frontend/src/components/FollowMeDebugger.jsx`

1. **Added page unload tracking** (line 28-29):
   ```javascript
   // v3.15: Track if unmount is due to page unload vs component unmount
   const isPageUnloadingRef = useRef(false);
   ```

2. **Updated `saveSessionToLocalStorage` signature** (line 205):
   ```javascript
   const saveSessionToLocalStorage = useCallback((isInterrupted = false) => {
     // ...
     interrupted: isInterrupted, // Only mark interrupted if page unloading
     // ...
   }
   ```

3. **Enhanced cleanup effect** (lines 310-340):
   ```javascript
   useEffect(() => {
     // Track page unload
     const handleBeforeUnload = () => {
       isPageUnloadingRef.current = true;
     };
     window.addEventListener('beforeunload', handleBeforeUnload);

     return () => {
       // ... cleanup ...
       
       // Only save for recovery if page is unloading
       if (isRecordingRef.current && isPageUnloadingRef.current) {
         saveSessionToLocalStorage(true); // Mark as interrupted
       } else if (isRecordingRef.current) {
         // Clear localStorage to prevent auto-restore on tab switch
         localStorage.removeItem('follow-me-active-session');
       }
     };
   }, []);
   ```

## Behavior After Fix

### Tab Switching (Normal Use)
✅ User starts recording → switches to Cards tab → switches back to Web Tools
- Recording state is **lost** (intentional)
- User must manually click "Start Recording" again
- **No auto-start**

### Page Refresh (True Interruption)
✅ User starts recording → refreshes page → reopens Web Tools
- Session auto-restores with accumulated events
- Recording resumes automatically
- User sees "Interrupted session detected" prompt

## Build Status
✅ Frontend builds successfully (15.90s, 1.6MB bundle)

## Testing Checklist
- [ ] Open Web Tools tab → no recording starts
- [ ] Start recording → switch to Files tab → switch back to Web Tools → no auto-start
- [ ] Start recording → refresh page → session auto-restores
- [ ] Verify console logs: "Component unmount (tab switch) - clearing localStorage"

## Technical Notes
- Uses `beforeunload` event to detect true page exits
- `isPageUnloadingRef` persists across renders (useRef)
- `localStorage.removeItem()` on normal unmount prevents accidental auto-restore
- Backward compatible: existing interrupted sessions still restore correctly

## Version
v3.15 - Follow-Me auto-start bug fix

---
*Fix aligns with @copilot-instructions: minimal changes, surgical fix, no breaking changes*
