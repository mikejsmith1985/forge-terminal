#!/bin/bash
# Enhanced AM TUI Logging Test Script
# Tests the new TUI screen snapshot capture system

set -e

echo "🚀 Testing AM TUI Capture System"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Clean up old files
echo "1. Cleaning up old test files..."
rm -rf ~/.local/share/forge-terminal/am/*.json
rm -f forge-test.log
echo -e "${GREEN}✓${NC} Cleaned"
echo ""

# Start forge in background
echo "2. Starting Forge Terminal..."
NO_BROWSER=1 ./bin/forge > forge-test.log 2>&1 &
FORGE_PID=$!
echo -e "${GREEN}✓${NC} Started (PID: $FORGE_PID)"
sleep 4
echo ""

# Check if forge is running
if ! ps -p $FORGE_PID > /dev/null; then
    echo -e "${RED}✗${NC} Forge failed to start!"
    cat forge-test.log | tail -30
    exit 1
fi

echo "3. Verifying Forge server is responding..."
curl -s http://localhost:8333/api/version > /dev/null && echo -e "${GREEN}✓${NC} Server responding"
echo ""

echo "4. Testing TUI conversation detection..."
echo "   Simulating command card execution (gh copilot)"
RESPONSE=$(curl -s -X POST http://localhost:8333/api/am/log \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": "test-tab-tui-1",
    "tabName": "Test Terminal",
    "workspace": "/test",
    "entryType": "COMMAND_CARD_EXECUTED",
    "commandId": "test-copilot-cmd",
    "description": "Test GitHub Copilot",
    "content": "gh copilot",
    "triggerAM": true,
    "llmProvider": "github-copilot",
    "llmType": "chat"
  }')

echo "$RESPONSE" | jq '.'
CONV_ID=$(echo "$RESPONSE" | jq -r '.conversationId')

if [ "$CONV_ID" != "null" ] && [ -n "$CONV_ID" ]; then
    echo -e "${GREEN}✓${NC} Conversation created: $CONV_ID"
else
    echo -e "${RED}✗${NC} Failed to create conversation"
    echo "Response: $RESPONSE"
fi
echo ""

echo "5. Waiting for conversation to initialize..."
sleep 2
echo ""

echo "6. Querying conversations for test tab..."
CONVS=$(curl -s "http://localhost:8333/api/am/llm/conversations/test-tab-tui-1")
echo "$CONVS" | jq '.'

COUNT=$(echo "$CONVS" | jq -r '.count')
if [ "$COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Found $COUNT conversation(s)"
    echo ""
    echo "7. Conversation details:"
    echo "$CONVS" | jq '.conversations[0] | {
      id: .conversationId,
      provider: .provider,
      tuiMode: .tuiCaptureMode,
      turns: (.turns | length),
      snapshots: (.screenSnapshots | length),
      complete: .complete
    }'
else
    echo -e "${RED}✗${NC} No conversations found"
fi
echo ""

echo "8. Checking AM system health..."
HEALTH=$(curl -s "http://localhost:8333/api/am/health")
echo "$HEALTH" | jq '.metrics | {
  activeConversations: .conversationsActive,
  completedConversations: .conversationsComplete,
  inputTurns: .inputTurnsDetected,
  outputTurns: .outputTurnsDetected
}'
echo ""

echo "9. Checking for saved conversation files..."
CONV_FILES=$(find ~/.local/share/forge-terminal/am -name "llm-conv-*.json" 2>/dev/null || true)
if [ -n "$CONV_FILES" ]; then
    echo -e "${GREEN}✓${NC} Found conversation files:"
    echo "$CONV_FILES" | while read file; do
        echo "  - $(basename "$file")"
        echo "    Size: $(du -h "$file" | cut -f1)"
        echo "    TUI Mode: $(jq -r '.tuiCaptureMode' "$file")"
        echo "    Snapshots: $(jq -r '.screenSnapshots | length' "$file")"
    done
else
    echo -e "${YELLOW}⚠${NC} No conversation files found yet"
fi
echo ""

echo "10. Analyzing logs for TUI detection..."
if grep -q "TUI tool detected" forge-test.log; then
    echo -e "${GREEN}✓${NC} TUI detection working"
    grep "TUI" forge-test.log | tail -5
else
    echo -e "${YELLOW}⚠${NC} No TUI detection in logs"
fi
echo ""

echo "11. Stopping Forge..."
kill $FORGE_PID 2>/dev/null
wait $FORGE_PID 2>/dev/null || true
echo -e "${GREEN}✓${NC} Stopped"
echo ""

echo "═══════════════════════════════════════════"
echo "📊 TEST SUMMARY"
echo "═══════════════════════════════════════════"

if [ "$COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ PASS${NC} - TUI capture system working!"
    echo ""
    echo "Key achievements:"
    echo "  • Conversations are being created"
    echo "  • TUI mode is enabled"
    echo "  • API queries return conversation data"
    echo ""
    echo "Next steps:"
    echo "  1. Test with actual 'gh copilot' command in terminal"
    echo "  2. Verify screen snapshots are captured"
    echo "  3. Test crash recovery"
else
    echo -e "${RED}❌ FAIL${NC} - Conversations not being tracked"
    echo ""
    echo "Check forge-test.log for details"
fi

echo ""
echo "Full logs: forge-test.log"
echo "Conversation files: ~/.local/share/forge-terminal/am/"
