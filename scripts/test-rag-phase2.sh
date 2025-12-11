#!/bin/bash

# Phase 2 RAG Testing - Simplified Direct API Test
# This script tests RAG-enhanced responses from the assistant

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULTS_DIR="$PROJECT_DIR/test-results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULTS_FILE="$RESULTS_DIR/rag-phase2-results-$TIMESTAMP.json"

API_BASE="http://localhost:8333/api"

echo "🚀 Phase 2 RAG Testing"
echo "===================="
echo ""

# Check API
if ! curl -s "$API_BASE/assistant/status" > /dev/null 2>&1; then
    echo "❌ Forge API not responding at $API_BASE"
    exit 1
fi

echo "✅ Forge API responding"
echo ""

# Test questions (same as Phase 1)
declare -a TESTS=(
    "How do I enable AM logging in Forge?,right-click,tab,AM Logging,.forge/am"
    "What are the keyboard shortcuts for switching tabs?,Tab,Shift+Tab,Ctrl+Tab,Alt+Tab"
    "How do I use vision detection in the assistant?,Vision,experimental,image,camera"
    "Can I use Forge in WSL and how?,WSL,Windows,shell,integration"
    "What deployment modes are available?,LOCAL,EMBEDDED,CODESPACES,SELF-HOSTED"
    "How do I configure custom themes and colors?,theme,settings,colors,fonts,customize"
    "What is Command Cards and how do I create one?,Command Cards,sidebar,description,command,emoji"
    "How do I troubleshoot connection issues with Forge?,connection,troubleshoot,logs,server,error"
    "What features does the Forge Assistant have?,assistant,chat,context,terminal,commands"
    "What does the Ollama integration provide?,Ollama,model,LLM,local,integration"
    "What is session persistence and how does it work?,session,persistence,tabs,state,restore"
    "How do I use the terminal search feature?,search,Ctrl+F,highlight,terminal,output"
)

PASSED=0
FAILED=0
TOTAL=0

echo "Running tests..."
echo ""

for i in "${!TESTS[@]}"; do
    IFS=',' read -r QUESTION KEYWORDS <<< "${TESTS[$i]}"
    TEST_ID="q$((i+1))"
    
    echo "Test $TEST_ID: $QUESTION"
    
    # Query the assistant
    RESPONSE=$(curl -s -X POST "$API_BASE/assistant/chat" \
        -H "Content-Type: application/json" \
        -d "{\"message\": \"$QUESTION\"}" 2>/dev/null)
    
    if [ -z "$RESPONSE" ]; then
        echo "   ❌ No response"
        ((FAILED++))
        continue
    fi
    
    # Extract response
    ANSWER=$(echo "$RESPONSE" | jq -r '.response // .message // empty' 2>/dev/null || echo "")
    
    if [ -z "$ANSWER" ]; then
        echo "   ❌ Parse error"
        ((FAILED++))
        continue
    fi
    
    # Score by counting keyword matches
    MATCHED=0
    TOTAL_KEYWORDS=0
    
    IFS=',' read -ra KW_ARRAY <<< "$KEYWORDS"
    for kw in "${KW_ARRAY[@]}"; do
        ((TOTAL_KEYWORDS++))
        kw=$(echo "$kw" | xargs)
        if [[ "$ANSWER" =~ $kw ]]; then
            ((MATCHED++))
        fi
    done
    
    SCORE=$((MATCHED * 100 / TOTAL_KEYWORDS))
    
    if [ $SCORE -ge 80 ]; then
        echo "   ✅ PASS ($SCORE%) - $MATCHED/$TOTAL_KEYWORDS keywords"
        ((PASSED++))
    else
        echo "   ❌ FAIL ($SCORE%) - $MATCHED/$TOTAL_KEYWORDS keywords"
        ((FAILED++))
    fi
    
    ((TOTAL++))
    echo ""
done

ACCURACY=$((PASSED * 100 / TOTAL))

echo "=========================================================="
echo "Phase 2 RAG Results"
echo "=========================================================="
echo "Total Tests:        $TOTAL"
echo "Passed:             $PASSED"
echo "Failed:             $FAILED"
echo "Accuracy:           $ACCURACY%"
echo ""
echo "Phase Comparison:"
echo "   Phase 1 (System Prompt): 83.3%"
echo "   Phase 2 (RAG):           $ACCURACY%"
if [ $ACCURACY -gt 83 ]; then
    echo "   ✅ Improvement: +$((ACCURACY - 83))%"
elif [ $ACCURACY -eq 83 ]; then
    echo "   ⚠️  No improvement"
else
    echo "   ⚠️  Regression: -$((83 - ACCURACY))%"
fi

echo ""
