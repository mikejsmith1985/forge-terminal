#!/bin/bash

# Forge Terminal - Local Development Runner
# Runs the locally built binary with logging

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     Forge Terminal - Local Development Mode                   ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if binary exists
if [ ! -f "bin/forge" ]; then
    echo "❌ Binary not found. Building..."
    make build
fi

# Stop any running Forge instances
echo "Checking for existing Forge instances..."
EXISTING_PID=$(lsof -ti:3000 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
    echo "⚠️  Found Forge running on port 3000 (PID: $EXISTING_PID)"
    echo "   Stopping it..."
    kill $EXISTING_PID 2>/dev/null || true
    sleep 2
fi

# Create/clear log file
LOG_FILE="forge-dev.log"
> $LOG_FILE
echo "📝 Logging to: $LOG_FILE"
echo ""

# Set environment to skip browser auto-open (optional)
# export NO_BROWSER=1

echo "🚀 Starting Forge Terminal (Local Development)..."
echo ""
echo "   • Binary: bin/forge"
echo "   • Log file: $LOG_FILE"
echo "   • URL: http://localhost:3000"
echo ""
echo "   Press Ctrl+C to stop"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo ""

# Run with logging
./bin/forge 2>&1 | tee $LOG_FILE
