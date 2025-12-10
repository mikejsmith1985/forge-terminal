#!/bin/bash

################################################################################
# validate-real-data.sh
# 
# PURPOSE: Detect when validation is using stale mock/test data instead of
# real production data. This script should be run BEFORE making claims about
# system functionality.
#
# USAGE: ./scripts/validate-real-data.sh [service_name] [data_directory]
#        ./scripts/validate-real-data.sh am ~/.forge/am
#        ./scripts/validate-real-data.sh terminal ~/.forge/terminal
#
# RETURNS: 0 if data is recent/fresh, 1 if data is stale/cached
################################################################################

set -e

SERVICE_NAME="${1:-am}"
DATA_DIR="${2:-./.forge/am}"
FRESHNESS_MINUTES="${3:-60}"  # Data must be modified within last N minutes

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "VALIDATION: Real Data Check for $SERVICE_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if directory exists
if [ ! -d "$DATA_DIR" ]; then
    echo -e "${RED}✗ ERROR: Directory not found: $DATA_DIR${NC}"
    exit 1
fi

# Check if any files exist
file_count=$(find "$DATA_DIR" -type f | wc -l)
if [ "$file_count" -eq 0 ]; then
    echo -e "${RED}✗ ERROR: No files found in $DATA_DIR${NC}"
    echo "   This service may not have captured any data yet."
    exit 1
fi

# Find most recently modified file
most_recent=$(find "$DATA_DIR" -type f -printf '%T@ %p\n' | sort -rn | head -1 | awk '{print $2}')
most_recent_name=$(basename "$most_recent")

# Get its modification time
if command -v stat &> /dev/null; then
    mod_time=$(stat "$most_recent" | grep Modify | awk '{print $2, $3}')
else
    mod_time=$(ls -l "$most_recent" | awk '{print $6, $7, $8}')
fi

echo "📂 Data Directory: $DATA_DIR"
echo "📄 Most Recent File: $most_recent_name"
echo "⏰ Modified: $mod_time"

# Calculate minutes since modification
minutes_ago=$(( ($(date +%s) - $(stat -c %Y "$most_recent" 2>/dev/null || date -r "$most_recent" +%s)) / 60 ))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$minutes_ago" -le "$FRESHNESS_MINUTES" ]; then
    echo -e "${GREEN}✓ PASS: Data is FRESH (${minutes_ago} minutes old)${NC}"
    echo "  This data is likely current and representative."
    echo ""
    return_code=0
else
    echo -e "${RED}✗ FAIL: Data is STALE (${minutes_ago} minutes old)${NC}"
    echo "  Last modification was ${minutes_ago} minutes ago."
    echo ""
    echo "🚨 RED FLAG: This is likely CACHED/MOCK data, not current production data!"
    echo ""
    echo "⚠️  DO NOT make claims about system functionality based on this data."
    echo ""
    echo "Actions to take:"
    echo "  1. Start/restart the service being monitored"
    echo "  2. Perform a test action that should create new data"
    echo "  3. Wait for new files to be created"
    echo "  4. Re-run this validation script"
    echo ""
    return_code=1
fi

# Check if service is actually running (if applicable)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Process Status Check:"
echo ""

case "$SERVICE_NAME" in
    am|activation)
        if pgrep -f "forge.*terminal|copilot" > /dev/null; then
            echo -e "${GREEN}✓ forge/copilot process is RUNNING${NC}"
        else
            echo -e "${YELLOW}⚠ No active forge/copilot process detected${NC}"
            echo "  New logging will not occur until the service starts."
            return_code=1
        fi
        ;;
    terminal)
        if pgrep -f "forge.*terminal" > /dev/null; then
            echo -e "${GREEN}✓ Terminal service is RUNNING${NC}"
        else
            echo -e "${YELLOW}⚠ Terminal service is not running${NC}"
            return_code=1
        fi
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$return_code" -eq 0 ]; then
    echo -e "${GREEN}✓ Validation PASSED - You may proceed with assessment${NC}"
else
    echo -e "${RED}✗ Validation FAILED - DO NOT use this data for validation${NC}"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit "$return_code"
