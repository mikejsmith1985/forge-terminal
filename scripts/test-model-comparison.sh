#!/bin/bash

# LLM Model Comparison Framework
# Runs the same baseline tests against different models and compares results
# Usage:
#   ./scripts/test-model-comparison.sh mistral:7b-instruct neural-chat:7b
#   ./scripts/test-model-comparison.sh --baseline-only mistral:7b-instruct
#   ./scripts/test-model-comparison.sh --compare-last-two

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_FILE="$PROJECT_ROOT/test-data/rag-test-questions.json"
RESULTS_DIR="$PROJECT_ROOT/test-results"
COMPARISON_DIR="$RESULTS_DIR/model-comparisons"

mkdir -p "$COMPARISON_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Show usage
show_usage() {
  echo "Usage:"
  echo "  $0 <model1> [<model2> ...]          Test and compare multiple models"
  echo "  $0 --baseline-only <model>          Test single model without comparison"
  echo "  $0 --compare-last-two               Compare the two most recent test runs"
  echo "  $0 --list-results                   List all test results"
  echo ""
  echo "Examples:"
  echo "  $0 mistral:7b-instruct neural-chat:7b"
  echo "  $0 --baseline-only mistral:7b-instruct"
  echo "  $0 --compare-last-two"
}

# Extract results from a test run JSON
extract_metrics() {
  local json_file=$1
  if [ ! -f "$json_file" ]; then
    echo "ERROR: $json_file not found"
    return 1
  fi
  
  local total=$(jq '.total_tests' "$json_file" 2>/dev/null || echo "0")
  local passed=$(jq '.passed_tests' "$json_file" 2>/dev/null || echo "0")
  local accuracy=$(jq '.overall_accuracy' "$json_file" 2>/dev/null || echo "0")
  
  echo "$accuracy|$passed|$total"
}

