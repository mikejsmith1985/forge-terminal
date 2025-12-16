#!/bin/bash

# Export Forge Terminal Training Data to JSONL Format
# Creates JSONL files suitable for fine-tuning with OpenAI, Hugging Face, or other platforms
# Usage:
#   ./scripts/export-training-data-jsonl.sh [output-file]
#   ./scripts/export-training-data-jsonl.sh training-data.jsonl

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TRAINING_DATA="$PROJECT_ROOT/test-data/forge-training-data.json"
OUTPUT_FILE="${1:-$PROJECT_ROOT/test-data/forge-training-export.jsonl}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Forge Terminal Training Data Export${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Input:${NC}  $TRAINING_DATA"
echo -e "${CYAN}Output:${NC} $OUTPUT_FILE"
echo ""

# Check if input exists
if [ ! -f "$TRAINING_DATA" ]; then
  echo -e "${RED}❌ Training data not found: $TRAINING_DATA${NC}"
  exit 1
fi

# Create output directory
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Export to JSONL
echo -e "${YELLOW}Exporting to JSONL format...${NC}"

# OpenAI fine-tuning format:
# {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}

jq -r '.training_examples[] | 
{
  "messages": [
    {
      "role": "system",
      "content": "You are the Forge Assistant, an AI helper for Forge Terminal. Provide accurate, helpful answers about Forge Terminal features and usage."
    },
    {
      "role": "user",
      "content": .question
    },
    {
      "role": "assistant", 
      "content": .answer
    }
  ]
}' "$TRAINING_DATA" > "$OUTPUT_FILE"

# Count lines
LINE_COUNT=$(wc -l < "$OUTPUT_FILE")

echo -e "${GREEN}✓${NC} Export complete"
echo ""
echo -e "${CYAN}Statistics:${NC}"
echo -e "  Training Examples: ${YELLOW}$LINE_COUNT${NC}"
echo -e "  Format:            ${YELLOW}JSONL (OpenAI compatible)${NC}"
echo -e "  Output Size:       ${YELLOW}$(du -h "$OUTPUT_FILE" | cut -f1)${NC}"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Export Complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Next Steps for Fine-Tuning:${NC}"
echo ""
echo "1. ${YELLOW}OpenAI Fine-Tuning:${NC}"
echo "   openai api fine_tunes.create \\"
echo "     -t \"$OUTPUT_FILE\" \\"
echo "     -m gpt-3.5-turbo"
echo ""
echo "2. ${YELLOW}Hugging Face Fine-Tuning:${NC}"
echo "   Convert to Hugging Face format and use Trainer API"
echo "   See: https://huggingface.co/docs/transformers/training"
echo ""
echo "3. ${YELLOW}Ollama Modelfile:${NC}"
echo "   Create a Modelfile with SYSTEM and FROM instructions"
echo "   See: docs/developer/model-fine-tuning.md"
echo ""
echo "4. ${YELLOW}LLaMA Factory:${NC}"
echo "   Use LLaMA Factory for LoRA/QLoRA fine-tuning"
echo "   See: https://github.com/hiyouga/LLaMA-Factory"
echo ""

exit 0
