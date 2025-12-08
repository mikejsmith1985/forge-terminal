#!/bin/bash

# Ultra-Robust AM Logging Test Script
# Tests all LLM conversation tracking paths with detailed validation

set -e

FORGE_LOG="forge.log"
TEST_LOG="test-am-robust-$(date +%Y%m%d-%H%M%S).log"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     Ultra-Robust AM Logging - Diagnostic Test Suite          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Function to check log for pattern
check_log() {
    local pattern="$1"
    local description="$2"
    local should_exist="${3:-true}"
    
    if [ "$should_exist" = "true" ]; then
        if tail -100 "$FORGE_LOG" | grep -q "$pattern"; then
            echo "✅ PASS: $description"
            return 0
        else
            echo "❌ FAIL: $description"
            echo "   Pattern not found: $pattern"
            return 1
        fi
    else
        if tail -100 "$FORGE_LOG" | grep -q "$pattern"; then
            echo "❌ FAIL: $description (should NOT exist)"
            return 1
        else
            echo "✅ PASS: $description (correctly not found)"
            return 0
        fi
    fi
}

# Function to extract value from log
extract_from_log() {
    local pattern="$1"
    tail -100 "$FORGE_LOG" | grep "$pattern" | tail -1 | sed -n "s/.*$pattern\([^'\" ]*\).*/\1/p"
}

echo "Test Setup:"
echo "  Log file: $FORGE_LOG"
echo "  Test log: $TEST_LOG"
echo ""

# Capture initial log position
LOG_START=$(wc -l < "$FORGE_LOG" 2>/dev/null || echo 0)
echo "Initial log position: $LOG_START lines"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "TEST 1: Command Card Trigger Path"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Simulating command card execution via API..."

TAB_ID="test-tab-$(date +%s)"
echo "Test Tab ID: $TAB_ID"

# Simulate command card trigger
RESPONSE=$(curl -s -X POST http://localhost:3000/api/am/log \
  -H "Content-Type: application/json" \
  -d "{
    \"tabId\": \"$TAB_ID\",
    \"tabName\": \"Test Terminal\",
    \"workspace\": \"/test\",
    \"entryType\": \"COMMAND_CARD_EXECUTED\",
    \"content\": \"copilot\",
    \"description\": \"Test Copilot Command\",
    \"triggerAM\": true,
    \"llmProvider\": \"copilot\"
  }")

echo "API Response: $RESPONSE"
echo ""

# Wait for logs to flush
sleep 2

echo "Checking logs for command card trigger flow..."
echo ""

check_log "COMMAND CARD TRIGGER" "1.1: API endpoint received triggerAM request"
check_log "triggerAM=true" "1.2: TriggerAM flag recognized"
check_log "AM System exists" "1.3: AM System is available"
check_log "LLM Logger exists" "1.4: LLM Logger created/retrieved"
check_log "Provider inference" "1.5: Provider inference executed"
check_log "Calling StartConversation" "1.6: StartConversation called"
check_log "StartConversation returned: convID=" "1.7: Conversation ID returned"
check_log "GetConversations() returned" "1.8: Conversations retrieved"
check_log "Active conversation ID:" "1.9: Active conversation verified"

echo ""

# Extract conversation ID if available
CONV_ID=$(extract_from_log "convID='")
if [ -n "$CONV_ID" ]; then
    echo "Extracted Conversation ID: $CONV_ID"
else
    echo "⚠️  WARNING: Could not extract conversation ID from logs"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "TEST 2: LLM Logger Internal State"
echo "════════════════════════════════════════════════════════════════"
echo ""

check_log "START CONVERSATION" "2.1: StartConversation function entered"
check_log "Generated new conversation ID:" "2.2: Conversation ID generated"
check_log "Created conversation struct" "2.3: Conversation struct created"
check_log "Adding conversation to map" "2.4: Adding to internal map"
check_log "Conversation added to map" "2.5: Successfully added to map"
check_log "Setting active conversation ID" "2.6: Setting active conversation"
check_log "Active conversation set" "2.7: Active conversation confirmed"
check_log "Saving conversation to disk" "2.8: Saving to disk initiated"
check_log "Conversation saved" "2.9: Disk save completed"
check_log "Publishing LLM_START event" "2.10: Event bus notification"
check_log "CONVERSATION STARTED SUCCESSFULLY" "2.11: Full conversation startup success"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "TEST 3: Health Monitor Integration"
echo "════════════════════════════════════════════════════════════════"
echo ""

