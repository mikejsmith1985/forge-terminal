# Playwright + Percy Testing Guide

**Last Updated:** 2025-12-13  
**Purpose:** Guide for running visual regression tests with Playwright and Percy

---

## Quick Start

### 1. Run Diagnostic
```bash
./scripts/diagnose-playwright-percy.sh
```

This checks:
- ✓ Forge server status
- ✓ Node.js and NPM installed
- ✓ Playwright installed
- ✓ Chromium browser installed
- ✓ Percy dependencies
- ✓ Display environment (for headed mode)
- ✓ Can launch browser

### 2. Run Tests

**Headless mode (recommended):**
```bash
./scripts/test-with-percy.sh
```

**Headed mode (see browser):**
```bash
./scripts/test-with-percy.sh --headed
```

**With Percy visual comparison:**
```bash
export PERCY_TOKEN=your-token-here
./scripts/test-with-percy.sh --percy
```

**Custom test file:**
```bash
./scripts/test-with-percy.sh --test e2e/my-test.spec.js
```

---

## Understanding the Issue

### Why the Debug App Wasn't Launching

The original Playwright configuration had several issues:

1. **Wrong test directory:** `testDir: './tests/playwright'` but tests were in `./e2e`
2. **Tried to start wrong server:** `command: 'npm run preview'` instead of using existing Forge
3. **Short timeout:** 10 seconds wasn't enough for server checks
4. **Always headless:** No way to enable headed mode for debugging

### The Fix

