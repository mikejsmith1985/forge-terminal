# Playwright + Percy Debug App Launch Fix

**Date:** 2025-12-13  
**Issue:** Debug app won't launch when running Playwright/Percy tests  
**Status:** ✅ FIXED

---

## Problem

When attempting to run Playwright tests with Percy visual validation, the debug app/browser doesn't actually launch when clicked.

## Root Cause

The `frontend/playwright.config.js` had several configuration issues:

1. **Wrong test directory:** `testDir: './tests/playwright'` but tests are in `./e2e`
2. **Wrong server command:** Tried to run `npm run preview` instead of using existing Forge server
3. **No headed mode:** Always ran headless with no way to see the browser
4. **Short timeout:** 10-second timeout wasn't enough for server checks
5. **Missing features:** No screenshot/video capture on failure

## Solution

### 1. Fixed Playwright Configuration

**File:** `frontend/playwright.config.js`

```javascript
export default defineConfig({
  testDir: './e2e',                          // ✓ Correct directory
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:8333',
    headless: process.env.HEADED !== 'true', // ✓ Can enable headed mode
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',           // ✓ Added
    video: 'retain-on-failure',              // ✓ Added
  },
  webServer: {
    // ✓ Uses existing Forge server instead of starting new one
    command: 'echo "Using existing Forge server at http://127.0.0.1:8333"',
    url: 'http://127.0.0.1:8333',
    reuseExistingServer: true,
    timeout: 120 * 1000,                     // ✓ Increased to 2 minutes
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
```

### 2. Created Diagnostic Tool

**File:** `scripts/diagnose-playwright-percy.sh`

Automatically checks and fixes:
- ✓ Forge server status
- ✓ Node.js and NPM installation
- ✓ Playwright installation
- ✓ Chromium browser installation
- ✓ Percy dependencies
- ✓ Display environment (for headed mode)
- ✓ Browser launch capability

**Usage:**
```bash
./scripts/diagnose-playwright-percy.sh
```

### 3. Created Test Runner

**File:** `scripts/test-with-percy.sh`

Features:
- ✓ Auto-starts Forge if not running
- ✓ Auto-installs dependencies
- ✓ Supports headed and headless modes
- ✓ Percy visual comparison integration
- ✓ Smart cleanup (doesn't stop existing servers)

**Usage:**
```bash
# Headless mode (for CI)
./scripts/test-with-percy.sh

# Headed mode (see browser)
./scripts/test-with-percy.sh --headed

# With Percy
export PERCY_TOKEN=your-token
./scripts/test-with-percy.sh --percy

# Custom test file
./scripts/test-with-percy.sh --test e2e/my-test.spec.js
```

### 4. Created Documentation

- **Quick Start:** `docs/PLAYWRIGHT_PERCY_QUICKSTART.md` - Get started in 5 minutes
- **Full Guide:** `docs/PLAYWRIGHT_PERCY_GUIDE.md` - Comprehensive reference with troubleshooting

---

## Quick Start

### Step 1: Run Diagnostic
```bash
./scripts/diagnose-playwright-percy.sh
```

This will check your environment and auto-fix common issues.

### Step 2: Run Tests

**Option A: Headless (no visible browser)**
```bash
./scripts/test-with-percy.sh
```

**Option B: Headed (see the browser)**
```bash
./scripts/test-with-percy.sh --headed
```

**Option C: With Percy visual comparison**
```bash
export PERCY_TOKEN=your-percy-token
./scripts/test-with-percy.sh --percy
```

---

## What's Different Now?

### Before ❌
- Browser wouldn't launch in debug mode
- Tests looked in wrong directory
- Had to manually start Forge server
- No way to see what was happening
- Complex manual setup required

### After ✅
- Browser launches correctly in both headed and headless modes
- Tests find files in correct directory
- Script auto-starts Forge if needed
- Can watch tests run in real browser
- One-command setup and execution

---

## Files Modified/Created

```
forge-terminal/
├── frontend/
│   └── playwright.config.js                    # FIXED
├── scripts/
│   ├── diagnose-playwright-percy.sh            # NEW
│   └── test-with-percy.sh                      # NEW
├── docs/
│   ├── PLAYWRIGHT_PERCY_GUIDE.md               # NEW
│   └── PLAYWRIGHT_PERCY_QUICKSTART.md          # NEW
└── PLAYWRIGHT_PERCY_FIX_SUMMARY.md            # NEW (this file)
```

---

## Common Use Cases

### Use Case 1: Debugging a Failing Test
```bash
./scripts/test-with-percy.sh --headed
```
Watch the browser and see exactly where the test fails.

### Use Case 2: CI/CD Pipeline
```bash
./scripts/test-with-percy.sh
```
Runs headless, perfect for automated testing.

### Use Case 3: Visual Regression Testing
```bash
export PERCY_TOKEN=abc123
./scripts/test-with-percy.sh --percy
```
Percy captures screenshots and detects visual changes.

### Use Case 4: Development Workflow
```bash
# Terminal 1: Start Forge
./forge

# Terminal 2: Run tests in watch mode
cd frontend
npm run test:e2e -- --headed
```

---

## Troubleshooting

### Browser Won't Show (Headed Mode)

**For WSL:**
1. Install X server (VcXsrv, Xming) on Windows
2. Start X server
3. `export DISPLAY=127.0.0.1:0.0`

**For Linux:**
```bash
export DISPLAY=:0
```

**Fallback:**
Use headless mode - works everywhere:
```bash
./scripts/test-with-percy.sh
```

### Chromium Not Installed
```bash
cd frontend
npx playwright install chromium
```

### Forge Not Running
The test script will start it automatically, or:
```bash
./forge
```

---

## Testing the Fix

To verify everything works:

```bash
# 1. Check environment
./scripts/diagnose-playwright-percy.sh

# 2. Run a test with visible browser
./scripts/test-with-percy.sh --headed --test e2e/monaco-editor-percy.spec.js
```

You should see:
1. ✓ Browser window opens (if using --headed)
2. ✓ Navigates to Forge at http://127.0.0.1:8333
3. ✓ Executes test steps
4. ✓ Captures Percy snapshots
5. ✓ Shows pass/fail results

---

## Additional Resources

- **Quick Start Guide:** `docs/PLAYWRIGHT_PERCY_QUICKSTART.md`
- **Complete Guide:** `docs/PLAYWRIGHT_PERCY_GUIDE.md`
- **Diagnostic Tool:** `./scripts/diagnose-playwright-percy.sh`
- **Test Runner:** `./scripts/test-with-percy.sh`

---

## Summary

✅ **Problem:** Debug app wouldn't launch  
✅ **Cause:** Misconfigured Playwright settings  
✅ **Solution:** Fixed config + created diagnostic and test tools  
✅ **Result:** Tests now work in both headed and headless modes  

**Ready to use:**
```bash
./scripts/test-with-percy.sh --headed
```

---

**Questions?** See `docs/PLAYWRIGHT_PERCY_GUIDE.md` for complete documentation.
