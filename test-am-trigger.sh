#!/bin/bash

# Test script for AM Command Card Trigger feature
# Tests that command cards with triggerAM flag start LLM conversations

echo "=========================================="
echo "AM Command Card Trigger - Test Suite"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
pass() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    ((TESTS_FAILED++))
}

info() {
    echo -e "${YELLOW}ℹ INFO:${NC} $1"
}

# Test 1: Check that command struct has new fields
echo "Test 1: Verify Command struct has LLM metadata fields"
if grep -q "LLMProvider" internal/commands/storage.go && grep -q "LLMType" internal/commands/storage.go; then
    pass "Command struct has llmProvider and llmType fields"
else
    fail "Command struct missing LLM metadata fields"
fi
echo ""

# Test 2: Check AppendLogRequest has new fields
echo "Test 2: Verify AppendLogRequest has LLM metadata fields"
if grep -q "LLMProvider" internal/am/logger.go && grep -q "TriggerAM" internal/am/logger.go; then
    pass "AppendLogRequest has triggerAM and LLM metadata fields"
else
    fail "AppendLogRequest missing required fields"
fi
echo ""

# Test 3: Check LLM detector has path patterns
echo "Test 3: Verify LLM detector has path-based fallback patterns"
if grep -q "copilot-path" internal/llm/detector.go && grep -q "claude-path" internal/llm/detector.go; then
    pass "LLM detector has path-based fallback patterns"
else
    fail "LLM detector missing path patterns"
fi
echo ""

# Test 4: Check main.go has inferLLMProvider function
echo "Test 4: Verify main.go has provider inference logic"
if grep -q "inferLLMProvider" cmd/forge/main.go && grep -q "inferLLMType" cmd/forge/main.go; then
    pass "main.go has LLM provider/type inference functions"
else
    fail "main.go missing inference functions"
fi
echo ""

# Test 5: Check migration code exists
echo "Test 5: Verify command migration code exists"
if [ -f "internal/commands/migration.go" ]; then
    if grep -q "MigrateCommands" internal/commands/migration.go; then
        pass "Command migration code exists"
    else
        fail "Migration file exists but missing MigrateCommands function"
    fi
else
    fail "migration.go file not found"
fi
echo ""

# Test 6: Check that handleAMLog triggers conversations
echo "Test 6: Verify handleAMLog starts LLM conversations when triggerAM is true"
if grep -q "llmLogger.StartConversation" cmd/forge/main.go; then
    pass "handleAMLog calls StartConversation for triggerAM requests"
else
    fail "handleAMLog does not start LLM conversations"
fi
echo ""

# Test 7: Verify frontend sends LLM metadata
echo "Test 7: Verify frontend App.jsx sends LLM provider/type"
if grep -q "llmProvider:" frontend/src/App.jsx && grep -q "llmType:" frontend/src/App.jsx; then
    pass "Frontend sends LLM metadata in API calls"
else
    fail "Frontend missing LLM metadata in requests"
fi
echo ""

# Test 8: Verify CommandModal has LLM provider UI
echo "Test 8: Verify CommandModal has LLM provider selection UI"
if grep -q "llmProvider" frontend/src/components/CommandModal.jsx && grep -q "<select" frontend/src/components/CommandModal.jsx; then
    pass "CommandModal has LLM provider selection UI"
else
    fail "CommandModal missing provider selection"
fi
echo ""

# Test 9: Verify toast notification on conversation start
echo "Test 9: Verify frontend shows toast on conversation start"
if grep -q "AM tracking started" frontend/src/App.jsx; then
    pass "Frontend shows toast notification when conversation starts"
else
    fail "Frontend missing toast notification"
fi
echo ""

# Test 10: Binary builds successfully
echo "Test 10: Verify binary builds without errors"
if [ -f "bin/forge" ]; then
    pass "Binary exists at bin/forge"
else
    fail "Binary not found - build may have failed"
fi
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: ${TESTS_PASSED}${NC}"
echo -e "${RED}Failed: ${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run: ./bin/forge"
    echo "2. Edit the Copilot command card (Ctrl+Shift+1)"
    echo "3. Enable 'Trigger AM' checkbox"
    echo "4. Set LLM Provider to 'GitHub Copilot'"
    echo "5. Save and click 'Run'"
    echo "6. Check .forge/am/ for llm-conv-*.json files"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
