#!/bin/bash
# Check status of release watcher

PID=$(pgrep -f "watch-releases.sh" | head -1)

if [ -z "$PID" ]; then
    echo "❌ Release watcher is NOT running"
    echo ""
    echo "To start:"
    echo "  ./scripts/watch-releases.sh &"
    echo ""
    exit 1
fi

echo "✅ Release watcher is RUNNING"
echo ""
echo "📊 Status:"
echo "  PID: $PID"
echo "  Uptime: $(ps -o etime= -p $PID | tr -d ' ')"
echo "  Log: .forge/release-watcher.log"
echo ""
echo "📦 Last checked version:"
if [ -f .forge/last-release-check ]; then
    cat .forge/last-release-check
else
    echo "  (none yet)"
fi
echo ""
echo "📝 Recent logs:"
tail -5 .forge/release-watcher.log
echo ""
echo "Commands:"
echo "  View logs: tail -f .forge/release-watcher.log"
echo "  Stop watcher: kill $PID"
echo "  Restart: kill $PID && ./scripts/watch-releases.sh &"
