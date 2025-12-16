#!/bin/bash

# Forge Terminal - Live Development with Auto-Rebuild
# Watches for Go file changes and rebuilds automatically

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     Forge Terminal - Live Development Mode                    ║"
echo "║     (Auto-rebuild on file changes)                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if inotify-tools is installed
if ! command -v inotifywait &> /dev/null; then
    echo "⚠️  inotify-tools not installed"
    echo "   Install with: sudo apt-get install inotify-tools"
    echo ""
    echo "   Falling back to manual rebuild mode..."
    echo "   Run './run-dev.sh' after making changes"
    exit 1
fi

# Function to build and run
build_and_run() {
    echo ""
    echo "🔨 Building Forge..."
    if make build 2>&1 | grep -q "error"; then
        echo "❌ Build failed! Fix errors and save to retry."
        return 1
    fi
    
    echo "✅ Build successful!"
    
    # Stop existing instance
    EXISTING_PID=$(lsof -ti:3000 2>/dev/null || true)
    if [ -n "$EXISTING_PID" ]; then
        echo "⚠️  Stopping previous instance (PID: $EXISTING_PID)..."
        kill $EXISTING_PID 2>/dev/null || true
        sleep 2
    fi
    
    echo "🚀 Starting Forge..."
    echo "   URL: http://localhost:3000"
    echo "   Watching for changes..."
    echo ""
    
    # Run in background
    ./bin/forge > forge-dev.log 2>&1 &
    FORGE_PID=$!
    echo "   Process ID: $FORGE_PID"
}

# Initial build and run
build_and_run

# Watch for changes
echo ""
echo "👀 Watching for file changes..."
echo "   Press Ctrl+C to stop"
echo ""

while inotifywait -r -e modify,create,delete --exclude '(\.log|\.md|bin/|\.git|node_modules|web/)' . 2>/dev/null; do
    echo ""
    echo "📝 File change detected! Rebuilding..."
    build_and_run
done
