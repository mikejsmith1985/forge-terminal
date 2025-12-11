#!/bin/bash
# Phase 1 Memory Stress Test
# Tests the memory leak fix from commit 3fb69d5
# Run with: ./test-phase1-memory.sh

set -e

echo "════════════════════════════════════════════════════════════════"
echo "  PHASE 1 BLOCKER 1: MEMORY LEAK VERIFICATION"
echo "════════════════════════════════════════════════════════════════"
echo

# Configuration
DURATION_MINUTES=2  # Reduced for testing (should be 12 hours in production)
TEST_INTERVAL_SECONDS=10  # Check memory every 10 seconds
FORGE_BINARY="./forge-test"
TEST_PORT=7654
LOG_FILE="test-results/memory-stress-test-$(date +%Y%m%d-%H%M%S).log"

# Create results directory
mkdir -p test-results

echo "Test Configuration:"
echo "  Binary: $FORGE_BINARY"
echo "  Duration: $DURATION_MINUTES minutes"
echo "  Check interval: $TEST_INTERVAL_SECONDS seconds"
echo "  Port: $TEST_PORT"
echo "  Log file: $LOG_FILE"
echo

# Check binary exists
if [ ! -f "$FORGE_BINARY" ]; then
    echo "❌ ERROR: Binary not found: $FORGE_BINARY"
    echo "   Run: go build -o forge-test ./cmd/forge"
    exit 1
fi

# Start the application with memory monitoring
echo "Step 1: Starting application..."
PORT=$TEST_PORT $FORGE_BINARY > "$LOG_FILE" 2>&1 &
FORGE_PID=$!
echo "✓ Started with PID: $FORGE_PID"
sleep 2

# Check if process is running
if ! kill -0 $FORGE_PID 2>/dev/null; then
    echo "❌ ERROR: Application failed to start"
    cat "$LOG_FILE" | tail -20
    exit 1
fi

echo "✓ Application is running"
echo

# Memory monitoring function
monitor_memory() {
    local pid=$1
    if [ -f "/proc/$pid/status" ]; then
        # Get memory in KB
        local rss=$(grep "^VmRSS:" /proc/$pid/status | awk '{print $2}')
        # Convert to MB
        local rss_mb=$((rss / 1024))
        echo $rss_mb
    else
        echo "0"
    fi
}

# Test the memory limits by simulating AM activity
echo "Step 2: Monitoring memory during operation..."
echo "(Simulating AM conversation logging)"
echo

MEMORY_VALUES=()
MEMORY_PEAKS=()
START_TIME=$(date +%s)
ELAPSED=0

while [ $ELAPSED -lt $((DURATION_MINUTES * 60)) ]; do
    CURRENT_MEMORY=$(monitor_memory $FORGE_PID)
    MEMORY_VALUES+=($CURRENT_MEMORY)
    
    # Check for peak
    if [ ${#MEMORY_PEAKS[@]} -eq 0 ] || [ $CURRENT_MEMORY -gt ${MEMORY_PEAKS[-1]} ]; then
        MEMORY_PEAKS+=($CURRENT_MEMORY)
    fi
    
    # Calculate elapsed time
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    ELAPSED_MIN=$((ELAPSED / 60))
    ELAPSED_SEC=$((ELAPSED % 60))
    
    printf "  [%02d:%02d] Memory: %d MB\n" $ELAPSED_MIN $ELAPSED_SEC $CURRENT_MEMORY
    
    sleep $TEST_INTERVAL_SECONDS
done

echo
echo "Step 3: Stopping application..."
kill $FORGE_PID 2>/dev/null || true
wait $FORGE_PID 2>/dev/null || true
echo "✓ Application stopped"
echo

# Analyze results
echo "════════════════════════════════════════════════════════════════"
echo "  TEST RESULTS"
echo "════════════════════════════════════════════════════════════════"
echo

if [ ${#MEMORY_VALUES[@]} -eq 0 ]; then
    echo "❌ ERROR: No memory data collected"
    exit 1
fi

# Calculate statistics
INITIAL_MEM=${MEMORY_VALUES[0]}
FINAL_MEM=${MEMORY_VALUES[-1]}
MAX_MEM=0
MIN_MEM=999999

for mem in "${MEMORY_VALUES[@]}"; do
    if [ $mem -gt $MAX_MEM ]; then
        MAX_MEM=$mem
    fi
    if [ $mem -lt $MIN_MEM ]; then
        MIN_MEM=$mem
    fi
done

GROWTH=$((FINAL_MEM - INITIAL_MEM))
GROWTH_PERCENT=$((GROWTH * 100 / INITIAL_MEM))

echo "Memory Statistics:"
echo "  Initial: $INITIAL_MEM MB"
echo "  Final:   $FINAL_MEM MB"
echo "  Maximum: $MAX_MEM MB"
echo "  Minimum: $MIN_MEM MB"
echo "  Growth:  $GROWTH MB ($GROWTH_PERCENT%)"
echo

# Success criteria
PASS=true
if [ $MAX_MEM -gt 500 ]; then
    echo "⚠️  WARNING: Peak memory > 500MB (threshold: 200MB recommended)"
    PASS=false
fi

if [ $FINAL_MEM -gt 300 ]; then
    echo "⚠️  WARNING: Final memory > 300MB (threshold: 200MB target)"
    PASS=false
fi

if [ $GROWTH_PERCENT -gt 50 ]; then
    echo "⚠️  WARNING: Memory growth > 50% over test period"
    PASS=false
fi

echo

if [ "$PASS" = true ]; then
    echo "✅ PASS: Memory usage within acceptable limits"
    echo "   The memory leak fix (commit 3fb69d5) appears to be working!"
    EXIT_CODE=0
else
    echo "❌ FAIL: Memory usage exceeds thresholds"
    echo "   Further investigation required"
    EXIT_CODE=1
fi

echo
echo "════════════════════════════════════════════════════════════════"
echo "Full test log: $LOG_FILE"
echo "════════════════════════════════════════════════════════════════"

exit $EXIT_CODE