# Test a single model
test_model() {
  local model=$1
  local timestamp=$(date +%Y%m%d-%H%M%S)
  local output_json="$COMPARISON_DIR/model-${model//":""-"}_${timestamp}.json"
  local output_log="$COMPARISON_DIR/model-${model//":""-"}_${timestamp}.log"
  
  echo ""
  echo -e "${BLUE}Testing model: ${YELLOW}$model${NC}"
  echo "Output: $output_json"
  echo ""
  
  # Check Forge is running
  if ! curl -s http://localhost:8080/ > /dev/null 2>&1 && ! curl -s http://localhost:8333/ > /dev/null 2>&1; then
    echo -e "${RED}❌ Forge service not running${NC}"
    echo "Start Forge with: ./forge --port 8080"
    return 1
  fi
  
  # Initialize results JSON
  local start_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  cat > "$output_json" << RESULT_TEMPLATE
{
  "timestamp": "$start_time",
  "model": "$model",
  "phase": "Model Comparison",
  "total_tests": 0,
  "passed_tests": 0,
  "failed_tests": 0,
  "overall_accuracy": 0,
  "average_score": 0,
  "results": []
}
RESULT_TEMPLATE

  local total_tests=0
  local passed_tests=0
  local failed_tests=0
  local total_score=0
  local temp_results=$(mktemp)
  
  # Run each test
  jq -r '.tests[] | "\(.id)|\(.question)|\(.expected_keywords | join(","))|\(.difficulty)|\(.category)"' "$TEST_FILE" | while IFS='|' read -r id question keywords difficulty category; do
    total_tests=$((total_tests + 1))
    
    echo -n "  [$id] $difficulty: "
    
    # Call Forge API
    local response=$(curl -s -X POST http://localhost:8080/api/assistant/chat \
      -H "Content-Type: application/json" \
      -d "{\"model\": \"$model\", \"messages\": [{\"role\": \"user\", \"content\": \"$question\"}]}" 2>/dev/null || \
      curl -s -X POST http://localhost:8333/api/assistant/chat \
      -H "Content-Type: application/json" \
      -d "{\"model\": \"$model\", \"messages\": [{\"role\": \"user\", \"content\": \"$question\"}]}" 2>/dev/null)
    
    if [ -z "$response" ]; then
      echo -e "${RED}FAIL (no response)${NC}"
      failed_tests=$((failed_tests + 1))
      echo "{\"id\": \"$id\", \"score\": 0, \"status\": \"FAIL\", \"reason\": \"no_response\"}" >> "$temp_results"
      return
    fi
    
    # Extract message from response
    local message=$(echo "$response" | jq -r '.message // .response // .text // ""' 2>/dev/null || echo "")
    
    if [ -z "$message" ]; then
      echo -e "${RED}FAIL (empty message)${NC}"
      failed_tests=$((failed_tests + 1))
      echo "{\"id\": \"$id\", \"score\": 0, \"status\": \"FAIL\", \"reason\": \"empty_message\"}" >> "$temp_results"
      return
    fi
    
    # Count keyword matches (case-insensitive)
    local matched_keywords=0
    local keyword_count=$(echo "$keywords" | tr ',' '\n' | wc -l)
    
    echo "$keywords" | tr ',' '\n' | while read -r keyword; do
      if echo "$message" | grep -qi "$keyword"; then
        matched_keywords=$((matched_keywords + 1))
      fi
    done
    
    # Calculate score
    local score=$((matched_keywords * 100 / keyword_count))
    local status="FAIL"
    if [ "$score" -ge 80 ]; then
      status="PASS"
      passed_tests=$((passed_tests + 1))
      echo -e "${GREEN}PASS ($score%)${NC}"
    else
      failed_tests=$((failed_tests + 1))
      echo -e "${RED}FAIL ($score%)${NC}"
    fi
    
    total_score=$((total_score + score))
    echo "{\"id\": \"$id\", \"score\": $score, \"status\": \"$status\", \"matched\": $matched_keywords, \"total\": $keyword_count}" >> "$temp_results"
  done
  
  # Calculate final metrics
  local overall_accuracy=0
  local average_score=0
  if [ $total_tests -gt 0 ]; then
    overall_accuracy=$((passed_tests * 100 / total_tests))
    average_score=$((total_score / total_tests))
  fi
  
  # Update results JSON
  local results_array=$(jq -s '.' "$temp_results" 2>/dev/null || echo "[]")
  local end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  
  jq --arg end "$end_time" \
     --argjson passed "$passed_tests" \
     --argjson total "$total_tests" \
     --argjson accuracy "$overall_accuracy" \
     --argjson avg_score "$average_score" \
     --argjson results "$results_array" \
     '.timestamp |= $end | 
      .passed_tests = $passed | 
      .total_tests = $total | 
      .failed_tests = ($total - $passed) |
      .overall_accuracy = $accuracy | 
      .average_score = $avg_score | 
      .results = $results' \
     "$output_json" > "${output_json}.tmp" && mv "${output_json}.tmp" "$output_json"
  
  rm -f "$temp_results"
  
  echo ""
  echo -e "${GREEN}Results saved:${NC} $output_json"
  
  # Generate HTML visual report
  local visual_script="$SCRIPT_DIR/generate-test-visual.sh"
  if [ -x "$visual_script" ]; then
    echo -e "${BLUE}Generating visual report...${NC}"
    if bash "$visual_script" "$output_json" 2>/dev/null; then
      local html_file="${output_json%.json}.html"
      if command -v open &> /dev/null; then
        open "$html_file" &
      elif command -v xdg-open &> /dev/null; then
        xdg-open "$html_file" &
      elif command -v wslview &> /dev/null; then
        wslview "$html_file" &
      fi
    fi
  fi
  
  echo "$output_json"
}

