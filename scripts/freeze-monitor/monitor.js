#!/usr/bin/env node
/**
 * External Freeze Monitor for Forge Terminal
 * 
 * This runs OUTSIDE the browser to detect freezes by:
 * 1. Sending periodic HTTP heartbeat requests to the server
 * 2. Monitoring WebSocket connection health via test connections
 * 3. Tracking Go process CPU/memory usage
 * 4. Logging all metrics to external files
 * 
 * Usage: node monitor.js [--port 8080] [--interval 500]
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

// Configuration
const config = {
  port: parseInt(process.argv.find((_, i, a) => a[i-1] === '--port') || '8080'),
  interval: parseInt(process.argv.find((_, i, a) => a[i-1] === '--interval') || '500'),
  logDir: path.join(__dirname, '../../logs/freeze-monitor'),
  maxLogSize: 10 * 1024 * 1024, // 10MB
};

// Ensure log directory exists
if (!fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

// Log files
const logFile = path.join(config.logDir, `monitor-${Date.now()}.log`);
const metricsFile = path.join(config.logDir, `metrics-${Date.now()}.json`);
const freezeFile = path.join(config.logDir, `freezes-${Date.now()}.json`);

// State
let metrics = {
  startTime: Date.now(),
  heartbeats: { total: 0, successful: 0, failed: 0, avgLatency: 0 },
  websocket: { connected: false, messages: 0, errors: 0, lastMessage: null },
  process: { pid: null, cpuHistory: [], memoryHistory: [] },
  freezes: [],
};

let latencyHistory = [];
const FREEZE_THRESHOLD_MS = 2000; // 2 seconds = definite freeze

// Logging
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, message, ...data };
  const line = `[${timestamp}] [${level}] ${message} ${JSON.stringify(data)}\n`;
  
  // Console output with colors
  const colors = { INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m', FREEZE: '\x1b[41m\x1b[37m' };
  const reset = '\x1b[0m';
  console.log(`${colors[level] || ''}${line.trim()}${reset}`);
  
  // File output
  fs.appendFileSync(logFile, line);
  
  return entry;
}

// HTTP Heartbeat - Tests if server is responsive
async function sendHeartbeat() {
  const start = Date.now();
  
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: config.port,
      path: '/api/version',
      method: 'GET',
      timeout: 5000,
    }, (res) => {
      const latency = Date.now() - start;
      metrics.heartbeats.total++;
      metrics.heartbeats.successful++;
      
      latencyHistory.push(latency);
      if (latencyHistory.length > 100) latencyHistory.shift();
      metrics.heartbeats.avgLatency = latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length;
      
      if (latency > 500) {
        log('WARN', 'Slow heartbeat response', { latency });
      }
      
      resolve({ success: true, latency });
    });
    
    req.on('error', (err) => {
      const latency = Date.now() - start;
      metrics.heartbeats.total++;
      metrics.heartbeats.failed++;
      log('ERROR', 'Heartbeat failed', { error: err.message, latency });
      resolve({ success: false, latency, error: err.message });
    });
    
    req.on('timeout', () => {
      const latency = Date.now() - start;
      metrics.heartbeats.total++;
      metrics.heartbeats.failed++;
      log('ERROR', 'Heartbeat timeout', { latency });
      req.destroy();
      resolve({ success: false, latency, error: 'timeout' });
    });
    
    req.end();
  });
}

// WebSocket Monitor - Tests PTY connection
let wsConnection = null;
let wsMessageCount = 0;
let lastWsMessage = Date.now();

function connectWebSocket() {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    return;
  }
  
  try {
    wsConnection = new WebSocket(`ws://localhost:${config.port}/ws/pty?tabId=monitor-test`);
    
    wsConnection.on('open', () => {
      log('INFO', 'WebSocket connected for monitoring');
      metrics.websocket.connected = true;
    });
    
    wsConnection.on('message', (data) => {
      const now = Date.now();
      const gap = now - lastWsMessage;
      lastWsMessage = now;
      wsMessageCount++;
      metrics.websocket.messages = wsMessageCount;
      metrics.websocket.lastMessage = now;
      
      // Check for message gap (potential freeze indicator)
      if (gap > FREEZE_THRESHOLD_MS && wsMessageCount > 10) {
        log('FREEZE', 'WebSocket message gap detected', { 
          gap, 
          messageCount: wsMessageCount,
          dataSize: data.length 
        });
        recordFreeze('websocket_gap', gap, { dataSize: data.length });
      }
    });
    
    wsConnection.on('error', (err) => {
      log('ERROR', 'WebSocket error', { error: err.message });
      metrics.websocket.errors++;
      metrics.websocket.connected = false;
    });
    
    wsConnection.on('close', () => {
      log('WARN', 'WebSocket closed');
      metrics.websocket.connected = false;
      wsConnection = null;
      // Reconnect after delay
      setTimeout(connectWebSocket, 2000);
    });
  } catch (err) {
    log('ERROR', 'WebSocket connection failed', { error: err.message });
  }
}

// Process Monitor - Track CPU/Memory of forge.exe
function getProcessStats() {
  return new Promise((resolve) => {
    // Windows: use wmic
    exec('wmic process where "name=\'forge.exe\'" get ProcessId,WorkingSetSize,PercentProcessorTime /format:csv', 
      { timeout: 5000 }, 
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        
        const lines = stdout.trim().split('\n').filter(l => l.includes('forge'));
        if (lines.length === 0) {
          resolve(null);
          return;
        }
        
        try {
          const parts = lines[0].split(',');
          const stats = {
            timestamp: Date.now(),
            pid: parseInt(parts[2]) || 0,
            memory: parseInt(parts[3]) || 0, // bytes
            cpu: parseInt(parts[1]) || 0,
          };
          
          metrics.process.pid = stats.pid;
          metrics.process.cpuHistory.push(stats.cpu);
          metrics.process.memoryHistory.push(stats.memory);
          
          // Keep last 100 samples
          if (metrics.process.cpuHistory.length > 100) metrics.process.cpuHistory.shift();
          if (metrics.process.memoryHistory.length > 100) metrics.process.memoryHistory.shift();
          
          resolve(stats);
        } catch (e) {
          resolve(null);
        }
      }
    );
  });
}

// Freeze Detection & Recording
function recordFreeze(type, duration, context = {}) {
  const freeze = {
    timestamp: Date.now(),
    type,
    duration,
    context,
    metrics: {
      heartbeatAvgLatency: metrics.heartbeats.avgLatency,
      wsConnected: metrics.websocket.connected,
      wsMessages: metrics.websocket.messages,
    }
  };
  
  metrics.freezes.push(freeze);
  
  // Write to freeze file immediately
  fs.writeFileSync(freezeFile, JSON.stringify(metrics.freezes, null, 2));
  
  log('FREEZE', `FREEZE RECORDED: ${type}`, { duration, context });
  
  // Sound alert (Windows)
  try {
    exec('powershell -c "[console]::beep(1000, 500)"');
  } catch (e) {}
}

// Playwright UI Responsiveness Check
async function checkUIResponsiveness() {
  // This would require playwright - for now we'll use HTTP as a proxy
  // A more robust version would use playwright to actually click and measure response
  return sendHeartbeat();
}

// Main monitoring loop
let lastHeartbeat = Date.now();
let consecutiveFailures = 0;

async function monitorLoop() {
  // 1. HTTP Heartbeat
  const heartbeat = await sendHeartbeat();
  const now = Date.now();
  
  if (!heartbeat.success) {
    consecutiveFailures++;
    if (consecutiveFailures >= 3) {
      const gap = now - lastHeartbeat;
      log('FREEZE', 'Server unresponsive', { consecutiveFailures, gap });
      recordFreeze('server_unresponsive', gap, { consecutiveFailures });
    }
  } else {
    if (heartbeat.latency > FREEZE_THRESHOLD_MS) {
      log('FREEZE', 'Heartbeat latency exceeded threshold', { latency: heartbeat.latency });
      recordFreeze('slow_heartbeat', heartbeat.latency, {});
    }
    consecutiveFailures = 0;
    lastHeartbeat = now;
  }
  
  // 2. Process stats
  await getProcessStats();
  
  // 3. Save metrics periodically
  if (metrics.heartbeats.total % 20 === 0) {
    fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
  }
}

// Start monitoring
console.log(`
╔══════════════════════════════════════════════════════════════╗
║           FORGE TERMINAL - EXTERNAL FREEZE MONITOR           ║
╠══════════════════════════════════════════════════════════════╣
║  Port: ${config.port.toString().padEnd(54)}║
║  Interval: ${config.interval}ms${' '.repeat(49 - config.interval.toString().length)}║
║  Log: ${logFile.slice(-52).padEnd(54)}║
╚══════════════════════════════════════════════════════════════╝
`);

log('INFO', 'Monitor started', { config });

// Connect WebSocket
connectWebSocket();

// Start monitoring loop
setInterval(monitorLoop, config.interval);

// Graceful shutdown
process.on('SIGINT', () => {
  log('INFO', 'Shutting down monitor');
  fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
  if (wsConnection) wsConnection.close();
  process.exit(0);
});

// Keep process alive
process.stdin.resume();

// Report summary every 30 seconds
setInterval(() => {
  const runtime = (Date.now() - metrics.startTime) / 1000;
  log('INFO', 'Status report', {
    runtime: `${runtime.toFixed(0)}s`,
    heartbeats: `${metrics.heartbeats.successful}/${metrics.heartbeats.total}`,
    avgLatency: `${metrics.heartbeats.avgLatency.toFixed(0)}ms`,
    wsMessages: metrics.websocket.messages,
    freezes: metrics.freezes.length,
  });
}, 30000);
