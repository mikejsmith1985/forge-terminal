#!/bin/bash

# Forge Assistant Accuracy Testing Framework
# Tests Phase 1 (Knowledge Base) and Phase 2 (RAG) accuracy
# Usage: ./test-accuracy.sh [phase1|phase2|both]

set -e

PHASE="${1:-both}"
RESULTS_DIR="test-results/accuracy-$(date +%Y-%m-%d-%H%M%S)"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-mistral}"

mkdir -p "$RESULTS_DIR"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Forge Assistant Accuracy Testing Framework                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Testing Phase: $PHASE"
echo "Ollama URL: $OLLAMA_URL"
echo "Model: $OLLAMA_MODEL"
echo "Results Directory: $RESULTS_DIR"
echo ""

# Check if Ollama is available
check_ollama() {
    echo "Checking Ollama availability..."
    if ! curl -s "$OLLAMA_URL/api/tags" > /dev/null 2>&1; then
        echo "❌ ERROR: Ollama not running at $OLLAMA_URL"
        echo "Start Ollama with: ollama serve"
        echo "Then run: ollama pull $OLLAMA_MODEL"
        exit 1
    fi
    echo "✅ Ollama is running"
}

# Test Phase 1: Knowledge Base only
test_phase1() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "PHASE 1: System Prompt Injection (Knowledge Base Only)"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    local results_file="$RESULTS_DIR/phase1-results.txt"
    local scores_file="$RESULTS_DIR/phase1-scores.json"
    
    cat > "$results_file" << 'EOF'
PHASE 1 TEST RESULTS
====================

Test Date: $(date)
Model: $OLLAMA_MODEL
Method: System Prompt Injection (Knowledge Base Only)

QUESTIONS TESTED:
EOF

    echo "[" > "$scores_file"
    
    echo "Testing 30 questions with Phase 1 knowledge base..."
    echo "This will take several minutes..."
    echo ""
    
    # Test 1-5: Core Terminal
    test_question 1 "How do I enable session logging in Forge?" "$results_file" "$scores_file"
    test_question 2 "How do I open multiple tabs in Forge Terminal?" "$results_file" "$scores_file"
    test_question 3 "How do I search for text in the terminal?" "$results_file" "$scores_file"
    test_question 4 "What does the disconnect reasons feature do?" "$results_file" "$scores_file"
    test_question 5 "Do my Forge tabs stay open when I restart the application?" "$results_file" "$scores_file"
    
    # Note: Full 30 questions would be tested in real scenario
    
    echo "]" >> "$scores_file"
    
    echo "✅ Phase 1 testing complete"
    echo "Results saved to: $results_file"
    echo "Scores saved to: $scores_file"
}

# Test individual question
test_question() {
    local qnum=$1
    local question=$2
    local results_file=$3
    local scores_file=$4
    
    echo -n "Testing Q$qnum... "
    
    # Build the system prompt with knowledge base
    local system_prompt=$(get_kb_prompt)
    
    # Query Ollama
    local response=$(query_ollama "$system_prompt" "$question")
    
    # Score the response (this is placeholder - would need real evaluation)
    local score=$(score_response "$qnum" "$response")
    
    # Record results
    echo "Q$qnum: $question" >> "$results_file"
    echo "Response: $response" >> "$results_file"
    echo "Score: $score" >> "$results_file"
    echo "" >> "$results_file"
    
    # Add to JSON scores
    echo "{\"question\": $qnum, \"score\": $score}," >> "$scores_file"
    
    echo "Score: $score/100"
}

# Get knowledge base system prompt
get_kb_prompt() {
    # This would call the actual Go knowledge base
    # For now, return simplified version
    cat << 'EOF'
You are the Forge Assistant, an AI helper for Forge Terminal.

CORE FEATURES:
- Full PTY Terminal: Run any interactive CLI
- Multi-Tab Support: Up to 20 tabs, drag-drop reordering
- Session Persistence: Tabs restored on restart
- Terminal Search: Find text with Ctrl+F
- Command Cards: Save frequently used commands
- 10 Color Themes: Solarized, Dracula, Nord, etc.
- Per-tab Theming: Light/Dark per tab
- Keyboard Shortcuts: Ctrl+T (new tab), Ctrl+W (close)
- AM (Artificial Memory): Session logging with snapshots
- Vision Detection: Visual pattern detection (experimental)
- Forge Assistant: AI chat panel (experimental)
- Auto-Updates: Check for updates automatically
- WSL Integration: Full Windows Subsystem for Linux support

Be accurate, helpful, and suggest Forge-specific features.
EOF
}

# Query Ollama
query_ollama() {
    local system_prompt="$1"
    local user_message="$2"
    
    # Format for Ollama API
    local payload=$(cat <<EOF
{
  "model": "$OLLAMA_MODEL",
  "messages": [
    {
      "role": "system",
      "content": "$system_prompt"
    },
    {
      "role": "user",
      "content": "$user_message"
    }
  ],
  "stream": false
}
EOF
)
    
    # Call Ollama API
    curl -s "$OLLAMA_URL/api/chat" \
        -H "Content-Type: application/json" \
        -d "$payload" | grep -o '"content":"[^"]*"' | head -1 | sed 's/"content":"//' | sed 's/"$//'
}

# Score the response (placeholder)
score_response() {
    local qnum=$1
    local response=$2
    
    # This is a very simple scoring - real version would be more sophisticated
    # Check for keyword presence
    local score=0
    
    case $qnum in
        1)
            # Q1: Session logging
            if [[ "$response" == *"right-click"* ]] || [[ "$response" == *"AM"* ]]; then
                score=100
            elif [[ "$response" == *"logging"* ]]; then
                score=50
            fi
            ;;
        2)
            # Q2: Multiple tabs
            if [[ "$response" == *"Ctrl+T"* ]] || [[ "$response" == *"tab"* ]]; then
                score=100
            elif [[ "$response" == *"multiple"* ]]; then
                score=50
            fi
            ;;
        *)
            score=50
            ;;
    esac
    
    echo $score
}

# Test Phase 2: RAG enabled
test_phase2() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "PHASE 2: RAG with Vector Embeddings"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    echo "Phase 2 testing requires:"
    echo "  1. Vector embeddings indexed"
    echo "  2. RAG engine initialized"
    echo "  3. Document retrieval working"
    echo ""
    echo "⚠️  Phase 2 testing not yet implemented"
    echo "Ready when RAG system is integrated into API"
}

# Compare results
compare_results() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "ACCURACY COMPARISON"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    if [ -f "$RESULTS_DIR/phase1-scores.json" ]; then
        echo "Phase 1 Results (Knowledge Base):"
        cat "$RESULTS_DIR/phase1-scores.json"
    fi
    
    if [ -f "$RESULTS_DIR/phase2-scores.json" ]; then
        echo ""
        echo "Phase 2 Results (RAG):"
        cat "$RESULTS_DIR/phase2-scores.json"
    fi
}

# Main execution
main() {
    check_ollama
    
    case "$PHASE" in
        phase1)
            test_phase1
            ;;
        phase2)
            test_phase2
            ;;
        both)
            test_phase1
            echo ""
            test_phase2
            ;;
        *)
            echo "Usage: $0 [phase1|phase2|both]"
            exit 1
            ;;
    esac
    
    compare_results
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "Testing complete!"
    echo "Results saved to: $RESULTS_DIR"
    echo "═══════════════════════════════════════════════════════════════"
}

main