check_log "EVENT RECEIVED" "3.1: Health Monitor received event"
check_log "Type: LLM_START" "3.2: Event type is LLM_START"
check_log "LLM_START: Total started=" "3.3: Conversation count incremented"
check_log "Active conversations:" "3.4: Active count tracked"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "TEST 4: API Conversation Retrieval"
echo "════════════════════════════════════════════════════════════════"
echo ""

echo "Querying API for conversations..."
CONV_RESPONSE=$(curl -s "http://localhost:3000/api/am/llm/conversations/$TAB_ID")
echo "API Response: $CONV_RESPONSE"
echo ""

CONV_COUNT=$(echo "$CONV_RESPONSE" | grep -o '"count":[0-9]*' | cut -d: -f2)
echo "Conversation count from API: $CONV_COUNT"
echo ""

if [ "$CONV_COUNT" = "0" ]; then
    echo "❌ CRITICAL: API returned 0 conversations!"
    echo ""
    echo "Checking logs for retrieval path..."
    check_log "GET /api/am/llm/conversations/" "4.1: API endpoint called"
    check_log "Retrieved LLM logger for tab" "4.2: Logger retrieved"
    check_log "GetConversations() returned" "4.3: GetConversations called"
    check_log "ZERO conversations found" "4.4: Zero count logged" true
    
    echo ""
    echo "🔍 ROOT CAUSE ANALYSIS:"
    echo "  The conversation was started but not retrieved."
    echo "  Possible causes:"
    echo "    1. Different tab ID used for retrieval vs creation"
    echo "    2. Conversation map not persisting between calls"
    echo "    3. Logger instance not shared correctly"
    echo "    4. Race condition in conversation storage"
    
elif [ "$CONV_COUNT" -gt 0 ]; then
    echo "✅ SUCCESS: API returned $CONV_COUNT conversation(s)!"
    check_log "Found [0-9]* conversations:" "4.1: Conversations found in logs"
else
    echo "⚠️  WARNING: Could not parse conversation count"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "TEST 5: Terminal Command Detection Path"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Note: This test requires manual terminal input or integrated test"
echo "Checking for recent detection logs..."
echo ""

if tail -200 "$FORGE_LOG" | grep -q "LLM Detector.*DETECTION START"; then
    echo "✅ Found recent detection activity"
    check_log "DETECTION START" "5.1: Detector invoked"
    check_log "Testing.*patterns" "5.2: Pattern matching initiated"
    check_log "MATCH.*pattern=" "5.3: Pattern matched" false
else
    echo "ℹ️  No recent detection activity found (expected if using command cards only)"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Save detailed logs
echo "Saving detailed logs to $TEST_LOG..."
tail -200 "$FORGE_LOG" > "$TEST_LOG"

echo ""
echo "Key Findings:"
echo "  - Command card trigger: $(check_log 'COMMAND CARD TRIGGER' '' && echo 'WORKING' || echo 'FAILING')"
echo "  - Conversation creation: $(check_log 'CONVERSATION STARTED SUCCESSFULLY' '' && echo 'WORKING' || echo 'FAILING')"
echo "  - Health monitoring: $(check_log 'LLM_START: Total started=' '' && echo 'WORKING' || echo 'FAILING')"
echo "  - API retrieval: $([ "$CONV_COUNT" -gt 0 ] && echo 'WORKING' || echo 'FAILING')"
echo ""

if [ "$CONV_COUNT" -gt 0 ]; then
    echo "🎉 OVERALL RESULT: SUCCESS - Logging system is fully operational"
    echo ""
    echo "✅ All major paths working correctly"
    echo "✅ Conversations being created and tracked"
    echo "✅ Ultra-robust logging providing complete visibility"
    exit 0
else
    echo "⚠️  OVERALL RESULT: PARTIAL - System has gaps"
    echo ""
    echo "The ultra-robust logging has revealed the issue:"
    echo "Review $TEST_LOG for detailed analysis"
    echo ""
    echo "Next steps:"
    echo "  1. Check if tab IDs match between creation and retrieval"
    echo "  2. Verify logger instance sharing across requests"
    echo "  3. Review conversation map persistence"
    exit 1
fi
