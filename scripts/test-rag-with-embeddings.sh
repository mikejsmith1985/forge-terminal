#!/bin/bash

#
# Phase 2 RAG Testing Script
# Tests Forge Assistant with RAG-enhanced responses
# Compares baseline (Phase 1) vs RAG (Phase 2)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DATA_DIR="$PROJECT_DIR/test-data"
RESULTS_DIR="$PROJECT_DIR/test-results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULTS_FILE="$RESULTS_DIR/rag-with-embeddings-results-$TIMESTAMP.json"

# API Configuration
API_BASE="http://localhost:8333/api"
TIMEOUT=30

echo "🚀 Phase 2 RAG Testing - Embeddings & Vector Search"
echo "=================================================="
echo "Starting at: $(date)"
echo "API: $API_BASE"
echo ""

# Check Forge is running
if ! curl -s "$API_BASE/assistant/status" > /dev/null 2>&1; then
    echo "❌ Forge API not responding at $API_BASE"
    echo "   Start Forge with: ./forge --port 8333"
    exit 1
fi

echo "✅ Forge API responding"
echo ""

# Load test questions
if [ ! -f "$TEST_DATA_DIR/rag-test-questions.json" ]; then
    echo "❌ Test data not found: $TEST_DATA_DIR/rag-test-questions.json"
    exit 1
fi

echo "📝 Loading test questions..."
TEST_COUNT=$(jq '.tests | length' "$TEST_DATA_DIR/rag-test-questions.json")
echo "   Found $TEST_COUNT tests"
echo ""

# Create temp results file
TEMP_RESULTS="$RESULTS_DIR/rag-temp-$TIMESTAMP.txt"
> "$TEMP_RESULTS"

