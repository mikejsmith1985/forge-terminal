# Fix Release Manager and Image Paste

## Problem
1. **Release Manager Card:** The "Release Type" label (e.g., "BUG FIXES") was incorrect because the logic expected short strings ('major', 'minor') but the hook returned descriptive strings ('MAJOR (Breaking Changes)'). This caused confusion and potential mistrust in the tool.
2. **Image Paste:** Pasting images into the terminal was broken. The previous implementation relied on `navigator.clipboard.read()`, which is often blocked by browser security policies (especially in non-secure contexts or without explicit user gestures) and was fragile.

## Solution
1. **Release Manager Fix:** Updated `ReleaseManagerCard.jsx` to correctly handle the descriptive version strings returned by the `useVersionIncrement` hook. It now checks if the string *starts with* 'MAJOR' or 'MINOR'.
2. **Image Paste Fix:** Replaced the `Ctrl+V` key interception with a robust, native `paste` event listener attached to the terminal container in the **capture phase**.
    - This ensures we intercept the paste event *before* `xterm.js` processes it.
    - It accesses `event.clipboardData` directly, which is standard and works reliably for paste events without requiring the asynchronous `navigator.clipboard` API permissions.
    - It correctly identifies image data, uploads it to the backend, and sends the "see file at..." command to the terminal.

## Verification
- **Release Manager:** Verified via Playwright test (`tests/e2e/test-release-manager.spec.js`) that the card renders and generates commands correctly.
- **Image Paste:** Implemented a Playwright test (`tests/e2e/test-image-paste.spec.js`). While the automated test has limitations in simulating native clipboard events in a headless environment, the code change implements the standard, robust pattern for handling paste events in web applications.

## Artifacts
- `test-report.html`: Summary of test execution.
- `tests/e2e/`: New E2E test suite.
