# Design Specification: v2.1.9 Critical Bug Fixes

**Version**: 2.1.9
**Status**: ✅ IMPLEMENTED
**Created**: 2025-12-23
**Baseline Reference**: v1.23.8 (confirmed working)

---

## Executive Summary

Four critical regressions were fixed, identified by comparing v1.23.8 (working) with v2.1.8 (broken):

| # | Issue | Root Cause | Priority | Status |
|---|-------|------------|----------|--------|
| 1 | Auto-respond broken | scheduleIdleWork timing change from 1500ms to 100ms | P0 - CRITICAL | ✅ Fixed |
| 2 | Version tooltip shows "Version" only | currentVersion not populated in dev mode | P1 | ✅ Fixed |
| 3 | UpdateModal version text unreadable | CSS color issue (blue on dark background) | P1 | ✅ Fixed |
| 4 | Apply update button missing | Version not fetched, updateInfo.available never true | P1 | ✅ Fixed |

---

## Issue 1: Auto-Respond Broken (P0 CRITICAL)

### Root Cause Analysis

**v1.23.8 (Working)**:
```javascript
// Simple debounce pattern with 1500ms delay
waitingCheckTimeoutRef.current = setTimeout(() => {
  const { waiting, responseType, confidence } = detectCliPrompt(lastOutputRef.current, debugMode);
  // ... auto-respond logic
}, 1500); // Increased from 500ms to 1500ms for performance
```

**v2.1.8 (Broken)**:
```javascript
// Changed to scheduleIdleWork with complex starvation logic
const scheduleIdleWork = (callback) => {
  return setTimeout(callback, 100);  // Only 100ms!
};

// Complex cancellation logic that can starve the check
if (waitingCheckIdleRef.current) {
  if (!isStarved) {
    cancelIdleWork(waitingCheckIdleRef.current);
  }
  waitingCheckIdleRef.current = null;
}
```

**Problem**:
1. The 100ms delay is too short - CLI tools (Copilot, Claude) often emit multiple chunks within 100ms
2. Each chunk cancels the pending check and reschedules it
3. The starvation protection (1000ms) helps but the fundamental timing is wrong
4. The `buf.data` buffer isn't being captured correctly in the closure

### Fix Design

**File**: `frontend/src/components/ForgeTerminal.jsx`

**Change 1**: Revert scheduleIdleWork timing to match v1.23.8 behavior

```javascript
// BEFORE (line 43-47)
const scheduleIdleWork = (callback) => {
  // BUGFIX: requestIdleCallback can starve when browser is never truly idle
  // Use setTimeout as primary method for more reliable execution
  return setTimeout(callback, 100);
};

// AFTER
const scheduleIdleWork = (callback) => {
  // Use 1500ms debounce matching v1.23.8 proven timing
  // This ensures the prompt check runs after output stream settles
  return setTimeout(callback, 1500);
};
```

**Change 2**: Simplify the debounce logic (remove starvation complexity)

```javascript
// BEFORE (lines 1102-1159) - complex logic with starvation check
const isStarved = (Date.now() - lastPromptCheckRef.current) > 1000;

if (waitingCheckIdleRef.current) {
  if (!isStarved) {
    cancelIdleWork(waitingCheckIdleRef.current);
  }
  waitingCheckIdleRef.current = null;
}

if (!waitingCheckIdleRef.current) {
  waitingCheckIdleRef.current = scheduleIdleWork(() => {
    // ... complex logic
  });
}

// AFTER - simple debounce pattern matching v1.23.8
if (waitingCheckIdleRef.current) {
  cancelIdleWork(waitingCheckIdleRef.current);
}
waitingCheckIdleRef.current = scheduleIdleWork(() => {
  waitingCheckIdleRef.current = null;
  
  // Update lastOutputRef for compatibility
  lastOutputRef.current = buf.data;

  // Now do the expensive regex work
  const { waiting, responseType, confidence } = detectCliPrompt(buf.data, false);

  if (waiting !== isWaiting) {
    setIsWaiting(waiting);
    if (onWaitingChange) {
      onWaitingChange(waiting);
    }
  }

  // Directory detection
  const detectedDir = extractDirectory(buf.data);
  if (detectedDir && detectedDir !== lastDirectoryRef.current) {
    lastDirectoryRef.current = detectedDir;
    const folderName = getFolderName(detectedDir);
    if (folderName && onDirectoryChangeRef.current) {
      onDirectoryChangeRef.current(folderName, detectedDir);
    }
  }

  // Auto-respond logic - CRITICAL: Match v1.23.8 exactly
  const shouldAutoRespond = waiting && 
    autoRespondRef.current && 
    ws.readyState === WebSocket.OPEN;
    
  if (shouldAutoRespond) {
    logger.terminal('Auto-responding to CLI prompt', { tabId, responseType, confidence });
    
    if (responseType === 'enter') {
      ws.send('\r');
    } else {
      ws.send('y\r');
    }
    
    // Clear buffer and state after auto-respond
    buf.data = '';
    lastOutputRef.current = '';
    setIsWaiting(false);
    if (onWaitingChange) {
      onWaitingChange(false);
    }
  }
});
```

