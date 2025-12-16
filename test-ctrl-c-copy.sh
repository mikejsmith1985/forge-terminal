#!/bin/bash
# Test script for Ctrl+C copy functionality fix
# This will start the Forge terminal and guide you through manual testing

echo "=========================================="
echo "Ctrl+C Copy Functionality Test"
echo "=========================================="
echo ""
echo "This test will verify that:"
echo "  1. Ctrl+C with text selected copies to clipboard"
echo "  2. Ctrl+C without selection sends SIGINT"
echo "  3. A success toast appears when copying"
echo ""
echo "Test Steps:"
echo "  1. Start a Copilot CLI session: gh copilot suggest"
echo "  2. Wait for output, then SELECT some text"
echo "  3. Press Ctrl+C - should copy and show toast"
echo "  4. Your Copilot session should NOT terminate"
echo "  5. Start a long process: sleep 10"
echo "  6. Press Ctrl+C WITHOUT selecting - should interrupt"
echo ""
echo "Starting Forge Terminal..."
echo ""

cd "$(dirname "$0")"
./bin/forge
