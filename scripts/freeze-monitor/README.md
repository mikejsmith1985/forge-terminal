# Freeze Detection Monitor

External monitoring system for detecting and diagnosing UI freezes in Forge Terminal.

## Why External Monitoring?

When the terminal freezes, **in-browser JavaScript cannot log anything** because the main thread is blocked. This external monitoring solution runs in a separate process and can detect freezes even when the UI is completely unresponsive.

## Components

### 1. External Monitor (`monitor.js`)
Runs independently and monitors:
- **HTTP Heartbeats**: Periodic requests to `/api/version` to check server responsiveness
- **WebSocket Health**: Monitors PTY connection for message gaps
- **Process Stats**: Tracks forge.exe CPU/memory usage
- **Freeze Detection**: Logs when response times exceed thresholds

### 2. Playwright Freeze Detection (`freeze-detection.spec.js`)
Browser-based monitoring that:
- Injects responsiveness checks into the page
- Measures `requestAnimationFrame` latency
- Captures screenshots when freezes are detected
- Generates visual reports

### 3. Backend Instrumentation
Added to `internal/terminal/handler.go`:
- WebSocket write timing
- PTY read timing  
- Periodic stats logging
- Freeze threshold alerts

## Quick Start

### Run External Monitor Only
```powershell
cd scripts/freeze-monitor
npm install
node monitor.js --port 8080
```

### Run Full Test Suite
```powershell
cd scripts/freeze-monitor
npm install
node run-freeze-test.js --duration 300 --port 8080
```

This will:
1. Build and start Forge Terminal
2. Start the external monitor
3. Run 5-minute Playwright freeze detection
4. Generate HTML report and open in browser

## Log Locations

- **Monitor logs**: `logs/freeze-monitor/monitor-*.log`
- **Freeze events**: `logs/freeze-monitor/freezes-*.json`
- **Metrics**: `logs/freeze-monitor/metrics-*.json`
- **Backend logs**: Check for `[FREEZE-DEBUG]` and `[FREEZE-CRITICAL]` entries
- **Reports**: `scripts/freeze-monitor/test-results/freeze-report-*.html`

## Interpreting Results

### Freeze Thresholds
- **50ms**: Warning (slow but acceptable)
- **500ms**: Critical (noticeable lag)
- **2000ms**: Freeze (unacceptable)

### Common Freeze Causes
1. **Large terminal output**: `term.write()` blocking on huge data chunks
2. **WebSocket backpressure**: Browser can't process messages fast enough
3. **Memory pressure**: GC pauses from excessive allocations
4. **Synchronous operations**: Blocking the main thread

## Debugging with Logs

Look for these patterns in Forge logs:
```
[FREEZE-DEBUG] Slow WebSocket write: 150ms for 4096 bytes
[FREEZE-CRITICAL] WebSocket write blocked for 2.5s - 8192 bytes
[FREEZE-STATS] Messages: 1500, AvgWrite: 5ms, MaxWrite: 150ms
```

In browser console:
```javascript
console.log(window.__wsMessageStats);
console.log(window.__lastFreezeCause);
```

## Next Steps

If freezes are detected:
1. Check which component is slow (PTY read? WebSocket write? Browser rendering?)
2. Look at data sizes - large chunks may need chunking
3. Check memory usage trends
4. Consider async rendering or throttling
