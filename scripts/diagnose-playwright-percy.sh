#!/bin/bash

# Diagnostic Script for Playwright + Percy Testing
# Helps identify why the debug app won't launch

set -e

echo "=================================================="
echo "Playwright + Percy Diagnostic Tool"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Track issues found
ISSUES_FOUND=0

# 1. Check Forge Server
echo -e "${BLUE}[1/8] Checking Forge Server Status...${NC}"
if curl -s http://127.0.0.1:8333 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Forge is running on http://127.0.0.1:8333${NC}"
else
    echo -e "${RED}✗ Forge is not running${NC}"
    echo "  Fix: Start Forge with './forge' or 'npm run dev'"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 2. Check Node/NPM versions
echo ""
echo -e "${BLUE}[2/8] Checking Node.js and NPM...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js: $NODE_VERSION${NC}"
else
    echo -e "${RED}✗ Node.js not found${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ NPM: $NPM_VERSION${NC}"
else
    echo -e "${RED}✗ NPM not found${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 3. Check Playwright installation
echo ""
echo -e "${BLUE}[3/8] Checking Playwright Installation...${NC}"
cd frontend
if [ -d "node_modules/@playwright/test" ]; then
    PLAYWRIGHT_VERSION=$(npm list @playwright/test 2>/dev/null | grep @playwright/test | awk '{print $2}')
    echo -e "${GREEN}✓ Playwright installed: $PLAYWRIGHT_VERSION${NC}"
else
    echo -e "${RED}✗ Playwright not installed${NC}"
    echo "  Fix: cd frontend && npm install"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# 4. Check Playwright browsers
echo ""
echo -e "${BLUE}[4/8] Checking Playwright Browsers...${NC}"
if npx playwright install --dry-run chromium 2>&1 | grep -q "is already installed"; then
    echo -e "${GREEN}✓ Chromium browser is installed${NC}"
else
    echo -e "${YELLOW}⚠ Chromium browser may not be installed${NC}"
    echo "  Fix: npx playwright install chromium"
    echo "  Running auto-install..."
    npx playwright install chromium
fi

# 5. Check Percy installation
echo ""
echo -e "${BLUE}[5/8] Checking Percy Installation...${NC}"
if [ -d "node_modules/@percy/playwright" ]; then
    PERCY_VERSION=$(npm list @percy/playwright 2>/dev/null | grep @percy/playwright | awk '{print $2}')
    echo -e "${GREEN}✓ Percy Playwright: $PERCY_VERSION${NC}"
else
    echo -e "${YELLOW}⚠ Percy Playwright not installed${NC}"
    echo "  Fix: npm install --save-dev @percy/playwright @percy/cli"
    echo "  Running auto-install..."
    npm install --save-dev @percy/playwright @percy/cli
fi

# 6. Check Percy token
echo ""
echo -e "${BLUE}[6/8] Checking Percy Token...${NC}"
if [ -n "$PERCY_TOKEN" ]; then
    echo -e "${GREEN}✓ PERCY_TOKEN is set${NC}"
    echo "  Visual comparisons will be uploaded to Percy.io"
else
    echo -e "${YELLOW}⚠ PERCY_TOKEN not set${NC}"
    echo "  Tests will run but visual comparisons won't be uploaded"
    echo "  To enable: export PERCY_TOKEN=<your-token>"
fi

# 7. Check display environment
echo ""
echo -e "${BLUE}[7/8] Checking Display Environment...${NC}"
if [ -n "$DISPLAY" ]; then
    echo -e "${GREEN}✓ DISPLAY is set: $DISPLAY${NC}"
    echo "  Headed mode should work"
else
    echo -e "${YELLOW}⚠ DISPLAY not set${NC}"
    echo "  Will use headless mode"
    echo "  For headed mode on Linux: export DISPLAY=:0"
fi

# Check if running in WSL
if grep -qi microsoft /proc/version 2>/dev/null; then
    echo -e "${YELLOW}  ℹ Running in WSL${NC}"
    echo "  For GUI apps, install X server (VcXsrv, Xming) and set DISPLAY"
fi

# 8. Test playwright launch
echo ""
echo -e "${BLUE}[8/8] Testing Playwright Launch...${NC}"
echo "  Creating simple test..."

# Create a minimal config that doesn't use webServer
cat > /tmp/playwright-diagnostic-config.js << 'EOF'
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  use: {
    headless: true,
  },
  webServer: undefined, // Don't use webServer for diagnostic
});
EOF

cat > /tmp/playwright-diagnostic-test.js << 'EOF'
const { test, expect } = require('@playwright/test');

test('basic browser launch test', async ({ browser }) => {
  console.log('[Diagnostic] Creating browser context...');
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('[Diagnostic] Navigating to example.com...');
  await page.goto('https://example.com');
  console.log('[Diagnostic] Page loaded');
  
  const title = await page.title();
  console.log(`[Diagnostic] Page title: ${title}`);
  
  expect(title).toBeTruthy();
  console.log('[Diagnostic] ✓ Test passed');
  
  await context.close();
});
EOF

echo "  Running basic browser test..."
if npx playwright test /tmp/playwright-diagnostic-test.js --config /tmp/playwright-diagnostic-config.js 2>&1 | grep -q "1 passed"; then
    echo -e "${GREEN}✓ Playwright can launch browser${NC}"
else
    echo -e "${YELLOW}⚠ Trying with explicit browser install...${NC}"
    npx playwright install chromium --with-deps 2>&1 | tail -5
    
    if npx playwright test /tmp/playwright-diagnostic-test.js --config /tmp/playwright-diagnostic-config.js 2>&1 | grep -q "1 passed"; then
        echo -e "${GREEN}✓ Playwright works after browser install${NC}"
    else
        echo -e "${RED}✗ Playwright test failed${NC}"
        echo "  This might be a system dependency issue"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

rm -f /tmp/playwright-diagnostic-test.js /tmp/playwright-diagnostic-config.js

cd - > /dev/null

# Summary and recommendations
echo ""
echo "=================================================="
echo "Diagnostic Summary"
echo "=================================================="

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed${NC}"
    echo ""
    echo "Ready to run tests. Choose a mode:"
    echo ""
    echo "1. Headless mode (recommended for automation):"
    echo "   cd frontend && npm run test:e2e e2e/monaco-editor-percy.spec.js"
    echo ""
    echo "2. Headed mode (for debugging):"
    echo "   cd frontend && npm run test:e2e e2e/monaco-editor-percy.spec.js -- --headed"
    echo ""
    echo "3. With Percy visual comparison:"
    echo "   export PERCY_TOKEN=<your-token>"
    echo "   cd frontend && npx percy exec -- npm run test:e2e e2e/monaco-editor-percy.spec.js"
    echo ""
else
    echo -e "${RED}✗ Found $ISSUES_FOUND issue(s)${NC}"
    echo ""
    echo "Fix the issues above and run this diagnostic again"
fi

echo "=================================================="
echo ""

# Provide quick fix commands
if [ $ISSUES_FOUND -gt 0 ]; then
    echo "Quick Fix Commands:"
    echo "-------------------"
    echo "# Install dependencies"
    echo "cd frontend && npm install"
    echo ""
    echo "# Install Playwright browsers"
    echo "cd frontend && npx playwright install chromium"
    echo ""
    echo "# Install Percy (optional)"
    echo "cd frontend && npm install --save-dev @percy/playwright @percy/cli"
    echo ""
    echo "# Set Percy token (optional)"
    echo "export PERCY_TOKEN=<your-token-from-percy.io>"
    echo ""
fi

exit $ISSUES_FOUND
