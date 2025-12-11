#!/bin/bash

# Improved Forge Assistant Accuracy Testing Framework
# Tests Phase 1 (Knowledge Base) accuracy with actual Ollama queries

set -e

RESULTS_DIR="test-results/accuracy-$(date +%Y-%m-%d-%H%M%S)"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-mistral:7b-instruct}"

mkdir -p "$RESULTS_DIR"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Forge Assistant Accuracy Testing - PHASE 1 (Real Tests)    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Ollama URL: $OLLAMA_URL"
echo "Model: $OLLAMA_MODEL"
echo "Results Directory: $RESULTS_DIR"
echo ""

# Check Ollama
echo "Checking Ollama..."
if ! curl -s "$OLLAMA_URL/api/tags" > /dev/null 2>&1; then
    echo "❌ Ollama not running at $OLLAMA_URL"
    exit 1
fi
echo "✅ Ollama is running"
echo ""

# System prompt with Forge knowledge
SYSTEM_PROMPT="You are the Forge Assistant, an AI helper for Forge Terminal.

FORGE TERMINAL FEATURES:
- Full PTY Terminal: Run any interactive CLI application
- Multi-Tab Support: Up to 20 tabs, drag-drop reordering (Ctrl+T to create)
- Session Persistence: Tabs are saved and restored on restart
- Terminal Search: Press Ctrl+F to find text in terminal output
- Command Cards: Save frequently used commands for quick access
- AM (Artificial Memory) Logging: Session logging with text + screenshots
- Vision Detection: Visual pattern detection (experimental)
- Forge Assistant: AI chat panel (experimental)
- 10 Color Themes: Solarized, Dracula, Nord, Gruvbox, One Dark/Light, etc.
- Per-Tab Customization: Theme, font size, shell per tab
- Auto-Updates: Automatic version checking
- WSL Integration: Full Windows Subsystem for Linux support
- Shell Selection: Bash, Zsh, Fish, PowerShell support
- Keyboard Shortcuts: Ctrl+T (new tab), Ctrl+W (close), Ctrl+F (search)
- Disconnect Reasons: Shows why sessions disconnected
- Scroll Button: Visual scroll position indicator
- Auto-Respond: Automate repetitive answers (experimental)

Be helpful, accurate, and suggest Forge-specific features when relevant."

# Function to test a single question
test_question() {
    local qnum=$1
    local question=$2
    
    printf "Q%-2d: Testing... " "$qnum"
    
    # Build JSON payload with proper escaping
    local system_escaped=$(printf '%s\n' "$SYSTEM_PROMPT" | jq -Rs .)
    local question_escaped=$(printf '%s\n' "$question" | jq -Rs .)
    
    local payload="{
  \"model\": \"$OLLAMA_MODEL\",
  \"messages\": [
    {
      \"role\": \"system\",
      \"content\": $system_escaped
    },
    {
      \"role\": \"user\",
      \"content\": $question_escaped
    }
  ],
  \"stream\": false
}"
    
    # Query Ollama and extract response
    local response=$(curl -s "$OLLAMA_URL/api/chat" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null | jq -r '.message.content' 2>/dev/null)
    
    if [ -z "$response" ] || [ "$response" = "null" ]; then
        echo "FAILED (no response)"
        return 1
    fi
    
    local word_count=$(echo "$response" | wc -w)
    printf "✓ Got response (%d words)\n" "$word_count"
    
    # Save the Q&A
    echo "Q$qnum: $question" >> "$RESULTS_DIR/phase1-qa.txt"
    echo "Response:" >> "$RESULTS_DIR/phase1-qa.txt"
    echo "$response" >> "$RESULTS_DIR/phase1-qa.txt"
    echo "---" >> "$RESULTS_DIR/phase1-qa.txt"
    
    # Score the response (keyword-based)
    score_response "$qnum" "$response"
}