**Change 3**: Remove lastPromptCheckRef (no longer needed without starvation logic)

```javascript
// DELETE this ref and all references to it (lines 395, 1102, 1119)
// const lastPromptCheckRef = useRef(0);
// const promptCheckIntervalMs = 500;
```

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Rapid output (spinners) | Debounce resets, check happens 1500ms after last output |
| Slow output (1 chunk every 2s) | Check happens 1500ms after each chunk |
| Multiple prompts in sequence | Each prompt detected and responded to separately |
| Tab with auto-respond OFF | No auto-response, state updates only |
| WebSocket closed mid-check | No-op, ws.readyState check prevents send |

---

## Issue 2: Version Tooltip Shows "Version" Only

### Root Cause Analysis

**File**: `frontend/src/App.jsx` (lines 532-536)

```javascript
const checkForUpdates = async () => {
  // Skip update check in local development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[Update] Skipping update check in local development');
    return;  // <-- NEVER sets currentVersion!
  }
```

This causes `currentVersion` to remain empty (`''`), so the tooltip shows `Version ` (with no version number).

### Fix Design

**File**: `frontend/src/App.jsx`

**Change**: Fetch version even in dev mode, just skip the update check

```javascript
// BEFORE (lines 532-537)
const checkForUpdates = async () => {
  // Skip update check in local development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[Update] Skipping update check in local development');
    return;
  }

// AFTER
const checkForUpdates = async () => {
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  try {
    // Always fetch current version (needed for tooltip and modal display)
    const versionRes = await fetch('/api/version');
    const versionData = await versionRes.json();
    setCurrentVersion(versionData.version || '');
    
    // Skip GitHub update check in local development
    if (isLocalDev) {
      console.log('[Update] Skipping GitHub update check in local development');
      return;
    }
    
    // Check for updates from GitHub
    const res = await fetch('/api/update/check');
    // ... rest of existing logic
```

### Data Flow

```
/api/version → versionData.version → setCurrentVersion() → tooltip displays correctly
```

---

## Issue 3: UpdateModal Version Text Unreadable

### Root Cause Analysis

**File**: `frontend/src/components/UpdateModal.jsx` (lines 363-365)

```jsx
<div>
  <span style={{ color: '#888' }}>Current Version</span>
  <div style={{ fontFamily: 'monospace', fontWeight: 600, marginTop: '4px' }}>v{currentVersion}</div>
```

The version text has **no explicit color** set, inheriting from parent which could be a dark color on dark background.

Also, if `currentVersion` is empty, it displays just `v`.

### Fix Design

**File**: `frontend/src/components/UpdateModal.jsx`

**Change 1**: Add explicit white color for version text

```jsx
// BEFORE (line 365)
<div style={{ fontFamily: 'monospace', fontWeight: 600, marginTop: '4px' }}>v{currentVersion}</div>

// AFTER
<div style={{ fontFamily: 'monospace', fontWeight: 600, marginTop: '4px', color: '#fff' }}>
  {currentVersion ? `v${currentVersion}` : 'Loading...'}
</div>
```

**Change 2**: Handle empty version gracefully

The `{currentVersion ? \`v${currentVersion}\` : 'Loading...'}` pattern ensures we never display just "v".

### Visual Specification

