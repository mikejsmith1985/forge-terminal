# Release v1.22.34 - Playwright + Percy Testing Support

**Release Date:** 2025-12-13  
**Status:** ✅ Ready

---

## Overview

Added comprehensive Playwright + Percy testing support with diagnostic and test runner tools. Fixed issue where debug app wouldn't launch during visual regression testing.

---

## Key Changes

### 🔧 Fixed Playwright Configuration
- **File:** `frontend/playwright.config.js`
- Fixed incorrect test directory path (`./tests/playwright` → `./e2e`)
- Changed server configuration to use existing Forge instead of starting new one
- Added support for headed mode (visible browser) via `HEADED` env variable
- Increased timeout from 10 seconds to 120 seconds
- Added screenshot and video capture on test failures

### 🛠️ New Diagnostic Tool
- **File:** `scripts/diagnose-playwright-percy.sh`
- Comprehensive environment checks (8 checks total)
- Auto-fixes common issues (installs browsers, dependencies)
- Tests browser launch capability
- Provides clear error messages and solutions
- Works across different platforms (Linux, WSL, Mac)

### ▶️ New Test Runner
- **File:** `scripts/test-with-percy.sh`
- Auto-starts Forge if not running
- Supports multiple modes:
  - Headless (for CI/CD)
  - Headed (for debugging)
  - Percy enabled (for visual regression)
- Smart cleanup (preserves existing Forge servers)
- Creates real test files for validation
- Full test artifact capture

### 📚 Documentation
- **Quick Start:** `docs/PLAYWRIGHT_PERCY_QUICKSTART.md` (5-minute guide)
- **Complete Guide:** `docs/PLAYWRIGHT_PERCY_GUIDE.md` (comprehensive reference)
- **Summary:** `PLAYWRIGHT_PERCY_FIX_SUMMARY.md` (detailed change log)

---

## Problem Solved

### Before
```
✗ Debug app wouldn't launch
✗ Wrong test directory
✗ Couldn't see browser during testing
✗ Manual setup required
✗ Frequent timeout failures
```

### After
```
✓ Browser launches correctly (headed and headless)
✓ Tests find files in correct directory
✓ Can watch tests run in real browser
✓ Automatic setup and dependency installation
✓ Reliable 120-second timeout
```

---

## Quick Start

### 1. Check Environment
```bash
./scripts/diagnose-playwright-percy.sh
```

### 2. Run Tests

**Headless (for CI):**
```bash
./scripts/test-with-percy.sh
```

**Headed (see browser):**
```bash
./scripts/test-with-percy.sh --headed
```

**With Percy visual comparison:**
```bash
export PERCY_TOKEN=your-token
./scripts/test-with-percy.sh --percy
```

---

## Usage Examples

### Debug a Failing Test
```bash
./scripts/test-with-percy.sh --headed
```
Watch the browser and see exactly where test fails.

### CI/CD Pipeline
```bash
./scripts/test-with-percy.sh
```
Automated testing, perfect for GitHub Actions.

### Visual Regression Testing
```bash
export PERCY_TOKEN=abc123
./scripts/test-with-percy.sh --percy
```
Percy captures screenshots and detects visual changes.

### Test Specific File
```bash
./scripts/test-with-percy.sh --test e2e/my-test.spec.js
```

---

## Technical Details

### Playwright Config Changes
```javascript
// Before: Wrong
{
  testDir: './tests/playwright',
  webServer: { command: 'npm run preview', timeout: 10000 }
}

// After: Correct
{
  testDir: './e2e',
  headless: process.env.HEADED !== 'true',
  webServer: {
    command: 'echo "Using existing Forge server"',
    timeout: 120000,
    reuseExistingServer: true
  }
}
```

### Features Added
- Environment variable support (`HEADED`, `PERCY_TOKEN`)
- Screenshot capture on failure
- Video recording on failure
- Proper cleanup and signal handling
- Browser context management

---

## Files Modified

```
Modified:
  • frontend/playwright.config.js

Created:
  • scripts/diagnose-playwright-percy.sh
  • scripts/test-with-percy.sh
  • docs/PLAYWRIGHT_PERCY_GUIDE.md
  • docs/PLAYWRIGHT_PERCY_QUICKSTART.md
  • PLAYWRIGHT_PERCY_FIX_SUMMARY.md
```

---

## Testing

All changes tested with:
- ✓ Diagnostic tool validates environment
- ✓ Test runner executes successfully
- ✓ Headed mode works (with DISPLAY set)
- ✓ Headless mode works
- ✓ Percy integration ready
- ✓ Auto-cleanup verified

---

## Dependencies

No new production dependencies. Uses existing:
- `@playwright/test` (^1.57.0)
- `@percy/playwright` (^1.0.10)
- `@percy/cli` (optional, for visual comparisons)

---

## Documentation

- **Quick Start:** `docs/PLAYWRIGHT_PERCY_QUICKSTART.md`
- **Full Guide:** `docs/PLAYWRIGHT_PERCY_GUIDE.md`
- **Change Summary:** `PLAYWRIGHT_PERCY_FIX_SUMMARY.md`

---

## Troubleshooting

### Browser won't show (WSL)
1. Install X server (VcXsrv, Xming)
2. `export DISPLAY=127.0.0.1:0.0`

### Chromium not installed
```bash
cd frontend && npx playwright install chromium
```

### Forge not running
Script auto-starts it, or: `./forge`

---

## Next Steps

1. Run diagnostic: `./scripts/diagnose-playwright-percy.sh`
2. Run tests: `./scripts/test-with-percy.sh --headed`
3. Review documentation: `docs/PLAYWRIGHT_PERCY_GUIDE.md`

---

## Version Info

- **Previous Release:** v1.22.33
- **This Release:** v1.22.34
- **Commit:** Check git log
- **Status:** Ready for production

---

## Summary

✅ Playwright + Percy testing fully functional  
✅ Debug app launches correctly  
✅ Diagnostic tool for environment validation  
✅ Comprehensive documentation provided  
✅ Works across platforms (Linux, WSL, Mac)  

**Ready to use:** `./scripts/test-with-percy.sh --headed`

---

**For questions:** See `docs/PLAYWRIGHT_PERCY_GUIDE.md`
