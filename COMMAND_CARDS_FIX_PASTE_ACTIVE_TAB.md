# Command Cards Fix: Paste to Active Tab

**Date:** 2025-12-27  
**Issue:** Command card paste function was sending commands to wrong tab (tab 1 instead of active tab)

## Root Cause

The `handlePaste` and `handleExecute` functions in `App.jsx` were **not wrapped in `useCallback`**, which meant they were capturing stale closures of the `activeTabId` state. When tabs were switched, these functions continued to reference the old tab ID.

## Fix Applied

### File: `frontend/src/App.jsx`

**Before:**
```javascript
const handlePaste = (cmd) => {
  const termRef = getActiveTerminalRef();
  if (termRef) {
    termRef.pasteCommand(cmd.command)
    termRef.focus()
  }
}
```

**After:**
```javascript
const handlePaste = useCallback((cmd) => {
  const termRef = getActiveTerminalRef();
  if (termRef) {
    termRef.pasteCommand(cmd.command)
    termRef.focus()
  }
}, [getActiveTerminalRef]);
```

Also fixed `handleExecute` with the same pattern, adding proper dependencies:
```javascript
const handleExecute = useCallback((cmd) => {
  // ... existing code
}, [getActiveTerminalRef, activeTab, activeTabId, addToast]);
```

## How It Works

1. `getActiveTerminalRef()` uses `activeTabId` to find the correct terminal ref
2. When wrapped in `useCallback` with proper dependencies, it always uses the **current** `activeTabId`
3. Without `useCallback`, the function captured the initial `activeTabId` and never updated

## Testing

1. Create multiple tabs (Tab 1, Tab 2, Tab 3)
2. Switch to Tab 2 or Tab 3
3. Click "Paste" on a command card
4. **Expected:** Command pastes to the currently active tab
5. **Previous Bug:** Command always pasted to Tab 1

## Build Verification

✅ Frontend builds successfully after fix
✅ No TypeScript/ESLint errors
✅ Bundle size: 1,188.92 kB (within acceptable range)

## Related Files

- `frontend/src/App.jsx` - Main fix location
- `frontend/src/hooks/useTabManager.js` - Tab state management
- `frontend/src/components/SortableCommandCard.jsx` - Card UI component
