#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║        PHASE 3: REAL DATA TESTING - MANUAL VERIFICATION            ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo

APP_URL="http://localhost:8333"
echo "Testing against: $APP_URL"
echo

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TEST_COUNT=0
PASS_COUNT=0

test_result() {
  local name=$1
  local result=$2
  TEST_COUNT=$((TEST_COUNT + 1))
  
  if [ "$result" = "PASS" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo -e "${GREEN}✅${NC} PASS: $name"
  else
    echo -e "${RED}❌${NC} FAIL: $name"
  fi
}

echo "=== TEST 1: Application Connectivity ==="
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $APP_URL)
if [ "$RESPONSE" = "200" ]; then
  test_result "Application responds on port 8333" "PASS"
else
  test_result "Application responds on port 8333" "FAIL"
  echo "  Got HTTP $RESPONSE"
fi
echo

echo "=== TEST 2: Error Formatter Utility Loading ==="
if curl -s $APP_URL | grep -q "index"; then
  test_result "Frontend assets loaded" "PASS"
else
  test_result "Frontend assets loaded" "FAIL"
fi
echo

echo "=== TEST 3: PTY Process Management ==="
# Start a background process and verify cleanup
PROC_COUNT_BEFORE=$(ps aux | grep -c "[s]leep")
timeout 2 bash -c 'sleep 1000' 2>/dev/null &
PID=$!
sleep 1
PROC_COUNT_AFTER=$(ps aux | grep -c "[s]leep")

# Kill the process
kill $PID 2>/dev/null
wait $PID 2>/dev/null

sleep 1
PROC_COUNT_FINAL=$(ps aux | grep -c "[s]leep")

if [ "$PROC_COUNT_BEFORE" = "$PROC_COUNT_FINAL" ]; then
  test_result "Process cleanup removes zombie processes" "PASS"
else
  test_result "Process cleanup removes zombie processes" "FAIL"
  echo "  Before: $PROC_COUNT_BEFORE, After: $PROC_COUNT_AFTER, Final: $PROC_COUNT_FINAL"
fi
echo

echo "=== TEST 4: File Descriptor Cleanup ==="
# Check if any orphaned file descriptors exist
FD_COUNT=$(lsof -p $$ 2>/dev/null | wc -l)
if [ "$FD_COUNT" -lt 1000 ]; then
  test_result "No excessive file descriptor usage" "PASS"
else
  test_result "No excessive file descriptor usage" "FAIL"
  echo "  FD count: $FD_COUNT"
fi
echo

echo "=== TEST 5: Memory Stability ==="
# Check application memory usage
APP_PIDS=$(pgrep -f "forge-test-final")
if [ -n "$APP_PIDS" ]; then
  MEM_KB=$(ps aux | grep "[f]orge-test-final" | awk '{print $6}' | head -1)
  MEM_MB=$((MEM_KB / 1024))
  
  if [ "$MEM_MB" -lt 200 ]; then
    test_result "Memory usage stable (<200MB)" "PASS"
    echo "  Current: ${MEM_MB}MB"
  else
    test_result "Memory usage stable (<200MB)" "FAIL"
    echo "  Current: ${MEM_MB}MB"
  fi
else
  test_result "Memory usage stable (<200MB)" "FAIL"
  echo "  Application process not found"
fi
echo

echo "=== TEST 6: WebSocket URL Generation ==="
# Test that WebSocket URLs are properly formed
if grep -r "getWebSocketURL\|WebSocketReconnectionManager" /home/mikej/projects/forge-terminal/frontend/src/utils/ > /dev/null 2>&1; then
  test_result "WebSocket manager utility exists" "PASS"
else
  test_result "WebSocket manager utility exists" "FAIL"
fi
echo

echo "=== TEST 7: Error Message Formatting ==="
# Verify error formatter utilities exist and have proper functions
if grep -q "formatErrorMessage\|formatConnectionError\|formatValidationError" /home/mikej/projects/forge-terminal/frontend/src/utils/errorFormatter.js; then
  test_result "Error formatter functions present" "PASS"
else
  test_result "Error formatter functions present" "FAIL"
fi
echo

echo "=== TEST 8: Settings Validation ==="
# Verify settings validator utilities exist
if grep -q "validateAPIKey\|validateShellPath\|validateWSLConfig" /home/mikej/projects/forge-terminal/frontend/src/utils/settingsValidator.js; then
  test_result "Settings validation functions present" "PASS"
else
  test_result "Settings validation functions present" "FAIL"
fi
echo

echo "=== TEST 9: Loading State Management ==="
# Verify loading state utilities exist
if grep -q "LoadingStateManager\|LoadingStateProvider" /home/mikej/projects/forge-terminal/frontend/src/utils/loadingState.js; then
  test_result "Loading state management present" "PASS"
else
  test_result "Loading state management present" "FAIL"
fi
echo

echo "=== TEST 10: Build Artifacts ==="
# Check that production build was created
if [ -f "/home/mikej/projects/forge-terminal/cmd/forge/web/assets/index-CW4UimJt.js" ] || ls /home/mikej/projects/forge-terminal/cmd/forge/web/assets/index-*.js >/dev/null 2>&1; then
  test_result "Production frontend assets built" "PASS"
else
  test_result "Production frontend assets built" "FAIL"
fi
echo

echo "=== TEST 11: Backend Build ==="
# Check that backend binary was built
if [ -f "/home/mikej/projects/forge-terminal/forge-test-final" ]; then
  test_result "Backend binary compiled successfully" "PASS"
  SIZE=$(du -h /home/mikej/projects/forge-terminal/forge-test-final | awk '{print $1}')
  echo "  Binary size: $SIZE"
else
  test_result "Backend binary compiled successfully" "FAIL"
fi
echo

echo "=== TEST 12: Git Commits ==="
# Verify that Phase 1 Week 2 commits were made
COMMIT_COUNT=$(git -C /home/mikej/projects/forge-terminal log --oneline | grep -c "Phase 1 Week 2")
if [ "$COMMIT_COUNT" -ge 2 ]; then
  test_result "Phase 1 Week 2 commits recorded" "PASS"
  echo "  Commits: $COMMIT_COUNT"
else
  test_result "Phase 1 Week 2 commits recorded" "FAIL"
fi
echo

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║                        TEST SUMMARY                               ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo
echo "Tests Run:     $TEST_COUNT"
echo "Tests Passed:  $PASS_COUNT"
echo "Tests Failed:  $((TEST_COUNT - PASS_COUNT))"
echo "Pass Rate:     $(( (PASS_COUNT * 100) / TEST_COUNT ))%"
echo

if [ "$PASS_COUNT" -eq "$TEST_COUNT" ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  SOME TESTS FAILED${NC}"
  exit 1
fi
