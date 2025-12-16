#!/bin/bash
# Quick script to view keyboard validation test results

RESULTS_DIR="test-results"
REPORT="$RESULTS_DIR/keyboard-visual-validation-report.html"
SUMMARY="$RESULTS_DIR/KEYBOARD_TEST_SUMMARY.md"

echo "==========================================="
echo "KEYBOARD VISUAL VALIDATION TEST RESULTS"
echo "==========================================="
echo ""

if [ ! -f "$REPORT" ]; then
  echo "❌ Test report not found: $REPORT"
  echo ""
  echo "Run the test first:"
  echo "  ./run-keyboard-visual-test.sh"
  echo ""
  exit 1
fi

echo "✅ Test report found"
echo ""

# Show summary
if [ -f "$SUMMARY" ]; then
  echo "📊 Test Summary:"
  echo "----------------"
  head -20 "$SUMMARY" | tail -15
  echo ""
fi

# Show JSON stats
if [ -f "$RESULTS_DIR/keyboard-visual-validation-data.json" ]; then
  echo "📈 Test Statistics:"
  echo "-------------------"
  python3 << 'EOF'
import json
with open('test-results/keyboard-visual-validation-data.json') as f:
    data = json.load(f)
    print(f"Duration:     {data['totalDuration'] // 60000}m {(data['totalDuration'] % 60000) // 1000}s")
    print(f"Snapshots:    {data['summary']['totalSnapshots']}")
    print(f"Failures:     {data['summary']['failedSnapshots']}")
    print(f"Inputs:       {data['summary']['inputsAttempted']}")
    rate = (data['summary']['totalSnapshots'] - data['summary']['failedSnapshots']) / data['summary']['totalSnapshots'] * 100
    print(f"Success Rate: {rate:.1f}%")
EOF
  echo ""
fi

echo "==========================================="
echo ""
echo "📄 Available Reports:"
echo "  • HTML Report:  $REPORT"
echo "  • Summary:      $SUMMARY"
echo "  • JSON Data:    $RESULTS_DIR/keyboard-visual-validation-data.json"
echo "  • Full Log:     $RESULTS_DIR/keyboard-visual-full-run.log"
echo ""
echo "🌐 Open HTML Report:"
echo "  xdg-open $REPORT"
echo ""
echo "  Or browse to:"
echo "  file://$(pwd)/$REPORT"
echo ""
