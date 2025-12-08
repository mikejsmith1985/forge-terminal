#!/bin/bash

# Test AM Output Capture Fix
# This script verifies that LLM output is being captured correctly

echo "🧪 Testing AM Output Capture Fix"
echo "================================"
echo ""

# Kill any existing forge processes
echo "1. Cleaning up old processes..."
pkill -f "bin/forge" 2>/dev/null || true
sleep 2

# Clean old logs
echo "2. Cleaning old logs..."
rm -f forge-test.log 2>/dev/null

# Start forge
echo "3. Starting Forge Terminal..."
./bin/forge > forge-test.log 2>&1 &
FORGE_PID=$!
echo "   Started with PID: $FORGE_PID"
sleep 3

# Check if it started
if ! ps -p $FORGE_PID > /dev/null; then
    echo "❌ Forge failed to start"
    exit 1
fi

echo "✅ Forge started successfully"
echo ""
echo "4. Check the logs for tabID usage:"
echo "   tail -f forge-test.log | grep -i 'tabID\|LLM logger'"
echo ""
echo "5. Open browser and test:"
echo "   - Open http://localhost:8333"
echo "   - Create an AM trigger command card"
echo "   - Launch Copilot and have a conversation"
echo "   - Check logs for 'AddOutput' and 'FlushOutput' calls"
echo ""
echo "6. Verify conversation turns increase:"
echo "   curl -s http://localhost:8333/api/am/llm/conversations/YOUR_TAB_ID | jq"
echo ""
echo "Press Ctrl+C when done testing"
echo ""

# Monitor logs
tail -f forge-test.log | grep --line-buffered -E "(tabID|LLM|AddOutput|FlushOutput|turns=)"

# Cleanup on exit
trap "kill $FORGE_PID 2>/dev/null" EXIT