# Helper function to score response
score_response() {
    local response="$1"
    local keywords="$2"
    
    local matched=0
    local total=0
    
    IFS=',' read -ra KEYWORDS <<< "$keywords"
    total=${#KEYWORDS[@]}
    
    for keyword in "${KEYWORDS[@]}"; do
        keyword=$(echo "$keyword" | xargs) # trim whitespace
        if [[ "$response" =~ $keyword ]]; then
            ((matched++))
        fi
    done
    
    local score=$((matched * 100 / total))
    echo "$score:$matched:$total"
}

# Process each test
jq -c '.tests[]' "$TEST_DATA_DIR/rag-test-questions.json" | while IFS= read -r test; do
    TEST_ID=$(echo "$test" | jq -r '.id')
    QUESTION=$(echo "$test" | jq -r '.question')
    KEYWORDS=$(echo "$test" | jq -r '.expected_keywords | join(",")')
    CATEGORY=$(echo "$test" | jq -r '.category')
    DIFFICULTY=$(echo "$test" | jq -r '.difficulty')
    
    echo "📝 Test $TEST_ID ($DIFFICULTY): $QUESTION"
    
    # Send to assistant (with RAG enhancement flag)
    RESPONSE=$(curl -s -X POST "$API_BASE/assistant/chat" \
        -H "Content-Type: application/json" \
        -d "{\"message\": \"$QUESTION\", \"use_rag\": true}" \
        -m $TIMEOUT 2>/dev/null || echo "")
    
    if [ -z "$RESPONSE" ]; then
        echo "   ❌ TIMEOUT - No response from API"
        echo "$TEST_ID:0:0:0:FAIL:$CATEGORY:$DIFFICULTY" >> "$TEMP_RESULTS"
        echo ""
        return
    fi
    
    # Extract assistant message
    ANSWER=$(echo "$RESPONSE" | jq -r '.response // .message // empty' 2>/dev/null || echo "")
    
    if [ -z "$ANSWER" ]; then
        echo "   ❌ PARSE ERROR - Could not extract response"
        echo "$TEST_ID:0:0:0:FAIL:$CATEGORY:$DIFFICULTY" >> "$TEMP_RESULTS"
        echo ""
        return
    fi
    
    # Score the response
    SCORE_DATA=$(score_response "$ANSWER" "$KEYWORDS")
    IFS=':' read -r SCORE MATCHED TOTAL <<< "$SCORE_DATA"
    
    # Determine result
    if [ "$SCORE" -ge 80 ]; then
        RESULT="PASS"
    else
        RESULT="FAIL"
    fi
    
    # Print result
    if [ "$RESULT" = "PASS" ]; then
        echo "   ✅ $RESULT ($SCORE%) - $MATCHED/$TOTAL keywords matched"
    else
        echo "   ❌ $RESULT ($SCORE%) - $MATCHED/$TOTAL keywords matched"
    fi
    
    # Show response preview
    PREVIEW=$(echo "$ANSWER" | head -c 100 | tr '\n' ' ')
    echo "   Response: $PREVIEW..."
    
    # Save test result
    echo "$TEST_ID:$SCORE:$MATCHED:$TOTAL:$RESULT:$CATEGORY:$DIFFICULTY" >> "$TEMP_RESULTS"
    
    echo ""
done

# Calculate statistics from temp results
PASSED=0
FAILED=0
TOTAL_SCORE=0
TOTAL_TESTS=0

while IFS=':' read -r TEST_ID SCORE MATCHED TOTAL RESULT CATEGORY DIFFICULTY; do
    if [ -z "$TEST_ID" ]; then
        continue
    fi
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    TOTAL_SCORE=$((TOTAL_SCORE + SCORE))
    
    if [ "$RESULT" = "PASS" ]; then
        PASSED=$((PASSED + 1))
    else
        FAILED=$((FAILED + 1))
    fi
done < "$TEMP_RESULTS"

# Calculate overall accuracy
if [ $((PASSED + FAILED)) -gt 0 ]; then
    ACCURACY=$((PASSED * 100 / (PASSED + FAILED)))
    AVG_SCORE=$((TOTAL_SCORE / (PASSED + FAILED)))
else
    ACCURACY=0
    AVG_SCORE=0
fi

echo "=========================================================="
echo "PHASE 2 RESULTS (RAG with Embeddings)"
echo "=========================================================="
echo "Total Tests:        $((PASSED + FAILED))"
echo "Passed (≥80%):      $PASSED"
echo "Failed (<80%):      $FAILED"
echo "Overall Accuracy:   $ACCURACY%"
echo "Average Score:      $AVG_SCORE%"
echo ""

# Create results JSON
cat > "$RESULTS_FILE" << EOFHEADER
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "phase": "Phase 2 - RAG with Embeddings",
  "api_endpoint": "$API_BASE",
  "total_tests": $((PASSED + FAILED)),
  "passed_tests": $PASSED,
  "failed_tests": $FAILED,
  "overall_accuracy": $ACCURACY,
  "average_score": $AVG_SCORE,
  "results": [
EOFHEADER

# Add individual test results
FIRST=true
while IFS=':' read -r TEST_ID SCORE MATCHED TOTAL RESULT CATEGORY DIFFICULTY; do
    if [ -z "$TEST_ID" ]; then
        continue
    fi
    
    if [ "$FIRST" = "true" ]; then
        FIRST=false
    else
        echo "," >> "$RESULTS_FILE"
    fi
    
    cat >> "$RESULTS_FILE" << EOFRESULT
    {
      "test_id": "$TEST_ID",
      "score": $SCORE,
      "matched_keywords": $MATCHED,
      "total_keywords": $TOTAL,
      "result": "$RESULT",
      "category": "$CATEGORY",
      "difficulty": "$DIFFICULTY"
    }
EOFRESULT
done < "$TEMP_RESULTS"

# Close results JSON
cat >> "$RESULTS_FILE" << EOFCLOSER
  ],
  "summary": {
    "total_tests": $((PASSED + FAILED)),
    "passed_tests": $PASSED,
    "failed_tests": $FAILED,
    "overall_accuracy": $ACCURACY,
    "average_score": $AVG_SCORE
  }
}
EOFCLOSER

echo "Results saved to: $RESULTS_FILE"
echo ""
echo "📊 Phase Comparison:"
echo "   Phase 1 (System Prompt): 83.3% (10/12)"
echo "   Phase 2 (RAG):           $ACCURACY% ($PASSED/12)"
echo ""

if [ $ACCURACY -gt 83 ]; then
    IMPROVEMENT=$((ACCURACY - 83))
    echo "✅ Phase 2 improved by +$IMPROVEMENT% over Phase 1"
elif [ $ACCURACY -eq 83 ]; then
    echo "⚠️  Phase 2 at same level as Phase 1 (no improvement)"
else
    echo "⚠️  Phase 2 underperformed Phase 1"
fi

echo ""
echo "Next steps:"
echo "1. Review results above"
echo "2. If improvement <5%: Adjust RAG configuration or add more documents"
echo "3. If improvement >=5%: Proceed to Phase 3 (Fine-tuning)"
echo "4. Run: bash scripts/test-accuracy.sh (for full metrics)"

# Cleanup
rm -f "$TEMP_RESULTS"
