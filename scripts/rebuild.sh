#!/bin/bash
# Quick rebuild and restart script for development

set -e

echo "🔨 Rebuilding Forge..."
if ! make build 2>&1; then
    echo "❌ Build failed! Fix errors and try again."
    exit 1
fi

echo "✅ Build successful!"
echo ""

echo "⚠️  Stopping existing Forge instances..."
pkill forge 2>/dev/null || true
sleep 1

echo "🚀 Starting Forge..."
./bin/forge > forge-dev.log 2>&1 &
FORGE_PID=$!

sleep 2

if ps -p $FORGE_PID > /dev/null; then
    echo "✅ Forge started successfully!"
    echo ""
    echo "   • Process ID: $FORGE_PID"
    echo "   • URL: http://localhost:3000"
    echo "   • Logs: tail -f forge-dev.log"
    echo ""
    echo "💡 Watch logs with:"
    echo "   tail -f forge-dev.log | grep -E \"═══|✅|❌\""
else
    echo "❌ Failed to start Forge. Check forge-dev.log for errors."
    exit 1
fi