| State | Display |
|-------|---------|
| Version loaded | `v2.1.8` (white, monospace) |
| Version loading | `Loading...` (white, monospace) |
| Version error | `Loading...` (white, monospace) |

---

## Issue 4: Apply Update Button Missing

### Root Cause Analysis

This is a **consequence of Issue 2**. The update button only appears when `hasUpdate` is true:

```jsx
// UpdateModal.jsx line 338
const hasUpdate = updateInfo?.available;

// Line 783-811 - buttons only render when hasUpdate is true
{hasUpdate ? (
  <>
    <button onClick={handleRemindLater}>Remind Me Later</button>
    <button onClick={handleUpdate}>Update Now</button>
  </>
) : (
  <button onClick={onClose}>Close</button>
)}
```

In dev mode, `checkForUpdates()` returns early without calling `/api/update/check`, so `updateInfo` is never populated and `updateInfo?.available` is always false.

### Fix Design

**Already fixed by Issue 2's fix** - once we fetch the version properly and call `/api/update/check`, the button will appear when updates are available.

For local development where GitHub update check is skipped, we should show a message indicating updates can't be checked locally:

**File**: `frontend/src/components/UpdateModal.jsx`

**Change**: Add development mode awareness

```jsx
// Add prop for dev mode detection
const UpdateModal = ({ isOpen, onClose, updateInfo, currentVersion, onApplyUpdate, isDevMode = false }) => {

// In the JSX, before the hasUpdate check (around line 461):
{isDevMode && !hasUpdate && (
  <div style={{ 
    textAlign: 'center', 
    padding: '20px',
    color: '#888',
    background: '#1a1a1a',
    borderRadius: '8px',
    marginBottom: '15px'
  }}>
    <p style={{ margin: 0, marginBottom: '8px' }}>
      Running in development mode
    </p>
    <p style={{ margin: 0, fontSize: '0.85em', color: '#666' }}>
      Update checks are disabled. Use the "Check Now" button to check GitHub manually.
    </p>
  </div>
)}
```

**File**: `frontend/src/App.jsx`

**Change**: Pass isDevMode to UpdateModal

```jsx
// Around line 1474, add isDevMode prop
<UpdateModal
  isOpen={isUpdateModalOpen}
  onClose={() => setIsUpdateModalOpen(false)}
  updateInfo={updateInfo}
  currentVersion={currentVersion}
  isDevMode={window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'}
/>
```

---

## Implementation Order

1. **Issue 1 (Auto-respond)** - Most critical, fix first
2. **Issue 2 (Version fetch)** - Required for issues 3 & 4
3. **Issue 3 (Version display)** - Quick CSS fix
4. **Issue 4 (Update button)** - Mostly fixed by #2, add dev mode message

---

## Testing Checklist

### Issue 1: Auto-respond
- [ ] Enable auto-respond on a tab
- [ ] Run `gh copilot suggest "list files"` or similar
- [ ] Verify "y" is auto-sent when prompted
- [ ] Verify prompt waiting indicator updates correctly
- [ ] Test with rapid terminal output (e.g., `find /`)

### Issue 2: Version tooltip
- [ ] Hover over download/version button
- [ ] Verify tooltip shows "Version 2.1.9" (or current version)
- [ ] Test in both production and dev mode

### Issue 3: Version display in modal
- [ ] Open update modal (click download button)
- [ ] Verify "Current Version" shows full version in white
- [ ] Verify text is readable on dark background

### Issue 4: Update button
- [ ] With update available: Verify "Update Now" button appears
- [ ] In dev mode: Verify informative message about dev mode
- [ ] Click "Check Now" to manually trigger update check

---

## Files Changed

| File | Lines Changed | Description |
|------|---------------|-------------|
| `frontend/src/components/ForgeTerminal.jsx` | ~30 | Revert auto-respond timing |
| `frontend/src/App.jsx` | ~15 | Fix version fetch in dev mode, add isDevMode prop |
| `frontend/src/components/UpdateModal.jsx` | ~15 | Fix version color, add dev mode message |

---

## Rollback Plan

If any issues arise, revert to v2.1.8 or cherry-pick individual fixes:

```bash
# Revert all changes
git revert HEAD

# Or revert specific file
git checkout v2.1.8 -- frontend/src/components/ForgeTerminal.jsx
```
