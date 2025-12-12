# Forge Terminal v1.22.8 Release Summary

**Release Date**: 2025-12-12  
**Type**: Performance & Bug Fix  
**Breaking Changes**: None

## 🚀 Headline Fix

### Keyboard Focus Race Condition Eliminated

**Problem**: Users reported keyboard input being "captured but blocked from screen display" - characters typed but not appearing in the terminal.

**Root Cause**: Multiple `queueMicrotask(() => term.focus())` calls during terminal initialization created race conditions, causing focus to be set and stolen multiple times in rapid succession.

**Solution**:
1. **Consolidated focus calls** - Replaced 7+ scattered `queueMicrotask` focus calls with a single `requestAnimationFrame` call after all initialization is complete
2. **Simplified event handlers** - Focus recovery on window/visibility events now uses direct `.focus()` calls instead of nested microtasks
3. **Removed redundant focus calls** - Removed focus calls after addon loads and fit() operations

---

## 📊 Performance Verification

### Playwright Test Results

| Metric | Value | Status |
|--------|-------|--------|
| **Terminal Connection** | 1,778ms | ✅ Fast |
| **Terminal Interactive** | 2,358ms | ✅ Fast |
| **Typing Rate** | 45 chars/sec | ✅ No Lag |
| **Spacebar Input** | Working | ✅ |
| **AM Health** | HEALTHY | ✅ |

### Test Coverage

- `terminal-perf-simple.spec.js` - Terminal startup performance
- `keyboard-performance.spec.js` - Keyboard responsiveness (new)

---

## 📋 Code Changes

### `frontend/src/components/ForgeTerminal.jsx`

**Before (7+ focus calls):**
```jsx
// After fit addon load
queueMicrotask(() => term.focus());

// After search addon load  
queueMicrotask(() => term.focus());

// After terminal.open()
queueMicrotask(() => term.focus());

// After fit()
queueMicrotask(() => term.focus());

// On window focus
queueMicrotask(() => { if (xtermRef.current) xtermRef.current.focus(); });

// On visibility change
queueMicrotask(() => { if (xtermRef.current) xtermRef.current.focus(); });

// On isVisible change
queueMicrotask(() => { if (xtermRef.current) xtermRef.current.focus(); });
```

**After (single consolidated call):**
```jsx
// After all initialization is complete
term.open(terminalRef.current);
xtermRef.current = term;

// PERFORMANCE FIX: Single focus call after all initialization
requestAnimationFrame(() => {
  if (xtermRef.current) {
    xtermRef.current.focus();
  }
});

// Event handlers use direct focus (no microtask nesting)
const handleWindowFocus = () => {
  if (xtermRef.current && isVisible) {
    xtermRef.current.focus();  // Direct call
  }
};
```

---

## 🧪 Testing

### Automated Tests (Playwright)

```
Running 2 tests using 2 workers

✅ keyboard input should be responsive (no lag)
   - Typed 43 chars in 965ms
   - Rate: 45 chars/sec
   - Spacebar working correctly

✅ measure terminal connection time
   - Page loaded: 60ms
   - Terminal UI ready: 276ms
   - Terminal connected: 1778ms
   - Terminal interactive: 2358ms

2 passed (7.0s)
```

### AM System Verification

```json
{
  "status": "HEALTHY",
  "metrics": {
    "conversationsActive": 0,
    "conversationsComplete": 0,
    ...
  }
}
```

---

## 🔄 Backward Compatibility

✅ **No breaking changes**  
✅ **No migration required**  
✅ **AM system unaffected**  
✅ **All existing functionality preserved**

---

## 📥 Upgrade Instructions

```bash
# Download latest binary
curl -LO https://github.com/mikejsmith1985/forge-terminal/releases/download/v1.22.8/forge-[platform]

# Run
./forge-[platform]
```

---

## 🏷️ Commits

1. **9b586bb** - fix: eliminate keyboard focus race conditions causing input lag

---

**Previous Version**: v1.22.7  
**Next Version**: TBD
