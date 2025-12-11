# Percy Visual Validation for Monaco Editor - Integration Guide

**Created:** 2025-12-11  
**Purpose:** Ensure Monaco editor works with real files using Percy visual testing  
**Status:** Ready to use

---

## Quick Start

### 1. Install Percy Dependencies
```bash
cd frontend
npm install --save-dev @percy/cli @percy/playwright
```

### 2. Run Validation
```bash
# In project root:
./scripts/validate-monaco-with-percy.sh
```

### 3. Review Results
- Percy captures 2 screenshots of Monaco editor
- Test reports pass/fail with detailed diagnostics
- Check Percy dashboard for visual diffs (if token is set)

---

## What Gets Validated

### Real File Operations
```
✓ Test creates actual file on disk
✓ File verified with stat command
✓ Content written and readable
✓ File path is real filesystem path
✗ NO mock data used
```

### API Layer
```
✓ File read API called with real path
✓ Response contains actual file content
✓ No 403 Forbidden errors
✓ HTTP 200 OK returned
✓ Response validated for mock indicators
```

### Frontend/Monaco
```
✓ Monaco editor mounts successfully
✓ File content displays in editor
✓ Line numbers visible
✓ Syntax highlighting applied
✓ Editor is interactive and editable
```

### Visual Regression (with Percy)
```
✓ Screenshot 1: File Loaded state
✓ Screenshot 2: After Edit state
✓ Visual regressions detected automatically
✓ Baseline comparisons available
```

---

## File Structure

```
forge-terminal/
├── .percy.yml                                    # Percy config
├── internal/files/handler.go                     # FIX: isPathWithinRoot()
├── scripts/validate-monaco-with-percy.sh         # Test orchestration
└── frontend/
    ├── package.json                              # Percy dependencies added
    └── e2e/
        └── monaco-editor-percy.spec.js           # Playwright test
```

---

## Validation Flow

```
┌─────────────────────────────────────────────────┐
│ 1. Check Forge Running                          │
│    curl http://127.0.0.1:8333                   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 2. Create Real Test File on Disk                │
│    frontend/test-files/monaco-test-*.js         │
│    Content: console.log(...) + comment          │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 3. Verify File Exists                           │
│    stat frontend/test-files/monaco-test-*.js    │
│    head -2 to show content                      │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 4. Test API Directly                            │
│    POST /api/files/read                         │
│    Verify response contains actual file content │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 5. Run Playwright Tests with Percy              │
│    npm run test -- e2e/monaco-editor-percy.js   │
│    Launch browser, load files, capture screenshots
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 6. Percy Snapshots                              │
│    Screenshot 1: Monaco Editor - File Loaded    │
│    Screenshot 2: Monaco Editor - After Edit     │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 7. Cleanup                                      │
│    rm frontend/test-files/monaco-test-*.js      │
│    Generate report with pass/fail status        │
└─────────────────────────────────────────────────┘
```

---

## Expected Output

### Success Case
```
==================================================
Monaco Editor Visual Validation with Percy
==================================================

[1/5] Checking if Forge is running...
✓ Forge is running on http://127.0.0.1:8333

[2/5] Creating test files...
✓ Test file created: frontend/test-files/monaco-validation-test-1702240589.js
✓ File exists on disk
  Content preview:
  console.log("Real file test - Monaco Editor Validation");
  // This file was created at Thu Dec 10 2025...

[3/5] Testing file read API (backend validation)...
  Full path: /home/mikej/projects/forge-terminal/frontend/test-files/...
✓ File API returned real content
✓ No mock data indicators found

[4/5] Running Playwright tests with Percy...
  [Launching browser...]
  ✓ Monaco Editor - Percy Visual Validation
    ✓ should load and display file content in Monaco editor
    ✓ should handle real file paths correctly
    ✓ should display server logs showing successful file operations

[5/5] Cleanup
✓ Test file cleaned up

==================================================
✓ Monaco Editor Validation PASSED

What was validated:
  ✓ Real files loaded from disk (not mock data)
  ✓ File content displayed in Monaco editor
  ✓ Editor is editable (text can be typed)
  ✓ Visual rendering captured with Percy
  ✓ Backend APIs return actual file data

Next steps:
  1. Check Percy dashboard for visual diffs
  2. Review screenshots in Percy:
     - 'Monaco Editor - File Loaded'
     - 'Monaco Editor - After Edit'
  3. Check production logs:
     tail -f ~/.forge/forge.log | grep Files
==================================================
```

