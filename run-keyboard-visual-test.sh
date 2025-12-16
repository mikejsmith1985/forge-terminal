#!/bin/bash
# Run comprehensive 5+ minute keyboard visual validation test with Percy

set -e

echo "=================================="
echo "KEYBOARD VISUAL VALIDATION TEST"
echo "=================================="
echo ""
echo "This test will:"
echo "  • Run for 5+ minutes continuously"
echo "  • Type real keyboard input"
echo "  • Take Percy visual snapshots every 15 seconds"
echo "  • Generate a pretty HTML report"
echo ""
echo "Prerequisites:"
echo "  • Forge must be running on http://localhost:8333"
echo "  • Percy token must be set (or will run in local mode)"
echo ""

# Check if Forge is running
if ! curl -s http://localhost:8333 > /dev/null; then
  echo "❌ ERROR: Forge is not running on port 8333"
  echo ""
  echo "Please start Forge first:"
  echo "  ./forge"
  echo ""
  exit 1
fi

echo "✅ Forge is running"
echo ""

# Check Percy token (optional)
if [ -z "$PERCY_TOKEN" ]; then
  echo "⚠️  PERCY_TOKEN not set - running in local mode (no cloud upload)"
  echo "   To enable Percy cloud: export PERCY_TOKEN=your_token"
  echo ""
else
  echo "✅ Percy token configured"
  echo ""
fi

# Create test-results directory
mkdir -p test-results

echo "🚀 Starting test..."
echo ""

# Run with Percy
npx percy exec -- node test-keyboard-visual-validation.js

echo ""
echo "=================================="
echo "TEST COMPLETE"
echo "=================================="
echo ""
echo "View the HTML report:"
echo "  file://$(pwd)/test-results/keyboard-visual-validation-report.html"
echo ""
echo "Or open it:"
echo "  xdg-open test-results/keyboard-visual-validation-report.html"
echo ""
