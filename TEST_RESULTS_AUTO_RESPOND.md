# Auto Respond Regression Test Results

**Date:** 2025-12-21
**Status:** ✅ Fixed
**Branch:** fix/auto-respond-regression

## Summary
The auto-respond feature was failing in production despite passing unit tests. Investigation revealed two issues:
1. **Starvation Bug:** The "PERF FIX" introduced an aggressive debounce that cancelled prompt detection checks whenever new data arrived. For CLI tools with spinners or continuous output (even invisible control characters), this caused the detection logic to *never run*.
2. **Test Discrepancy:** The unit tests used a 2000-character buffer and a simplified regex, while production used an 800-character buffer and a complex regex. This masked potential issues.

## Fixes Applied
1. **Starvation Prevention:** Implemented a `maxWait` (1000ms) in `ForgeTerminal.jsx`. If the prompt detection hasn't run for 1 second, the debounce cancellation is skipped, allowing the check to proceed even if new data is arriving.
2. **Test Synchronization:** Updated `promptDetection.test.js` to use the production buffer size (800 chars) and the production ANSI strip regex.
3. **Stress Test:** Added a new test case to verify detection works even when context is pushed out of the 800-char buffer (relying on low-confidence detection, which is now enabled).

## Verification
- **Unit Tests:** 20/20 passed (including new stress test).
- **Logic Check:** The starvation fix ensures `detectCliPrompt` runs at least once per second during active output, guaranteeing that prompts are eventually detected even in noisy environments.

## Files Changed
- `frontend/src/components/ForgeTerminal.jsx` (Fix starvation)
- `frontend/src/utils/promptDetection.test.js` (Sync with production)
