#!/bin/bash
# REAL TUI logging validation test
# This test validates if terminal I/O is actually being captured

set -e

echo "🔍 REAL TUI Logging Validation Test"
echo "===================================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Check if forge is running
echo "1. Checking if Forge is running..."
if pgrep -f "bin/forge" > /dev/null; then
    echo -e "${GREEN}✓${NC} Forge is running"
else
    echo -e "${RED}✗${NC} Forge is NOT running. Please start it first with: ./run-dev.sh"
    exit 1
fi
echo ""

# Step 2: Get current log state
echo "2. Capturing current log state..."
LOG_FILE="forge.log"
BASELINE_LINES=$(wc -l < "$LOG_FILE" 2>/dev/null || echo "0")
echo "   Baseline: $BASELINE_LINES lines in $LOG_FILE"
echo ""

# Step 3: Generate KNOWN test input via API
TEST_MESSAGE="TEST_$(date +%s)_REAL_LOGGING_VALIDATION"
echo "3. Test marker: $TEST_MESSAGE"
echo "   This exact string MUST appear in logs if logging works"
echo ""

# Step 4: Check where terminal writes are handled
echo "4. Examining terminal handler code..."
grep -n "LogInput\|LogOutput" internal/terminal/*.go || echo "   No LogInput/LogOutput calls found"
echo ""

# Step 5: Check if AM logger is actually wired up
echo "5. Checking if AM logger exists for any tab..."
TABS_RESPONSE=$(curl -s http://localhost:8333/api/tabs 2>/dev/null || echo "{}")
echo "   Active tabs:"
echo "$TABS_RESPONSE" | jq -r '.tabs[]?.id // empty' | head -5 || echo "   (Could not get tabs)"
echo ""

# Step 6: Check recent log entries
echo "6. Checking recent log activity..."
RECENT_LOGS=$(tail -10 "$LOG_FILE" 2>/dev/null || echo "")
LAST_LOG_TIME=$(echo "$RECENT_LOGS" | grep -oP '^\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}' | tail -1 || echo "NONE")
echo "   Last log timestamp: $LAST_LOG_TIME"
echo "   Current time: $(date '+%Y/%m/%d %H:%M:%S')"
echo ""

# Step 7: Verdict
echo "═══════════════════════════════════════════"
echo "📊 DIAGNOSTIC RESULTS"
echo "═══════════════════════════════════════════"
echo ""

# Calculate time difference
if [ "$LAST_LOG_TIME" != "NONE" ]; then
    LAST_EPOCH=$(date -d "$LAST_LOG_TIME" +%s 2>/dev/null || echo "0")
    NOW_EPOCH=$(date +%s)
    AGE_SECONDS=$((NOW_EPOCH - LAST_EPOCH))
    AGE_MINUTES=$((AGE_SECONDS / 60))
    
    echo "Last log entry: ${AGE_MINUTES} minutes ago"
    echo ""
    
    if [ $AGE_SECONDS -gt 300 ]; then
        echo -e "${RED}❌ LOGGING IS BROKEN${NC}"
        echo ""
        echo "Evidence:"
        echo "  • Logs are stale (>5 minutes old)"
        echo "  • You're actively using the terminal NOW"
        echo "  • No recent entries = no capture happening"
    else
        echo -e "${YELLOW}⚠ POSSIBLY WORKING${NC}"
        echo ""
        echo "Recent activity detected, but need to verify:"
        echo "  • Are conversation logs being written?"
        echo "  • Are terminal I/O events captured?"
    fi
else
    echo -e "${RED}❌ NO LOGS FOUND${NC}"
    echo ""
    echo "The log file has no timestamps at all."
fi

echo ""
echo "═══════════════════════════════════════════"
echo "🔬 NEXT STEPS TO CONFIRM"
echo "═══════════════════════════════════════════"
echo ""
echo "1. In a Forge terminal tab, type this EXACT message:"
echo "   echo '$TEST_MESSAGE'"
echo ""
echo "2. Wait 5 seconds, then run:"
echo "   grep '$TEST_MESSAGE' forge.log"
echo ""
echo "3. If nothing found = Logging is 100% broken"
echo "   If found = Logging works but may need AM integration"
echo ""

# Step 8: Show the actual logging code paths
echo "═══════════════════════════════════════════"
echo "🔍 CODE ANALYSIS"
echo "═══════════════════════════════════════════"
echo ""
echo "Checking if terminal handler actually calls AM logger..."
echo ""

if grep -q "llmLogger.*LogInput\|llmLogger.*LogOutput" internal/terminal/session.go 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Found LogInput/LogOutput calls in session.go"
    grep -n "llmLogger\|LogInput\|LogOutput" internal/terminal/session.go | head -10
else
    echo -e "${RED}✗${NC} NO LogInput/LogOutput calls found in session.go"
    echo ""
    echo "This means terminal I/O is NOT being sent to AM logger!"
fi