# Compare two test results
compare_results() {
  local result1=$1
  local result2=$2
  
  if [ ! -f "$result1" ] || [ ! -f "$result2" ]; then
    echo -e "${RED}Error: Result files not found${NC}"
    return 1
  fi
  
  local model1=$(jq -r '.model' "$result1")
  local model2=$(jq -r '.model' "$result2")
  local accuracy1=$(jq -r '.overall_accuracy' "$result1")
  local accuracy2=$(jq -r '.overall_accuracy' "$result2")
  local passed1=$(jq -r '.passed_tests' "$result1")
  local passed2=$(jq -r '.passed_tests' "$result2")
  local total=$(jq -r '.total_tests' "$result1")
  
  local diff=$((accuracy2 - accuracy1))
  local diff_color="$NC"
  if [ $diff -gt 0 ]; then
    diff_color="$GREEN"
  elif [ $diff -lt 0 ]; then
    diff_color="$RED"
  fi
  
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}          MODEL COMPARISON RESULTS                 ${CYAN}║${NC}"
  echo -e "${CYAN}╠════════════════════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║${NC} Model                │ Accuracy  │ Passed  │ Avg ${CYAN}║${NC}"
  echo -e "${CYAN}╠════════════════════════════════════════════════════╣${NC}"
  
  printf "${CYAN}║${NC} %-20s │ %6d%%  │ %5d/%d │ " "$model1" "$accuracy1" "$passed1" "$total"
  local avg1=$(jq -r '.average_score' "$result1")
  echo -e "%5d%${CYAN}║${NC}" "$avg1"
  
  printf "${CYAN}║${NC} %-20s │ %6d%%  │ %5d/%d │ " "$model2" "$accuracy2" "$passed2" "$total"
  local avg2=$(jq -r '.average_score' "$result2")
  echo -e "%5d%${CYAN}║${NC}" "$avg2"
  
  echo -e "${CYAN}╠════════════════════════════════════════════════════╣${NC}"
  echo -ne "${CYAN}║${NC} Difference          │ ${diff_color}"
  
  if [ $diff -gt 0 ]; then
    printf "+%d%%${NC} (${GREEN}%s wins${NC})     ${CYAN}║${NC}" "$diff" "$model2"
  else
    printf "%d%%${NC} (${GREEN}%s wins${NC})     ${CYAN}║${NC}" "$diff" "$model1"
  fi
  echo ""
  echo -e "${CYAN}╚════════════════════════════════════════════════════╝${NC}"
  
  echo ""
  echo "📊 Detailed Results:"
  echo "  Result 1: $result1"
  echo "  Result 2: $result2"
}

# List all results
list_results() {
  echo -e "${BLUE}Model Test Results:${NC}"
  echo ""
  ls -1 "$COMPARISON_DIR"/model-*.json 2>/dev/null | sort -r | head -20 | while read file; do
    local model=$(jq -r '.model' "$file")
    local accuracy=$(jq -r '.overall_accuracy' "$file")
    local timestamp=$(jq -r '.timestamp' "$file")
    printf "  %-30s │ %3d%% │ %s\n" "$model" "$accuracy" "$timestamp"
  done
  
  echo ""
  echo "Run '$(basename $0) --compare-last-two' to compare the latest two results"
}

# Handle arguments
if [ $# -eq 0 ]; then
  show_usage
  exit 1
fi

case "$1" in
  --help|-h)
    show_usage
    exit 0
    ;;
  --baseline-only)
    if [ -z "$2" ]; then
      echo "Error: Model name required"
      show_usage
      exit 1
    fi
    test_model "$2"
    ;;
  --compare-last-two)
    # Find the two most recent test files
    files=($(ls -1 "$COMPARISON_DIR"/model-*.json 2>/dev/null | sort -r | head -2))
    if [ ${#files[@]} -lt 2 ]; then
      echo -e "${RED}Error: Need at least 2 test results to compare${NC}"
      list_results
      exit 1
    fi
    compare_results "${files[1]}" "${files[0]}"
    ;;
  --list-results)
    list_results
    ;;
  *)
    # Test multiple models
    models=("$@")
    result_files=()
    
    for model in "${models[@]}"; do
      result_file=$(test_model "$model" | tail -1)
      result_files+=("$result_file")
    done
    
    # Compare results if more than one model was tested
    if [ ${#result_files[@]} -gt 1 ]; then
      echo ""
      echo -e "${BLUE}Comparing results...${NC}"
      for ((i=0; i<${#result_files[@]}-1; i++)); do
        compare_results "${result_files[$i]}" "${result_files[$((i+1))]}"
      done
    fi
    ;;
esac
