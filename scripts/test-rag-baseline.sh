#!/bin/bash

# RAG Baseline Testing (Phase 1 - System Prompt Only)
# Measures accuracy without RAG, just system prompt knowledge
# Creates actual test results with real numbers to compare against Phase 2

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_FILE="$PROJECT_ROOT/test-data/rag-test-questions.json"
RESULTS_DIR="$PROJECT_ROOT/test-results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BASELINE_LOG="$RESULTS_DIR/rag-baseline-$TIMESTAMP.log"
BASELINE_JSON="$RESULTS_DIR/rag-baseline-results-$TIMESTAMP.json"

mkdir -p "$RESULTS_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🧪 RAG BASELINE TESTING (Phase 1 - System Prompt Only)${NC}"
echo "=========================================================="
echo "Test Data: $TEST_FILE"
echo "Results:   $BASELINE_JSON"
echo "Log:       $BASELINE_LOG"
echo "Time:      $(date)"
echo ""

# Check if test data exists
if [ ! -f "$TEST_FILE" ]; then
  echo -e "${RED}❌ Test data file not found: $TEST_FILE${NC}"
  exit 1
fi

# Check if Forge is running (try multiple ports)
echo -e "${YELLOW}Checking prerequisites...${NC}"
FORGE_PORT=8333
if ! curl -s http://localhost:$FORGE_PORT/ > /dev/null 2>&1; then
  # Try default 8080
  FORGE_PORT=8080
  if ! curl -s http://localhost:$FORGE_PORT/ > /dev/null 2>&1; then
    echo -e "${RED}❌ Forge service not running${NC}"
    echo "Start Forge with: ./forge --port 8080"
    exit 1
  fi
fi
echo -e "${GREEN}✅ Forge service running on port $FORGE_PORT${NC}"

# Initialize results JSON
cat > "$BASELINE_JSON" << 'RESULT_TEMPLATE'
{
  "timestamp": "",
  "phase": "Phase 1 - System Prompt Only",
  "total_tests": 0,
  "passed_tests": 0,
  "failed_tests": 0,
  "overall_accuracy": 0,
  "results": []
}
RESULT_TEMPLATE

# Read and process each test question
echo ""
echo -e "${BLUE}Running tests...${NC}"
echo ""

total_tests=0
passed_tests=0
failed_tests=0
temp_results_file=$(mktemp)

jq -r '.tests[] | "\(.id)|\(.question)|\(.expected_keywords | join(","))|\(.difficulty)|\(.category)"' "$TEST_FILE" | while IFS='|' read -r id question keywords difficulty category; do
  total_tests=$((total_tests + 1))
  
  echo "📝 Test $id ($difficulty): $question"
  
  # Send to Forge assistant API
  # Using simple HTTP request
  response=$(curl -s -X POST "http://localhost:$FORGE_PORT/api/assistant/chat" \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"$question\"}" 2>/dev/null | jq -r '.message // empty' || echo "")
  
  if [ -z "$response" ]; then
    echo -e "${RED}   ❌ No response from assistant${NC}"
    echo "$id|0|0|0" >> "$temp_results_file"
  else
    # Count matching keywords in response
    matched_keywords=0
    total_keywords=0
    
    for keyword in $(echo "$keywords" | tr ',' '\n'); do
      total_keywords=$((total_keywords + 1))
      # Case-insensitive match
      if echo "$response" | grep -qi "$(echo "$keyword" | sed 's/[[\.*^$/]/\\&/g')"; then
        matched_keywords=$((matched_keywords + 1))
      fi
    done
    
    # Calculate percentage
    if [ $total_keywords -gt 0 ]; then
      percentage=$((matched_keywords * 100 / total_keywords))
    else
      percentage=0
    fi
    
    # Show result
    if [ $percentage -ge 80 ]; then
      echo -e "${GREEN}   ✅ PASS ($percentage%) - $matched_keywords/$total_keywords keywords matched${NC}"
      passed_tests=$((passed_tests + 1))
      result="PASS"
    else
      echo -e "${RED}   ❌ FAIL ($percentage%) - $matched_keywords/$total_keywords keywords matched${NC}"
      failed_tests=$((failed_tests + 1))
      result="FAIL"
    fi
    
    # Store result: id|score|matched|total
    echo "$id|$percentage|$matched_keywords|$total_keywords|$result|$category|$difficulty" >> "$temp_results_file"
    
    # Show snippet of response
    response_snippet=$(echo "$response" | cut -c1-80 | sed 's/$/.../')
    echo "   Response: $response_snippet"
  fi
  echo ""
done

# Read back results from temp file
exec 3< "$temp_results_file"
result_index=0
test_results_json="[]"

while IFS='|' read -r id score matched total result category difficulty <&3; do
  test_results_json=$(jq --arg id "$id" --arg score "$score" --arg matched "$matched" --arg total "$total" --arg result "$result" --arg category "$category" --arg difficulty "$difficulty" \
    '. += [{"test_id": $id, "score": ($score | tonumber), "matched_keywords": ($matched | tonumber), "total_keywords": ($total | tonumber), "result": $result, "category": $category, "difficulty": $difficulty}]' \
    <<< "$test_results_json")
done

rm -f "$temp_results_file"

# Calculate overall accuracy
overall_accuracy=0
if [ $total_tests -gt 0 ]; then
  overall_accuracy=$((passed_tests * 100 / total_tests))
fi

# Update results JSON
jq --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   --arg total "$total_tests" \
   --arg passed "$passed_tests" \
   --arg failed "$failed_tests" \
   --arg accuracy "$overall_accuracy" \
   --argjson results "$test_results_json" \
   '.timestamp = $timestamp | .total_tests = ($total | tonumber) | .passed_tests = ($passed | tonumber) | .failed_tests = ($failed | tonumber) | .overall_accuracy = ($accuracy | tonumber) | .results = $results' \
   "$BASELINE_JSON" > "$BASELINE_JSON.tmp" && mv "$BASELINE_JSON.tmp" "$BASELINE_JSON"

# Print summary
echo "=========================================================="
echo -e "${BLUE}BASELINE RESULTS (Phase 1)${NC}"
echo "=========================================================="
echo "Total Tests:        $total_tests"
echo -e "Passed (≥80%):      ${GREEN}$passed_tests${NC}"
echo -e "Failed (<80%):      ${RED}$failed_tests${NC}"
echo "Overall Accuracy:   $overall_accuracy%"
echo ""
echo "Results saved to: $BASELINE_JSON"
echo ""

# Show details
echo -e "${BLUE}Test Breakdown:${NC}"
jq -r '.results[] | "\(.test_id): \(.score)% (\(.matched_keywords)/\(.total_keywords)) - \(.result)"' "$BASELINE_JSON"

echo ""
echo "✅ Baseline test complete at $(date)"
echo ""
echo "Next steps:"
echo "1. Review baseline results above"
echo "2. Implement Phase 2 RAG system"
echo "3. Run: bash scripts/test-rag-with-embeddings.sh"
echo "4. Compare results to measure improvement"
