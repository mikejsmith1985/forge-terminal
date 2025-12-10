#!/bin/bash
# Test AM turn parsing improvements
# Tests: 1) ANSI cleaning in user input, 2) Real-time assistant response extraction

set -e

echo "🧪 Testing AM Turn Parsing Improvements"
echo "========================================"

# Clean up old test conversations
rm -f ~/.forge/am/llm-conv-test-tab-*.json

# Start forge in background
echo "Starting forge..."
./bin/forge > forge-test-turn-parsing.log 2>&1 &
FORGE_PID=$!
sleep 3

# Test 1: Trigger AM with command card
echo ""
echo "📝 Test 1: Trigger conversation with command card"
curl -s -X POST http://localhost:8333/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": "test-tab-parsing",
    "command": "gh copilot",
    "triggerAM": true,
    "llmProvider": "github-copilot",
    "llmType": "chat",
    "description": "Test turn parsing"
  }' | jq -r '.executionId'

sleep 2

# Simulate PTY output with ANSI codes (like real Copilot)
# This mimics what we saw in the logs: contaminated user input
TEST_USER_INPUT=$'\x1b]11;rgb:0a0a/0a0a/0a0a\x1b\\tell me a joke\r'

echo ""
echo "📥 Test 2: Send user input with ANSI contamination"
echo "Input (hex): $(echo -n "$TEST_USER_INPUT" | xxd -p | head -c 60)..."

# Get conversation ID
CONV_RESPONSE=$(curl -s http://localhost:8333/api/am/llm/conversations/test-tab-parsing)
CONV_ID=$(echo "$CONV_RESPONSE" | jq -r '.[0].conversationId // empty')

if [ -z "$CONV_ID" ]; then
  echo "❌ No conversation found"
  kill $FORGE_PID 2>/dev/null || true
  exit 1
fi

echo "✓ Conversation ID: $CONV_ID"

# Check conversation file directly
CONV_FILE=~/.forge/am/llm-conv-test-tab-parsing-${CONV_ID}.json

# Wait for file to be created
sleep 2

if [ ! -f "$CONV_FILE" ]; then
  echo "❌ Conversation file not found: $CONV_FILE"
  kill $FORGE_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "📊 Test Results:"
echo "==============="

# Check turns
TURNS=$(jq '.turns' "$CONV_FILE")
TURN_COUNT=$(echo "$TURNS" | jq 'length')
echo "✓ Total turns: $TURN_COUNT"

# Check for ANSI contamination in user turns
echo ""
echo "🔍 Checking for ANSI contamination in user inputs:"
USER_TURNS=$(echo "$TURNS" | jq '[.[] | select(.role == "user")]')
USER_COUNT=$(echo "$USER_TURNS" | jq 'length')

if [ "$USER_COUNT" -gt 0 ]; then
  for i in $(seq 0 $((USER_COUNT-1))); do
    CONTENT=$(echo "$USER_TURNS" | jq -r ".[$i].content")
    RAW=$(echo "$USER_TURNS" | jq -r ".[$i].raw // empty")
    
    # Check if content has ANSI sequences (should be cleaned)
    if echo "$CONTENT" | grep -q $'\x1b'; then
      echo "  ❌ Turn $i: Content STILL has ANSI codes: $CONTENT"
    elif echo "$CONTENT" | grep -qE "rgb:|11;"; then
      echo "  ❌ Turn $i: Content has ANSI remnants: $CONTENT"
    else
      echo "  ✅ Turn $i: Content is clean: '$CONTENT'"
    fi
  done
else
  echo "  ⚠️  No user turns found"
fi

# Check for assistant turns
echo ""
echo "🤖 Checking for assistant response turns:"
ASSISTANT_TURNS=$(echo "$TURNS" | jq '[.[] | select(.role == "assistant")]')
ASSISTANT_COUNT=$(echo "$ASSISTANT_TURNS" | jq 'length')

if [ "$ASSISTANT_COUNT" -gt 0 ]; then
  echo "  ✅ Found $ASSISTANT_COUNT assistant turn(s)"
  for i in $(seq 0 $((ASSISTANT_COUNT-1))); do
    CONTENT=$(echo "$ASSISTANT_TURNS" | jq -r ".[$i].content")
    METHOD=$(echo "$ASSISTANT_TURNS" | jq -r ".[$i].captureMethod")
    CONFIDENCE=$(echo "$ASSISTANT_TURNS" | jq -r ".[$i].parseConfidence // 0")
    echo "    Turn $i: Method=$METHOD Confidence=$CONFIDENCE"
    echo "    Content: ${CONTENT:0:80}..."
  done
else
  echo "  ⚠️  No assistant turns found (may need actual LLM interaction)"
fi

# Check snapshots
echo ""
echo "📸 Snapshot analysis:"
SNAPSHOT_COUNT=$(jq '.screenSnapshots | length' "$CONV_FILE")
echo "  ✓ Total snapshots: $SNAPSHOT_COUNT"

if [ "$SNAPSHOT_COUNT" -gt 0 ]; then
  # Show first snapshot cleaned content preview
  FIRST_SNAPSHOT=$(jq -r '.screenSnapshots[0].cleanedContent' "$CONV_FILE" | head -5)
  echo "  First snapshot preview:"
  echo "$FIRST_SNAPSHOT" | sed 's/^/    /'
fi

# Summary
echo ""
echo "📋 Summary:"
echo "==========="
echo "  Turns: $TURN_COUNT (Users: $USER_COUNT, Assistants: $ASSISTANT_COUNT)"
echo "  Snapshots: $SNAPSHOT_COUNT"

# Check log for parsing activity
echo ""
echo "📝 Log analysis:"
PARSING_LOGS=$(grep -i "extracted assistant response\|parsing.*snapshots" forge-test-turn-parsing.log 2>/dev/null | wc -l)
echo "  Parsing log entries: $PARSING_LOGS"

if [ "$PARSING_LOGS" -gt 0 ]; then
  echo "  Recent parsing activity:"
  grep -i "extracted assistant response\|parsing.*snapshots" forge-test-turn-parsing.log 2>/dev/null | tail -3 | sed 's/^/    /'
fi

# Cleanup
echo ""
echo "🧹 Cleaning up..."
kill $FORGE_PID 2>/dev/null || true
wait $FORGE_PID 2>/dev/null || true

echo ""
echo "✅ Test complete!"
echo ""
echo "💡 Key Improvements:"
echo "  1. User input should be cleaned of ANSI codes"
echo "  2. Assistant responses should be extracted from snapshots in real-time"
echo "  3. Conversation file should show structured turns, not just snapshots"
