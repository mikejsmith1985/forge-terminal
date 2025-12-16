#!/bin/bash
# Clean up log files

echo "🧹 Cleaning log files..."

rm -f forge-dev.log
rm -f forge.log
rm -f forge-test.log
rm -f test-am-*.log

echo "✅ Log files cleaned!"
echo ""
echo "Removed:"
echo "  • forge-dev.log"
echo "  • forge.log"
echo "  • forge-test.log"
echo "  • test-am-*.log"