The updated `playwright.config.js`:
- Points to correct test directory (`./e2e`)
- Expects Forge to already be running
- Uses echo command (doesn't try to start a server)
- Allows headed mode via `HEADED` env var
- Increased timeout to 120 seconds
- Adds screenshot and video capture on failure

---

## Test Script Features

### `test-with-percy.sh`

**Automatic setup:**
- Checks if Forge is running, starts it if needed
- Installs dependencies automatically
- Installs Chromium browser if missing
- Creates real test files
- Cleans up after tests

**Flexible modes:**
- `--headed`: Show browser window (great for debugging)
- `--percy`: Enable Percy visual comparisons
- `--test <file>`: Run specific test file

**Smart cleanup:**
- Stops Forge only if script started it
- Removes test files
- Preserves existing server if already running

---

## Common Scenarios

### Scenario 1: "I want to see what's happening"

```bash
./scripts/test-with-percy.sh --headed
```

This opens a visible browser window so you can watch the test run.

### Scenario 2: "I want to validate visually with Percy"

```bash
export PERCY_TOKEN=your-percy-token
./scripts/test-with-percy.sh --percy
```

Percy captures screenshots and compares them to baselines.

### Scenario 3: "I'm in CI/CD pipeline"

```bash
# In GitHub Actions or similar
./scripts/test-with-percy.sh
```

Runs headless, perfect for automation.

### Scenario 4: "Debug a specific test"

```bash
./scripts/test-with-percy.sh --headed --test e2e/specific-test.spec.js
```

---

## Troubleshooting

### Issue: "Forge is not running"

**Solution:**
```bash
# Terminal 1: Start Forge
./forge

# Terminal 2: Run tests
./scripts/test-with-percy.sh
```

Or let the script start Forge automatically.

### Issue: "Browser won't show (headed mode)"

**Check DISPLAY:**
```bash
echo $DISPLAY
# Should show something like :0 or 127.0.0.1:0.0
```

**For WSL users:**
1. Install X server (VcXsrv, Xming)
2. Start X server on Windows
3. Set DISPLAY:
```bash
export DISPLAY=127.0.0.1:0.0
```

**Fallback: Use headless**
```bash
./scripts/test-with-percy.sh
# Works without display server
```

### Issue: "Chromium not installed"

**Auto-fix:**
```bash
cd frontend
npx playwright install chromium
```

Or run diagnostic which does this automatically.

### Issue: "Percy token not working"

**Check token:**
```bash
echo $PERCY_TOKEN
# Should output your token
```

**Get a token:**
1. Go to https://percy.io
2. Sign up/login
3. Create a project
4. Copy token from project settings

**Set token:**
```bash
export PERCY_TOKEN=your-token-here
```

### Issue: "Tests timeout"

**Increase timeout in playwright.config.js:**
```javascript
export default defineConfig({
  timeout: 120000, // 2 minutes instead of 1
  // ...
});
```

---

## File Structure

```
forge-terminal/
├── scripts/
│   ├── diagnose-playwright-percy.sh   # Diagnostic tool
│   └── test-with-percy.sh             # Test runner
├── frontend/
│   ├── playwright.config.js           # Playwright config (FIXED)
│   ├── e2e/
│   │   └── monaco-editor-percy.spec.js # Percy test
│   └── test-results/                  # Test outputs
├── .percy.yml                         # Percy configuration
└── forge-test.log                     # Forge server logs
```

---

## What Gets Tested

### Monaco Editor Percy Test

**Creates real file:**
```javascript
console.log("Real file test - Monaco Editor Validation");
// Not mock data - actual file on disk
```

**Validates:**
1. ✓ File loaded via API
2. ✓ Monaco editor displays content
3. ✓ Content is editable
4. ✓ Visual rendering correct

**Percy snapshots:**
1. "Monaco Editor - File Loaded" - Initial state
2. "Monaco Editor - After Edit" - After typing

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Visual Regression Tests

on: [push, pull_request]

jobs:
  percy-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd frontend
          npm install
      
      - name: Run Percy tests
        env:
          PERCY_TOKEN: ${{ secrets.PERCY_TOKEN }}
        run: |
          ./scripts/test-with-percy.sh --percy
```

---

## Best Practices

### During Development

1. **Use headed mode for debugging:**
   ```bash
   ./scripts/test-with-percy.sh --headed
   ```

2. **Check logs if tests fail:**
   ```bash
   tail -f forge-test.log
   ```

3. **Review screenshots:**
   ```bash
   ls -la frontend/test-results/
   ```

### In CI/CD

1. **Always use headless mode**
2. **Set Percy token as secret**
3. **Fail build on visual regressions**
4. **Keep test timeout reasonable (60-120s)**

### Writing Tests

1. **Use real data, never mocks**
2. **Wait for elements to be stable**
3. **Capture meaningful Percy snapshots**
4. **Add descriptive test names**

**Good example:**
```javascript
test('should display real file in Monaco editor', async ({ page }) => {
  // Create real file
  const filePath = createRealFile();
  
  // Navigate and wait
  await page.goto('/');
  await page.waitForSelector('.monaco-editor');
  
  // Percy snapshot
  await percySnapshot(page, 'Monaco - Real File Loaded');
});
```

---

## Monitoring Results

### Local Testing

**Check test output:**
```bash
./scripts/test-with-percy.sh
# Look for green ✓ checkmarks
```

**Review artifacts:**
- Screenshots: `frontend/test-results/`
- Videos: `frontend/test-results/` (on failure)
- Logs: `forge-test.log`

### Percy Dashboard

1. Go to https://percy.io
2. Select your project
3. View builds and screenshots
4. Approve or reject visual changes

---

## Summary

### Before (Broken)
- ❌ Debug app wouldn't launch
- ❌ Wrong test directory
- ❌ Wrong server command
- ❌ No way to see browser
- ❌ Complex manual setup

### After (Fixed)
- ✅ Works in headed and headless modes
- ✅ Correct test directory
- ✅ Uses existing Forge server
- ✅ Automatic setup and cleanup
- ✅ Easy to use scripts
- ✅ Percy integration working

### Commands to Remember

```bash
# Diagnostic
./scripts/diagnose-playwright-percy.sh

# Run tests (headless)
./scripts/test-with-percy.sh

# Run tests (see browser)
./scripts/test-with-percy.sh --headed

# Run with Percy
export PERCY_TOKEN=your-token
./scripts/test-with-percy.sh --percy
```

---

**Questions?** Run the diagnostic script first: `./scripts/diagnose-playwright-percy.sh`
