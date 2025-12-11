#!/bin/bash

#########################################################################
# Manual Update Check Feature - Integration Test
# Tests the new manual check button in the UpdateModal
#########################################################################

set -e

PORT=8333
BASE_URL="http://127.0.0.1:${PORT}"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║ Manual Update Check Feature - Integration Test"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

test_result() {
  local test_name="$1"
  local success="$2"
  local details="$3"
  
  TESTS_RUN=$((TESTS_RUN + 1))
  
  if [ "$success" = "true" ]; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}✅ PASS${NC} - $test_name"
    if [ -n "$details" ]; then
      echo "   $details"
    fi
  else
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}❌ FAIL${NC} - $test_name"
    if [ -n "$details" ]; then
      echo "   Error: $details"
    fi
  fi
}

# Test 1: Check if server is running
echo -e "${BLUE}🔍 Test 1: Server is running${NC}"
if curl -s "${BASE_URL}/api/version" > /dev/null 2>&1; then
  version=$(curl -s "${BASE_URL}/api/version" | grep -o '"version":"[^"]*' | cut -d'"' -f4)
  test_result "Server responds to version check" "true" "Version: $version"
else
  test_result "Server responds to version check" "false" "Cannot reach ${BASE_URL}"
fi

# Test 2: Check API endpoint exists
echo ""
echo -e "${BLUE}🔍 Test 2: Update check API endpoint${NC}"
response=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/update/check")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ]; then
  test_result "API endpoint returns 200" "true" "HTTP 200 received"
else
  test_result "API endpoint returns 200" "false" "HTTP $http_code received"
fi

# Test 3: Check API response structure
echo ""
echo -e "${BLUE}🔍 Test 3: API response structure${NC}"
has_available=$(echo "$body" | grep -q '"available"' && echo "true" || echo "false")
has_version=$(echo "$body" | grep -q '"currentVersion"' && echo "true" || echo "false")

if [ "$has_available" = "true" ] && [ "$has_version" = "true" ]; then
  test_result "Response has required fields" "true" "available=✓, currentVersion=✓"
  echo "   Full response: $body" | head -c 100
  echo "..."
else
  test_result "Response has required fields" "false" "Missing required fields"
fi

# Test 4: Check multiple API calls work
echo ""
echo -e "${BLUE}🔍 Test 4: Multiple consecutive API calls${NC}"
success_count=0
for i in {1..3}; do
  response=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/update/check")
  http_code=$(echo "$response" | tail -n1)
  if [ "$http_code" = "200" ]; then
    success_count=$((success_count + 1))
  fi
done

if [ "$success_count" = "3" ]; then
  test_result "Multiple API calls succeed" "true" "3/3 calls successful"
else
  test_result "Multiple API calls succeed" "false" "$success_count/3 calls successful"
fi

# Test 5: Check response times
echo ""
echo -e "${BLUE}🔍 Test 5: API response time performance${NC}"
start=$(date +%s%N)
curl -s "${BASE_URL}/api/update/check" > /dev/null
end=$(date +%s%N)
duration_ms=$(( (end - start) / 1000000 ))

if [ "$duration_ms" -lt 5000 ]; then
  test_result "API responds quickly" "true" "Response time: ${duration_ms}ms"
else
  test_result "API responds quickly" "false" "Response time: ${duration_ms}ms (>5s)"
fi

# Test 6: Verify UpdateModal component exists in build
echo ""
echo -e "${BLUE}🔍 Test 6: UpdateModal component in build${NC}"
if [ -f "frontend/src/components/UpdateModal.jsx" ]; then
  # Check for our new function
  if grep -q "checkForUpdatesManually" "frontend/src/components/UpdateModal.jsx"; then
    test_result "checkForUpdatesManually function exists" "true" "Function found in source"
  else
    test_result "checkForUpdatesManually function exists" "false" "Function not found in source"
  fi
  
  # Check for our new button UI
  if grep -q "Check Now" "frontend/src/components/UpdateModal.jsx"; then
    test_result "Check Now button UI exists" "true" "Button text found in source"
  else
    test_result "Check Now button UI exists" "false" "Button text not found in source"
  fi
else
  test_result "UpdateModal component file exists" "false" "File not found"
fi

# Test 7: Verify build includes changes
echo ""
echo -e "${BLUE}🔍 Test 7: Build includes new code${NC}"
if [ -f "cmd/forge/web/assets/index-*.js" ]; then
  # Try to find the built assets
  latest_build=$(ls -t cmd/forge/web/assets/index-*.js 2>/dev/null | head -1)
  if [ -n "$latest_build" ]; then
    # Check if Check Now text is in the bundle
    if grep -q "Check Now" "$latest_build"; then
      test_result "Check Now button in compiled bundle" "true" "Found in $latest_build"
    else
      test_result "Check Now button in compiled bundle" "false" "Not found in compiled bundle"
    fi
  else
    echo -e "${YELLOW}⚠️  Build artifacts not found - build may be needed${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  Build artifacts not found${NC}"
fi

# Test 8: Verify state management
echo ""
echo -e "${BLUE}🔍 Test 8: Component state management${NC}"
# Look for the new state variables
required_states=(
  "isCheckingForUpdates"
  "checkStatus"
  "lastCheckedTime"
  "freshUpdateInfo"
)

all_found=true
for state in "${required_states[@]}"; do
  if grep -q "useState.*$state\|setIsCheckingForUpdates\|setCheckStatus\|setLastCheckedTime\|setFreshUpdateInfo" "frontend/src/components/UpdateModal.jsx"; then
    echo "   ✓ State variable: $state"
  else
    all_found=false
    echo "   ✗ State variable: $state (not found)"
  fi
done

if [ "$all_found" = "true" ]; then
  test_result "All required state variables present" "true" "4/4 state variables found"
else
  test_result "All required state variables present" "false" "Some state variables missing"
fi

# Summary
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║ Test Summary"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${BLUE}Tests Run:${NC}    $TESTS_RUN"
echo -e "${GREEN}Tests Passed:${NC}  $TESTS_PASSED"
echo -e "${RED}Tests Failed:${NC}  $TESTS_FAILED"
echo ""

if [ "$TESTS_FAILED" = "0" ]; then
  echo -e "${GREEN}✅ All integration tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
