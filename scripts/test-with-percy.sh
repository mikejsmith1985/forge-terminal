#!/bin/bash

# Comprehensive Playwright + Percy Testing Script
# This script properly launches Forge and runs Percy visual tests

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

FORGE_PID=""
CLEANUP_DONE=false

cleanup() {
    if [ "$CLEANUP_DONE" = true ]; then
        return
    fi
    CLEANUP_DONE=true
    
    echo ""
    echo -e "${BLUE}Cleaning up...${NC}"
    
    if [ -n "$FORGE_PID" ] && kill -0 $FORGE_PID 2>/dev/null; then
        echo "  Stopping Forge (PID: $FORGE_PID)..."
        kill $FORGE_PID 2>/dev/null || true
        wait $FORGE_PID 2>/dev/null || true
    fi
    
    # Clean up test files
    rm -rf frontend/test-files/monaco-test-*.js 2>/dev/null || true
    
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

trap cleanup EXIT INT TERM

echo "=================================================="
echo "Playwright + Percy Visual Testing"
echo "=================================================="
echo ""

# Parse arguments
HEADED=false
PERCY_ENABLED=false
TEST_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --headed)
            HEADED=true
            shift
            ;;
        --percy)
            PERCY_ENABLED=true
            shift
            ;;
        --test)
            TEST_FILE="$2"
            shift 2
            ;;
        *)
            TEST_FILE="$1"
            shift
            ;;
    esac
done

# Default test file
if [ -z "$TEST_FILE" ]; then
    TEST_FILE="e2e/monaco-editor-percy.spec.js"
fi

echo -e "${BLUE}Configuration:${NC}"
echo "  Test file: $TEST_FILE"
echo "  Headed mode: $HEADED"
echo "  Percy enabled: $PERCY_ENABLED"
echo ""

# Step 1: Check if Forge is already running
echo -e "${BLUE}[1/5] Checking Forge server...${NC}"
if curl -s http://127.0.0.1:8333 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Forge is already running${NC}"
    echo "  Using existing server"
    FORGE_ALREADY_RUNNING=true
else
    echo "  Starting Forge server..."
    FORGE_ALREADY_RUNNING=false
    
    # Build forge if needed
    if [ ! -f "./forge" ]; then
        echo "  Building Forge..."
        go build -o forge ./cmd/forge
    fi
    
    # Start Forge in background
    ./forge > forge-test.log 2>&1 &
    FORGE_PID=$!
    
    echo "  Forge started (PID: $FORGE_PID)"
    echo "  Waiting for server to be ready..."
    
    # Wait for server to be ready (max 30 seconds)
    for i in {1..30}; do
        if curl -s http://127.0.0.1:8333 > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Forge is ready${NC}"
            break
        fi
        
        if [ $i -eq 30 ]; then
            echo -e "${RED}✗ Forge failed to start within 30 seconds${NC}"
            echo "  Check forge-test.log for errors"
            exit 1
        fi
        
        sleep 1
        echo -n "."
    done
    echo ""
fi

# Step 2: Check dependencies
echo ""
echo -e "${BLUE}[2/5] Checking dependencies...${NC}"
cd frontend

if [ ! -d "node_modules/@playwright/test" ]; then
    echo "  Installing dependencies..."
    npm install
else
    echo -e "${GREEN}✓ Dependencies installed${NC}"
fi

# Check Playwright browsers
if ! npx playwright install --dry-run chromium 2>&1 | grep -q "is already installed"; then
    echo "  Installing Chromium browser..."
    npx playwright install chromium
else
    echo -e "${GREEN}✓ Chromium browser installed${NC}"
fi

# Step 3: Check Percy
echo ""
echo -e "${BLUE}[3/5] Checking Percy setup...${NC}"

if [ "$PERCY_ENABLED" = true ]; then
    if [ -z "$PERCY_TOKEN" ]; then
        echo -e "${YELLOW}⚠ PERCY_TOKEN not set${NC}"
        echo "  Visual comparisons will run locally only"
        echo "  To upload to Percy: export PERCY_TOKEN=<your-token>"
        PERCY_ENABLED=false
    else
        echo -e "${GREEN}✓ Percy token found${NC}"
        
        if [ ! -d "node_modules/@percy/cli" ]; then
            echo "  Installing Percy CLI..."
            npm install --save-dev @percy/cli @percy/playwright
        else
            echo -e "${GREEN}✓ Percy CLI installed${NC}"
        fi
    fi
else
    echo "  Percy disabled (use --percy to enable)"
fi

# Step 4: Create test file
echo ""
echo -e "${BLUE}[4/5] Preparing test environment...${NC}"
mkdir -p test-files
TEST_JS_FILE="test-files/monaco-test-$(date +%s).js"
cat > "$TEST_JS_FILE" << 'EOF'
console.log("Real file test - Monaco Editor Validation");
// This file was created for Playwright + Percy testing
// It validates that Monaco can load and display real files

function testFunction() {
    return "This is a real file, not mock data";
}

// Test timestamp
const created = new Date().toISOString();
EOF

echo -e "${GREEN}✓ Test file created: $TEST_JS_FILE${NC}"

# Step 5: Run tests
echo ""
echo -e "${BLUE}[5/5] Running Playwright tests...${NC}"

# Set environment variables
export HEADED=$HEADED

if [ "$PERCY_ENABLED" = true ]; then
    echo "  Running with Percy visual comparison..."
    npx percy exec -- npx playwright test "$TEST_FILE"
else
    if [ "$HEADED" = true ]; then
        echo "  Running in headed mode (browser visible)..."
        HEADED=true npx playwright test "$TEST_FILE" --headed
    else
        echo "  Running in headless mode..."
        npx playwright test "$TEST_FILE"
    fi
fi

TEST_RESULT=$?

cd - > /dev/null

# Summary
echo ""
echo "=================================================="
if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed${NC}"
    echo ""
    echo "Results:"
    echo "  ✓ Real files loaded and displayed"
    echo "  ✓ Monaco editor functional"
    echo "  ✓ Visual validation complete"
    
    if [ "$PERCY_ENABLED" = true ]; then
        echo ""
        echo "Percy visual comparisons:"
        echo "  Check https://percy.io for visual diffs"
    fi
    
    echo ""
    echo "Test artifacts:"
    echo "  - Screenshots: frontend/test-results/"
    echo "  - Videos (on failure): frontend/test-results/"
    echo "  - Logs: forge-test.log"
else
    echo -e "${RED}✗ Tests failed (exit code: $TEST_RESULT)${NC}"
    echo ""
    echo "Debug information:"
    echo "  - Check frontend/test-results/ for screenshots"
    echo "  - Check forge-test.log for server logs"
    echo "  - Run with --headed to see browser in action"
fi
echo "=================================================="

# Don't cleanup if Forge was already running
if [ "$FORGE_ALREADY_RUNNING" = true ]; then
    FORGE_PID=""
fi

exit $TEST_RESULT