# Scoring function
score_response() {
    local qnum=$1
    local response=$2
    local score=0
    
    # Make response lowercase for case-insensitive matching
    local response_lower=$(echo "$response" | tr '[:upper:]' '[:lower:]')
    
    case $qnum in
        1)
            # Q1: Session logging - expect: AM, logging, right-click, tab
            if [[ "$response_lower" == *"right-click"* ]] || [[ "$response_lower" == *"am"* ]]; then
                score=100
            elif [[ "$response_lower" == *"logging"* ]] || [[ "$response_lower" == *"session"* ]]; then
                score=50
            fi
            ;;
        2)
            # Q2: Multiple tabs - expect: ctrl+t, tab, multiple
            if [[ "$response_lower" == *"ctrl+t"* ]] || [[ "$response_lower" == *"new tab"* ]]; then
                score=100
            elif [[ "$response_lower" == *"tab"* ]] && [[ "$response_lower" == *"multiple"* ]]; then
                score=50
            fi
            ;;
        3)
            # Q3: Search - expect: ctrl+f, search, find
            if [[ "$response_lower" == *"ctrl+f"* ]]; then
                score=100
            elif [[ "$response_lower" == *"search"* ]] || [[ "$response_lower" == *"find"* ]]; then
                score=50
            fi
            ;;
        4)
            # Q4: Disconnect reasons - expect: disconnect, reason, error
            if [[ "$response_lower" == *"disconnect"* ]]; then
                score=100
            elif [[ "$response_lower" == *"reason"* ]] || [[ "$response_lower" == *"error"* ]]; then
                score=50
            fi
            ;;
        5)
            # Q5: Session persistence - expect: persist, restart, save, restore
            if [[ "$response_lower" == *"persist"* ]] || [[ "$response_lower" == *"restart"* ]]; then
                score=100
            elif [[ "$response_lower" == *"save"* ]] || [[ "$response_lower" == *"restore"* ]]; then
                score=50
            fi
            ;;
        6)
            # Q6: Command cards - expect: command, card, save
            if [[ "$response_lower" == *"command card"* ]]; then
                score=100
            elif [[ "$response_lower" == *"save"* ]] && [[ "$response_lower" == *"command"* ]]; then
                score=50
            fi
            ;;
        7)
            # Q7: Card shortcuts - expect: ctrl+shift, keyboard
            if [[ "$response_lower" == *"ctrl+shift"* ]]; then
                score=100
            elif [[ "$response_lower" == *"shortcut"* ]] || [[ "$response_lower" == *"keyboard"* ]]; then
                score=50
            fi
            ;;
        8)
            # Q8: Card ordering - expect: reorder, drag, favorite
            if [[ "$response_lower" == *"drag"* ]] || [[ "$response_lower" == *"reorder"* ]]; then
                score=100
            elif [[ "$response_lower" == *"order"* ]] || [[ "$response_lower" == *"favorite"* ]]; then
                score=50
            fi
            ;;
        9)
            # Q9: Paste vs Execute - expect: paste, execute, mode
            if [[ "$response_lower" == *"paste"* ]] && [[ "$response_lower" == *"execute"* ]]; then
                score=100
            elif [[ "$response_lower" == *"mode"* ]]; then
                score=50
            fi
            ;;
        10)
            # Q10: Emoji in cards - expect: emoji, icon
            if [[ "$response_lower" == *"emoji"* ]] || [[ "$response_lower" == *"icon"* ]]; then
                score=100
            else
                score=0
            fi
            ;;
        *)
            # Default: partial credit for trying
            if [ ${#response} -gt 50 ]; then
                score=50
            fi
            ;;
    esac
    
    echo $score
}

# Run tests
echo "═══════════════════════════════════════════════════════════════"
echo "TESTING PHASE 1: Knowledge Base System Prompt"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Initialize files
> "$RESULTS_DIR/phase1-qa.txt"
> "$RESULTS_DIR/phase1-scores.txt"

# Define test questions (10 core questions)
declare -a questions=(
    "How do I enable session logging in Forge?"
    "How do I open multiple tabs in Forge Terminal?"
    "How do I search for text in the terminal?"
    "What does the disconnect reasons feature do?"
    "Do my Forge tabs stay open when I restart the application?"
    "How do I save a frequently used command in Forge?"
    "What keyboard shortcuts are available for Command Cards?"
    "Can I organize or reorder my Command Cards?"
    "What is the difference between Paste Mode and Execute Mode?"
    "Can I add icons or emojis to my Command Cards?"
)

# Run tests
total=0
sum=0

for i in "${!questions[@]}"; do
    qnum=$((i+1))
    score=$(test_question "$qnum" "${questions[$i]}")
    if [ -z "$score" ]; then
        score=0
    fi
    printf "%d,%d\n" "$qnum" "$score" >> "$RESULTS_DIR/phase1-scores.txt"
    total=$((total+1))
    sum=$((sum+score))
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "PHASE 1 RESULTS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Calculate average
if [ $total -gt 0 ]; then
    average=$((sum / total))
else
    average=0
fi

echo "Total Questions: $total"
echo "Total Score: $sum / $((total * 100))"
echo "Average Accuracy: $average%"
echo ""

# Show scores
echo "Question Breakdown:"
while IFS=',' read -r qnum score; do
    printf "  Q%2d: %3d%%\n" "$qnum" "$score"
done < "$RESULTS_DIR/phase1-scores.txt"

echo ""
echo "Files saved:"
echo "  - Results: $RESULTS_DIR/phase1-qa.txt"
echo "  - Scores: $RESULTS_DIR/phase1-scores.txt"
echo ""

# Create summary JSON
cat > "$RESULTS_DIR/phase1-summary.json" << EOF
{
  "phase": "phase1",
  "method": "system_prompt_injection",
  "model": "$OLLAMA_MODEL",
  "timestamp": "$(date -Iseconds)",
  "total_questions": $total,
  "average_accuracy_percent": $average,
  "total_score": $sum,
  "max_score": $((total * 100)),
  "result_directory": "$RESULTS_DIR"
}
EOF

echo "Summary: $RESULTS_DIR/phase1-summary.json"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Phase 1 Testing Complete"
echo "═══════════════════════════════════════════════════════════════"
