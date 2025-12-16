#!/bin/bash
# Test Command Card AM Trigger
# Validates that command cards with triggerAM=true properly start conversations

set -e

echo "🧪 Testing Command Card AM Trigger"
echo "===================================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if forge is running
if ! pgrep -f "bin/forge" > /dev/null; then
    echo -e "${RED}✗${NC} Forge is not running"
    exit 1
fi
echo -e "${GREEN}✓${NC} Forge is running"
echo ""

# Get baseline
BASELINE=$(wc -l < forge-dev.log 2>/dev/null || echo "0")
echo "Baseline: $BASELINE lines in forge-dev.log"
echo ""

# Test command card trigger
echo "Triggering command card with AM enabled..."
RESPONSE=$(curl -s -X POST http://localhost:8333/api/am/log \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": "test-tab-cmd-card",
    "tabName": "Test Terminal",
    "workspace": "/test",
    "entryType": "COMMAND_CARD_EXECUTED",
    "commandId": "copilot-cmd",
    "description": "Run Copilot CLI",
    "content": "copilot",
    "triggerAM": true,
    "llmProvider": "copilot",
    "llmType": "chat"
  }')

echo "Response:"
echo "$RESPONSE" | jq '.'
echo ""

CONV_ID=$(echo "$RESPONSE" | jq -r '.conversationId')

if [ "$CONV_ID" != "null" ] && [ -n "$CONV_ID" ]; then
    echo -e "${GREEN}✓${NC} Conversation started: $CONV_ID"
else
    echo -e "${RED}✗${NC} No conversation ID returned"
    echo ""
    echo "Checking logs for errors..."
    tail -50 forge-dev.log | grep -E "AM API|CRITICAL|ERROR" || echo "No errors found"
    exit 1
fi
echo ""

# Wait for processing
sleep 2

# Check logs for AM trigger
echo "Checking forge-dev.log for AM trigger..."
NEW_LINES=$(tail -n +$((BASELINE + 1)) forge-dev.log)

if echo "$NEW_LINES" | grep -q "COMMAND CARD TRIGGER"; then
    echo -e "${GREEN}✓${NC} Command card trigger detected in logs"
else
    echo -e "${RED}✗${NC} No command card trigger in logs"
fi

if echo "$NEW_LINES" | grep -q "TUI tool detected"; then
    echo -e "${GREEN}✓${NC} TUI mode enabled"
else
    echo -e "${YELLOW}⚠${NC} TUI mode not detected"
fi

if echo "$NEW_LINES" | grep -q "StartConversationFromProcess"; then
    echo -e "${GREEN}✓${NC} Conversation started from process"
else
    echo -e "${YELLOW}⚠${NC} Conversation not started from process"
fi
echo ""

# Verify conversation exists via API
echo "Querying conversations for test tab..."
CONVS=$(curl -s "http://localhost:8333/api/am/llm/conversations/test-tab-cmd-card")
COUNT=$(echo "$CONVS" | jq -r '.count')

if [ "$COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Found $COUNT conversation(s)"
    echo ""
    echo "Conversation details:"
    echo "$CONVS" | jq '.conversations[0] | {
      id: .conversationId,
      provider: .provider,
      tuiMode: .tuiCaptureMode,
      complete: .complete
    }'
else
    echo -e "${RED}✗${NC} No conversations found via API"
fi
echo ""

# Check for saved files
echo "Checking for saved conversation files..."
CONV_FILE=$(find ~/.forge/am -name "llm-conv-*.json" -mmin -1 2>/dev/null | head -1)
if [ -n "$CONV_FILE" ]; then
    echo -e "${GREEN}✓${NC} Found recent conversation file:"
    echo "  $(basename "$CONV_FILE")"
    echo "  TUI Mode: $(jq -r '.tuiCaptureMode' "$CONV_FILE")"
    echo "  Provider: $(jq -r '.provider' "$CONV_FILE")"
else
    echo -e "${YELLOW}⚠${NC} No recent conversation files found"
fi
echo ""

echo "═══════════════════════════════════════════"
if [ "$COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ SUCCESS${NC} - Command card trigger works!"
    echo ""
    echo "Next: Simulate terminal I/O to verify capture"
else
    echo -e "${RED}❌ FAILED${NC} - Command card didn't create conversation"
    echo ""
    echo "Check forge-dev.log for details"
fi
echo "═══════════════════════════════════════════"
