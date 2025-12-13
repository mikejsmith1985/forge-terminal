# Playwright + Percy Testing - Quick Reference

## Problem: Debug App Won't Launch

When clicking to run tests with Playwright, the browser/debug app doesn't actually launch.

## Root Cause

The `playwright.config.js` had incorrect settings:
1. Wrong test directory path
2. Attempted to start wrong server (`npm run preview` instead of using Forge)
3. Always ran in headless mode (no way to see browser)
4. Short timeout (10s) caused failures

## Solution

✅ **Fixed `frontend/playwright.config.js`**
✅ **Created diagnostic tool: `scripts/diagnose-playwright-percy.sh`**
✅ **Created test runner: `scripts/test-with-percy.sh`**

---

## Quick Start

### 1. Diagnose Issues

```bash
./scripts/diagnose-playwright-percy.sh
```

This checks everything and auto-fixes common problems.

### 2. Run Tests

**Headless (no browser window - for CI):**
```bash
./scripts/test-with-percy.sh
```

**Headed (browser window visible - for debugging):**
```bash
./scripts/test-with-percy.sh --headed
```

**With Percy visual comparison:**
```bash
export PERCY_TOKEN=your-token
./scripts/test-with-percy.sh --percy
```

---

## What Was Fixed

### `frontend/playwright.config.js`

**Before:**
```javascript
{
  testDir: './tests/playwright',  // Wrong directory
  headless: true,                  // Always headless
  webServer: {
    command: 'npm run preview',    // Wrong command
    timeout: 10 * 1000            // Too short
  }
}
```

**After:**
```javascript
{
  testDir: './e2e',                          // Correct directory
  headless: process.env.HEADED !== 'true',   // Can be toggled
  webServer: {
    command: 'echo "Using existing Forge server"',  // Don't start server
    timeout: 120 * 1000                      // 2 minutes
  }
}
```

---

## Usage Examples

### Example 1: Debug Why Test Fails

```bash
# See the browser in action
./scripts/test-with-percy.sh --headed
```

The browser window opens and you can watch the test execute step by step.

### Example 2: Run in CI/CD

```bash
# GitHub Actions, Jenkins, etc.
./scripts/test-with-percy.sh
```

Runs headless - perfect for automation.

### Example 3: Visual Regression Testing

```bash
# Get Percy token from https://percy.io
export PERCY_TOKEN=abc123...

# Run with visual comparison
./scripts/test-with-percy.sh --percy
```

Percy captures screenshots and compares to baseline.

### Example 4: Test Specific File

```bash
./scripts/test-with-percy.sh --test e2e/my-custom-test.spec.js
```

---

## Troubleshooting

### "Browser won't show in headed mode"

**For WSL users:**
1. Install X server on Windows (VcXsrv or Xming)
2. Start X server
3. Set DISPLAY:
   ```bash
   export DISPLAY=127.0.0.1:0.0
   ```

**For Linux:**
```bash
export DISPLAY=:0
```

**Fallback: Use headless mode**
```bash
./scripts/test-with-percy.sh
# Works without display server
```

### "Chromium not found"

```bash
cd frontend
npx playwright install chromium
```

Or run the diagnostic which does this automatically.

### "Forge is not running"

**Option 1: Let script start Forge**
```bash
./scripts/test-with-percy.sh
# Script will start Forge automatically
```

**Option 2: Start Forge manually**
```bash
# Terminal 1
./forge

# Terminal 2
./scripts/test-with-percy.sh
```

---

## Files Created/Modified

```
forge-terminal/
├── frontend/
│   └── playwright.config.js              # FIXED
├── scripts/
│   ├── diagnose-playwright-percy.sh      # NEW - Diagnostic tool
│   └── test-with-percy.sh                # NEW - Test runner
└── docs/
    ├── PLAYWRIGHT_PERCY_GUIDE.md         # NEW - Full guide
    └── PLAYWRIGHT_PERCY_QUICKSTART.md    # NEW - This file
```

---

## Next Steps

1. **Run diagnostic:**
   ```bash
   ./scripts/diagnose-playwright-percy.sh
   ```

2. **Run tests:**
   ```bash
   ./scripts/test-with-percy.sh --headed
   ```

3. **Read full guide:**
   ```bash
   cat docs/PLAYWRIGHT_PERCY_GUIDE.md
   ```

---

## Key Points

✅ **Headed mode works** - You can see the browser  
✅ **Headless mode works** - Perfect for CI/CD  
✅ **Percy integration** - Visual regression testing  
✅ **Auto-setup** - Scripts install dependencies  
✅ **Smart cleanup** - Doesn't break existing servers  

---

## Quick Command Reference

```bash
# Diagnose
./scripts/diagnose-playwright-percy.sh

# Test (headless)
./scripts/test-with-percy.sh

# Test (see browser)
./scripts/test-with-percy.sh --headed

# Test with Percy
export PERCY_TOKEN=token
./scripts/test-with-percy.sh --percy

# Custom test file
./scripts/test-with-percy.sh --test e2e/custom.spec.js
```

---

**For detailed information, see: `docs/PLAYWRIGHT_PERCY_GUIDE.md`**