### Failure Cases

#### Forge Not Running
```
✗ Forge is not running
Please start Forge with: npm run dev (or ./forge)
```

#### File Not Created
```
✗ Test file was not created
[Check disk space and permissions]
```

#### API Error
```
✗ File API response:
HTTP 403: Access denied: Path is outside allowed directory
[Check backend logs: tail ~/.forge/forge.log]
```

---

## Percy Token Setup

### Get Token
1. Go to https://percy.io
2. Sign up or log in
3. Create a project
4. Copy your Percy token

### Set Environment Variable
```bash
export PERCY_TOKEN=<your-token>
```

### Verify
```bash
echo $PERCY_TOKEN
# Should output your token
```

---

## Troubleshooting

### Issue: "Forge is not running"
```bash
# Terminal 1:
./forge
# OR
npm run dev

# Terminal 2:
./scripts/validate-monaco-with-percy.sh
```

### Issue: "Monaco editor not visible"
```bash
# Check browser console in Playwright for errors
# The test logs detailed diagnostics
# Check server logs:
tail ~/.forge/forge.log | grep -E "Files|Monaco"
```

### Issue: "API returned 403"
```bash
# This means the fix might not be working
# Verify the file was modified:
grep -A5 "UNC path allowed" internal/files/handler.go

# Rebuild:
go build -o forge ./cmd/forge

# Restart Forge and try again
```

### Issue: "Percy token not set"
```bash
# This is OK - tests will run without visual comparisons
# Set token to enable visual regression testing
export PERCY_TOKEN=<your-token>
```

### Issue: "npm: command not found"
```bash
# Make sure you're in frontend directory
cd frontend
npm install
```

---

## Continuous Integration

### Adding to CI/CD Pipeline

In your CI workflow (GitHub Actions, etc.):

```yaml
- name: Run Monaco Editor Validation
  run: |
    export PERCY_TOKEN=${{ secrets.PERCY_TOKEN }}
    ./scripts/validate-monaco-with-percy.sh
```

### Failing the Build on Regression

Percy will automatically fail the build if visual changes are detected:

```bash
# In CI, if Percy reports regressions:
Exit code: 1
Build fails and alerts maintainer
```

---

## Monitoring & Maintenance

### Daily Checks
```bash
# Run validation as smoke test
./scripts/validate-monaco-with-percy.sh
```

### Monitor Percy Dashboard
- Review screenshot diffs
- Approve or reject changes
- Track regressions over time

### Check Production Logs
```bash
# Monitor file operations in production
tail -f ~/.forge/forge.log | grep -E "Files|Monaco"
```

---

## Why This Approach?

### Previous Methods (Don't Work)
- ❌ Unit tests with mocks always pass
- ❌ No visual validation
- ❌ Can't catch rendering bugs
- ❌ "Fixed" claims unverified

### Percy Method (Works Better)
- ✅ Visual screenshots prove feature works
- ✅ Real files, not mocks
- ✅ Automated regression detection
- ✅ Verifiable proof of functionality

---

## Key Validation Rules

1. **No Mock Data**
   - Test creates real files on disk
   - API returns actual file contents
   - No stub/fixture indicators in responses

2. **Visual Proof**
   - Percy captures what user sees
   - Screenshots show file content in Monaco
   - Proves editor is functional

3. **Real User Flow**
   - Test follows actual user workflow
   - Opens file like user would
   - Edits like user would

4. **Automated Regression Detection**
   - Percy compares to baseline
   - Detects visual changes
   - Alerts to potential issues

---

## Summary

```
✓ Code fixed (isPathWithinRoot allows UNC paths)
✓ Compilation succeeds
✓ Tests use real files
✓ Percy captures screenshots
✓ Can't claim success without running validation
✓ Regressions detected automatically

Command to validate:
  ./scripts/validate-monaco-with-percy.sh
```

---

**Questions?** Check the Playwright test output for detailed diagnostics.
