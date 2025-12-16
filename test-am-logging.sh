#!/bin/bash
# Test script to verify AM LLM logging works

echo "🔍 Testing AM LLM Logging System"
echo "================================"
echo ""

# Clean up old test files
echo "1. Cleaning up old test files..."
rm -f .forge/am/llm-conv-*.json
echo "   ✓ Cleaned"
echo ""

# Start forge in background
echo "2. Starting Forge Terminal..."
NO_BROWSER=1 ./bin/forge > forge-test.log 2>&1 &
FORGE_PID=$!
echo "   ✓ Started (PID: $FORGE_PID)"
sleep 3
echo ""

# Check if forge is running
if ! ps -p $FORGE_PID > /dev/null; then
    echo "   ✗ Forge failed to start!"
    cat forge-test.log
    exit 1
fi

echo "3. Checking server logs for startup..."
grep -i "forge terminal starting" forge-test.log
echo ""

echo "4. Testing API endpoint..."
echo "   Checking /api/am/llm/conversations/test-tab"
curl -s http://localhost:8333/api/am/llm/conversations/test-tab | jq '.'
echo ""

echo "5. Checking for LLM conversation files..."
ls -lh .forge/am/llm-conv-*.json 2>/dev/null || echo "   No LLM conversation files found"
echo ""

echo "6. Stopping Forge..."
kill $FORGE_PID 2>/dev/null
wait $FORGE_PID 2>/dev/null
echo "   ✓ Stopped"
echo ""

echo "7. Showing last 50 lines of logs:"
echo "================================"
tail -50 forge-test.log | grep -E "\[Terminal\]|\[LLM Logger\]" || echo "No relevant logs found"
echo ""

echo "✅ Test complete. Check forge-test.log for full output."
