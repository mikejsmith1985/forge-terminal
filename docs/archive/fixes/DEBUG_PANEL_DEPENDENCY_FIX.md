# 🐛 DEBUG PANEL DEPENDENCY FIX

**Issue:** Debug Panel crashed with `ReferenceError: Cannot access 'O' before initialization`

**Root Cause:**
- `isCardExpanded` is a stable callback (wrapped in `useCallback` with empty deps `[]`)
- We incorrectly included it in multiple `useEffect` dependency arrays
- In minified code, this caused hoisting/initialization issues
- React tried to access `isCardExpanded` before `useCallback` initialized it

**Fix:**
Removed `isCardExpanded` from ALL dependency arrays since it's stable and never changes:

```javascript
// BEFORE (❌ BROKEN)
}, [isCardExpanded]);
}, [terminalRef?.wsRef, isCardExpanded]);
}, [captureDiagnostics, fetchFreezeMetrics, measureMemory, measureFPS, isCardExpanded]);

// AFTER (✅ FIXED)
}, []); // isCardExpanded is stable
}, [terminalRef?.wsRef]); // isCardExpanded is stable
}, [captureDiagnostics, fetchFreezeMetrics, measureMemory, measureFPS]); // isCardExpanded is stable
```

**Impact:**
- Debug Panel now loads without crashing
- All monitoring features work correctly
- No more initialization errors

**Files Modified:**
- `frontend/src/components/DebugPanel.jsx` (Lines: 195, 228, 266, 278, 307, 332, 360, 415, 437)

**Build:**
- Frontend rebuilt: January 4, 2026 @ 1:44 PM
- Binary recompiled: `forge-v3.11.5-fixed.exe` (25.1 MB)

---

**Status:** ✅ **FIXED AND VERIFIED**

This was bug #8 discovered during testing!
