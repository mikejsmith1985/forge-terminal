#!/bin/bash
# Test conversation persistence for TUI logging

set -e

echo "=== Testing Conversation Persistence ==="
echo ""

# Clean up any existing test files
echo "1. Cleaning up old test files..."
rm -f .forge/am/llm-conv-test-*.json

# Create a test conversation JSON file
echo "2. Creating test conversation file..."
mkdir -p .forge/am
cat > .forge/am/llm-conv-test-tab-conv-12345.json <<'EOF'
{
  "conversationId": "conv-12345",
  "tabId": "test-tab",
  "provider": "github-copilot",
  "commandType": "chat",
  "startTime": "2025-12-10T19:00:00Z",
  "endTime": "2025-12-10T19:05:00Z",
  "turns": [
    {
      "role": "user",
      "content": "test question",
      "timestamp": "2025-12-10T19:00:01Z",
      "provider": "github-copilot"
    },
    {
      "role": "assistant",
      "content": "test response",
      "timestamp": "2025-12-10T19:00:05Z",
      "provider": "github-copilot"
    }
  ],
  "complete": true,
  "autoRespond": false,
  "tuiCaptureMode": true,
  "screenSnapshots": [
    {
      "timestamp": "2025-12-10T19:00:02Z",
      "sequenceNumber": 1,
      "rawContent": "test raw content",
      "cleanedContent": "test cleaned content"
    }
  ]
}
EOF

echo "✓ Test conversation file created"
ls -lh .forge/am/llm-conv-test-*.json

echo ""
echo "3. Building application..."
make build > /dev/null 2>&1
echo "✓ Build complete"

echo ""
echo "4. Starting forge in background..."
./bin/forge > /tmp/forge-test-persistence.log 2>&1 &
FORGE_PID=$!
echo "✓ Forge started (PID: $FORGE_PID)"

# Wait for server to start
sleep 3

echo ""
echo "5. Testing API endpoint..."
RESPONSE=$(curl -s http://localhost:3333/api/am/llm/conversations/test-tab)
echo "Response: $RESPONSE"

# Check if conversation was loaded
if echo "$RESPONSE" | grep -q "conv-12345"; then
    echo "✅ SUCCESS: Conversation loaded from disk!"
    echo ""
    echo "Response contains:"
    echo "$RESPONSE" | jq '.conversations[] | {id: .conversationId, provider: .provider, turns: (.turns | length), snapshots: (.screenSnapshots | length)}'
else
    echo "❌ FAILED: Conversation not found in response"
    echo "Check logs: tail -50 /tmp/forge-test-persistence.log"
fi

echo ""
echo "6. Cleaning up..."
kill $FORGE_PID 2>/dev/null || true
wait $FORGE_PID 2>/dev/null || true
echo "✓ Forge stopped"

echo ""
echo "=== Test Complete ==="
