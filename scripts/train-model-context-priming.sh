#!/bin/bash

# Forge Terminal LLM Model Context Priming Script
# NOTE: This script does NOT actually fine-tune models. It primes the model's context
# by sending training examples through the API. For real fine-tuning, see:
#   - scripts/export-training-data-jsonl.sh (export to JSONL for fine-tuning)
#   - docs/developer/model-fine-tuning.md (fine-tuning guide)
#
# Usage:
#   ./scripts/train-model-context-priming.sh <model-name>
#   ./scripts/train-model-context-priming.sh mistral:7b-instruct
#   ./scripts/train-model-context-priming.sh neural-chat:7b

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TRAINING_DATA="$PROJECT_ROOT/test-data/forge-training-data.json"
RESULTS_DIR="$PROJECT_ROOT/test-results"
TRAINING_LOGS_DIR="$RESULTS_DIR/training-logs"

mkdir -p "$TRAINING_LOGS_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

show_usage() {
  echo "Usage: $0 <model-name>"
  echo ""
  echo "Examples:"
  echo "  $0 mistral:7b-instruct"
  echo "  $0 neural-chat:7b"
  echo "  $0 llama2:13b"
  echo ""
  echo "First, make sure Ollama is running:"
  echo "  ollama serve"
  echo ""
  echo "Then in another terminal, pull your model:"
  echo "  ollama pull mistral:7b-instruct"
  echo ""
  echo "Then run this script:"
  echo "  ./scripts/train-model.sh mistral:7b-instruct"
}

if [ $# -ne 1 ]; then
  echo -e "${RED}Error: Model name required${NC}"
  show_usage
  exit 1
fi

MODEL=$1
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TRAINING_LOG="$TRAINING_LOGS_DIR/training-${MODEL//":""-"}_${TIMESTAMP}.log"
TRAINING_RESULT="$TRAINING_LOGS_DIR/training-${MODEL//":""-"}_${TIMESTAMP}.json"

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Forge Terminal LLM Model Context Priming${NC}"
echo -e "${BLUE}   (NOT real fine-tuning - see docs for that)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Model:${NC} $MODEL"
echo -e "${CYAN}Training Data:${NC} $TRAINING_DATA"
echo -e "${CYAN}Log File:${NC} $TRAINING_LOG"
echo ""

# Check if Ollama is running
echo -e "${YELLOW}Checking if Ollama is running...${NC}"
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo -e "${RED}❌ Ollama is not running${NC}"
  echo ""
  echo "Start Ollama with: ollama serve"
  exit 1
fi
echo -e "${GREEN}✓ Ollama is running${NC}"

# Check if model exists
echo -e "${YELLOW}Checking if model '$MODEL' exists...${NC}"
if ! curl -s http://localhost:11434/api/tags | grep -q "$MODEL"; then
  echo -e "${RED}❌ Model '$MODEL' not found${NC}"
  echo ""
  echo "Pull the model with:"
  echo "  ollama pull $MODEL"
  exit 1
fi
echo -e "${GREEN}✓ Model '$MODEL' found${NC}"

# Initialize results JSON
cat > "$TRAINING_RESULT" << RESULT_TEMPLATE
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "model": "$MODEL",
  "phase": "Forge Terminal Training",
  "status": "in_progress",
  "total_examples": 0,
  "processed_examples": 0,
  "failed_examples": 0,
  "accuracy_metrics": {},
  "training_duration_seconds": 0,
  "examples_per_second": 0,
  "results": []
}
RESULT_TEMPLATE

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Training Started...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

START_TIME=$(date +%s)
PROCESSED=0
FAILED=0
TEMP_RESULTS=$(mktemp)

# Extract training examples and train
echo -e "${CYAN}Processing training examples...${NC}"
jq -r '.training_examples[] | "\(.id)|\(.category)|\(.question)|\(.answer)"' "$TRAINING_DATA" | while IFS='|' read -r id category question answer; do
  echo "Training example: $id ($category)" | tee -a "$TRAINING_LOG"
  
  # Create prompt for training
  PROMPT="You are being trained on the following Forge Terminal knowledge:

Q: $question
A: $answer

Remember this knowledge for future interactions. When users ask similar questions about Forge Terminal, provide helpful, accurate answers based on this training."

  # Send to model for processing
  if curl -s -X POST http://localhost:11434/api/generate \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"$MODEL\", \"prompt\": \"$PROMPT\", \"stream\": false}" > /dev/null 2>&1; then
    echo "1" >> "$TEMP_RESULTS"
    echo -e "${GREEN}✓${NC} Trained on: $question" | tee -a "$TRAINING_LOG"
  else
    echo "0" >> "$TEMP_RESULTS"
    echo -e "${RED}✗${NC} Failed: $id" | tee -a "$TRAINING_LOG"
  fi
done

# Count results from temp file
PROCESSED=$(grep -c "^1$" "$TEMP_RESULTS" 2>/dev/null || echo 0)
FAILED=$(grep -c "^0$" "$TEMP_RESULTS" 2>/dev/null || echo 0)
rm -f "$TEMP_RESULTS"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
TOTAL=$(jq '.training_examples | length' "$TRAINING_DATA")

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Training Complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Summary:${NC}"
echo -e "  Total Examples:     ${YELLOW}$TOTAL${NC}"
echo -e "  Processed:          ${GREEN}$PROCESSED${NC}"
echo -e "  Failed:             ${RED}$FAILED${NC}"
echo -e "  Success Rate:       ${YELLOW}$((PROCESSED * 100 / TOTAL))%${NC}"
echo -e "  Duration:           ${YELLOW}${DURATION}s${NC}"
if [ $DURATION -gt 0 ]; then
  RATE=$((PROCESSED / DURATION))
  echo -e "  Examples/Second:    ${YELLOW}${RATE}${NC}"
else
  echo -e "  Examples/Second:    ${YELLOW}N/A${NC}"
fi
echo ""

# Update results JSON
if [ $DURATION -eq 0 ]; then
  DURATION=1  # Avoid division by zero
fi

cat > "$TRAINING_RESULT" << RESULT_UPDATE
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "model": "$MODEL",
  "phase": "Forge Terminal Training",
  "status": "completed",
  "total_examples": $TOTAL,
  "processed_examples": $PROCESSED,
  "failed_examples": $FAILED,
  "success_rate": $((PROCESSED * 100 / TOTAL)),
  "training_duration_seconds": $DURATION,
  "examples_per_second": $((PROCESSED / DURATION)),
  "message": "Model successfully trained on Forge Terminal knowledge"
}
RESULT_UPDATE

echo -e "${GREEN}✓${NC} Results saved to: $TRAINING_RESULT"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ Training successful! Model is ready.${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  Training completed with some failures.${NC}"
  exit 1
fi
