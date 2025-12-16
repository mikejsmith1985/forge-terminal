#!/bin/bash
# Watch Forge logs with intelligent filtering

LOG_FILE="${1:-forge-dev.log}"

if [ ! -f "$LOG_FILE" ]; then
    echo "❌ Log file not found: $LOG_FILE"
    echo ""
    echo "Usage: ./scripts/watch-logs.sh [log-file]"
    echo "Example: ./scripts/watch-logs.sh forge-dev.log"
    exit 1
fi

echo "👀 Watching logs: $LOG_FILE"
echo ""
echo "Filters:"
echo "  • High-level flow (═══)"
echo "  • Success markers (✅)"
echo "  • Failure markers (❌)"
echo "  • Warning markers (⚠️)"
echo "  • AM-specific logs"
echo ""
echo "Press Ctrl+C to stop"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo ""

tail -f "$LOG_FILE" | grep --line-buffered -E "═══|✅|❌|⚠️|AM API|LLM Logger|Terminal.*Command|Health Monitor.*EVENT"
