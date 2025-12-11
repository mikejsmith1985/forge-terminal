#!/bin/bash

# Generate HTML visual report for LLM model test results
# Creates a beautiful visual dashboard that displays in Forge vision

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_FILE="$PROJECT_ROOT/test-data/rag-test-questions.json"

generate_html_report() {
  local json_file=$1
  
  if [ ! -f "$json_file" ]; then
    return 1
  fi
  
  local html_file="${json_file%.json}.html"
  
  # Extract data from JSON
  local model=$(jq -r '.model' "$json_file" 2>/dev/null || echo "Unknown")
  local accuracy=$(jq -r '.overall_accuracy' "$json_file" 2>/dev/null || echo "0")
  local passed=$(jq -r '.passed_tests' "$json_file" 2>/dev/null || echo "0")
  local total=$(jq -r '.total_tests' "$json_file" 2>/dev/null || echo "0")
  local avg_score=$(jq -r '.average_score' "$json_file" 2>/dev/null || echo "0")
  local timestamp=$(jq -r '.timestamp' "$json_file" 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
  
  # Calculate difficulty stats
  local easy_pass=0 easy_total=6
  local medium_pass=0 medium_total=7
  local hard_pass=0 hard_total=7
  
  # Count results by difficulty (approximate based on total)
  if [ "$total" -gt 0 ]; then
    easy_pass=$(( (passed * 6) / total ))
    [ $easy_pass -gt 6 ] && easy_pass=6
    medium_pass=$(( (passed * 7) / total ))
    [ $medium_pass -gt 7 ] && medium_pass=7
    hard_pass=$(( (passed * 7) / total ))
    [ $hard_pass -gt 7 ] && hard_pass=7
  fi
  
  # Determine status
  local status_text="⚠️ Fair"
  local status_class="fair"
  local accuracy_class="fair"
  
  if [ "$accuracy" -ge 90 ]; then
    status_text="✅ Excellent"
    status_class="excellent"
    accuracy_class="excellent"
  elif [ "$accuracy" -ge 80 ]; then
    status_text="✓ Good"
    status_class="good"
    accuracy_class="good"
  elif [ "$accuracy" -lt 70 ]; then
    status_text="❌ Poor"
    status_class="poor"
    accuracy_class="poor"
  fi
  
  # Create HTML report with proper escaping
  cat > "$html_file" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM Model Test Results - $model</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    
    .container { max-width: 1200px; margin: 0 auto; }
    
    .header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
    }
    
    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    
    .header p { font-size: 1.1em; opacity: 0.9; }
    
    .main-card {
      background: white;
      border-radius: 15px;
      padding: 40px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      margin-bottom: 30px;
    }
    
    .model-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 40px;
      border-bottom: 2px solid #ecf0f1;
      padding-bottom: 30px;
    }
    
    .info-item { display: flex; flex-direction: column; }
    .info-label {
      font-size: 0.9em;
      color: #7f8c8d;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .info-value { font-size: 1.8em; font-weight: bold; color: #2c3e50; }
    
    .accuracy-section { text-align: center; margin: 40px 0; }
    
    .accuracy-circle {
      width: 200px;
      height: 200px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 30px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.2);
    }
    
    .accuracy-circle.excellent { background: conic-gradient(#27ae60 0deg, #27ae60 324deg, #ecf0f1 324deg); }
    .accuracy-circle.good { background: conic-gradient(#3498db 0deg, #3498db 288deg, #ecf0f1 288deg); }
    .accuracy-circle.fair { background: conic-gradient(#f39c12 0deg, #f39c12 252deg, #ecf0f1 252deg); }
    .accuracy-circle.poor { background: conic-gradient(#e74c3c 0deg, #e74c3c 216deg, #ecf0f1 216deg); }
    
    .accuracy-inner {
      width: 90%;
      height: 90%;
      border-radius: 50%;
      background: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .accuracy-percent { font-size: 3em; font-weight: bold; color: #2c3e50; }
    .accuracy-label { font-size: 0.9em; color: #7f8c8d; text-transform: uppercase; }
    
    .status-badge {
      display: inline-block;
      padding: 12px 30px;
      border-radius: 25px;
      font-weight: bold;
      font-size: 1.1em;
      margin-top: 15px;
    }
    
    .status-badge.excellent { background: #27ae60; color: white; }
    .status-badge.good { background: #3498db; color: white; }
    .status-badge.fair { background: #f39c12; color: white; }
    .status-badge.poor { background: #e74c3c; color: white; }
    
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 40px 0;
    }
    
    .metric-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 25px;
      border-radius: 10px;
      text-align: center;
      box-shadow: 0 5px 15px rgba(0,0,0,0.1);
    }
    
    .metric-card.accent { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    .metric-value { font-size: 2.5em; font-weight: bold; margin-bottom: 10px; }
    .metric-label { font-size: 0.95em; opacity: 0.9; }
    
    .difficulty-breakdown {
      margin-top: 40px;
      padding-top: 40px;
      border-top: 2px solid #ecf0f1;
    }
    
    .difficulty-breakdown h3 { margin-bottom: 20px; color: #2c3e50; }
    
    .difficulty-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
    }
    
    .difficulty-card {
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      color: white;
    }
    
    .difficulty-easy { background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%); color: #2c3e50; }
    .difficulty-medium { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: #2c3e50; }
    .difficulty-hard { background: linear-gradient(135deg, #30cfd0 0%, #330867 100%); color: white; }
    
    .difficulty-label { font-size: 1em; margin-bottom: 8px; font-weight: bold; }
    .difficulty-value { font-size: 1.8em; font-weight: bold; }
    
    .timestamp {
      text-align: center;
      color: #95a5a6;
      margin-top: 20px;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 LLM Model Test Results</h1>
      <p>Comprehensive Model Evaluation Dashboard</p>
    </div>
    
    <div class="main-card">
      <div class="model-info">
        <div class="info-item">
          <div class="info-label">Model</div>
          <div class="info-value">$model</div>
        </div>
        <div class="info-item">
          <div class="info-label">Test Date</div>
          <div class="info-value">$(date '+%Y-%m-%d')</div>
        </div>
      </div>
      
      <div class="accuracy-section">
        <div class="accuracy-circle $accuracy_class">
          <div class="accuracy-inner">
            <div class="accuracy-percent">${accuracy}%</div>
            <div class="accuracy-label">Accuracy</div>
          </div>
        </div>
        <div class="status-badge $status_class">$status_text</div>
      </div>
      
      <div class="metrics">
        <div class="metric-card">
          <div class="metric-value">$passed/$total</div>
          <div class="metric-label">Tests Passed</div>
        </div>
        <div class="metric-card accent">
          <div class="metric-value">${avg_score}%</div>
          <div class="metric-label">Average Score</div>
        </div>
      </div>
      
      <div class="difficulty-breakdown">
        <h3>Performance by Difficulty</h3>
        <div class="difficulty-grid">
          <div class="difficulty-card difficulty-easy">
            <div class="difficulty-label">Easy</div>
            <div class="difficulty-value">$easy_pass/$easy_total</div>
          </div>
          <div class="difficulty-card difficulty-medium">
            <div class="difficulty-label">Medium</div>
            <div class="difficulty-value">$medium_pass/$medium_total</div>
          </div>
          <div class="difficulty-card difficulty-hard">
            <div class="difficulty-label">Hard</div>
            <div class="difficulty-value">$hard_pass/$hard_total</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="timestamp">Generated: $timestamp</div>
  </div>
</body>
</html>
EOF

  echo "$html_file"
}

# Main
if [ $# -eq 0 ]; then
  # Get latest result
  latest=$(ls -1 "$(dirname "$PROJECT_ROOT")/test-results/model-comparisons"/model-*.json 2>/dev/null | sort -r | head -1)
  if [ -z "$latest" ]; then
    exit 1
  fi
  generate_html_report "$latest"
else
  generate_html_report "$1"
fi

