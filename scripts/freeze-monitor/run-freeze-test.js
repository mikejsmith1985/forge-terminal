#!/usr/bin/env node
/**
 * Freeze Detection Test Runner
 * 
 * Runs a comprehensive freeze detection test:
 * 1. Starts external monitor (background)
 * 2. Starts Forge Terminal (background)
 * 3. Runs Playwright freeze detection test
 * 4. Collects all logs and generates HTML report
 * 5. Opens report in browser
 * 
 * Usage: node run-freeze-test.js [--duration 300] [--port 8080]
 */

const { spawn, exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Configuration
const config = {
  duration: parseInt(process.argv.find((_, i, a) => a[i-1] === '--duration') || '300'),
  port: parseInt(process.argv.find((_, i, a) => a[i-1] === '--port') || '8080'),
  forgeExe: path.join(__dirname, '../../forge-instrumented.exe'),
  reportDir: path.join(__dirname, 'test-results'),
};

// Ensure directories exist
if (!fs.existsSync(config.reportDir)) {
  fs.mkdirSync(config.reportDir, { recursive: true });
}

const timestamp = Date.now();
const logFile = path.join(config.reportDir, `test-run-${timestamp}.log`);
const forgeLogFile = path.join(config.reportDir, `forge-${timestamp}.log`);
const monitorLogDir = path.join(__dirname, '../../logs/freeze-monitor');

// Process handles
let forgeProcess = null;
let monitorProcess = null;

// Logging
function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

// Wait for server to be ready
function waitForServer(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    const check = () => {
      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/api/version',
        method: 'GET',
        timeout: 2000,
      }, (res) => {
        resolve(true);
      });
      
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(check, 500);
        }
      });
      
      req.end();
    };
    
    check();
  });
}

// Start Forge Terminal
async function startForge() {
  log(`Starting Forge Terminal on port ${config.port}...`);
  
  const forgeLog = fs.openSync(forgeLogFile, 'w');
  
  forgeProcess = spawn(config.forgeExe, [], {
    detached: true,
    stdio: ['ignore', forgeLog, forgeLog],
    env: { ...process.env, PORT: config.port.toString() },
  });
  
  forgeProcess.on('error', (err) => {
    log(`Forge error: ${err.message}`);
  });
  
  log(`Forge started with PID ${forgeProcess.pid}`);
  
  // Wait for server to be ready
  await waitForServer(config.port);
  log('Forge Terminal is ready');
}

// Start external monitor
function startMonitor() {
  log('Starting external freeze monitor...');
  
  monitorProcess = spawn('node', ['monitor.js', '--port', config.port.toString()], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  
  monitorProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line.includes('FREEZE') || line.includes('ERROR')) {
      log(`[MONITOR] ${line}`);
    }
  });
  
  monitorProcess.stderr.on('data', (data) => {
    log(`[MONITOR-ERR] ${data.toString().trim()}`);
  });
  
  log(`Monitor started with PID ${monitorProcess.pid}`);
}

// Run Playwright test
async function runPlaywrightTest() {
  log('Running Playwright freeze detection test...');
  
  return new Promise((resolve) => {
    const playwright = spawn('npx', [
      'playwright', 'test', 'freeze-detection.spec.js',
      '--headed',
      '--timeout', (config.duration * 1000 + 60000).toString(),
    ], {
      cwd: __dirname,
      stdio: 'inherit',
      env: { 
        ...process.env, 
        FORGE_URL: `http://localhost:${config.port}`,
        TEST_DURATION_MS: (config.duration * 1000).toString(),
      },
      shell: true,
    });
    
    playwright.on('close', (code) => {
      log(`Playwright test completed with code ${code}`);
      resolve(code);
    });
  });
}

// Collect logs and generate report
function generateReport() {
  log('Generating combined report...');
  
  // Read all freeze monitor logs
  let freezes = [];
  let metrics = {};
  
  try {
    const files = fs.readdirSync(monitorLogDir);
    for (const file of files) {
      if (file.startsWith('freezes-') && file.endsWith('.json')) {
        const data = JSON.parse(fs.readFileSync(path.join(monitorLogDir, file), 'utf8'));
        freezes = freezes.concat(data);
      }
      if (file.startsWith('metrics-') && file.endsWith('.json')) {
        const data = JSON.parse(fs.readFileSync(path.join(monitorLogDir, file), 'utf8'));
        metrics = { ...metrics, ...data };
      }
    }
  } catch (e) {
    log(`Error reading monitor logs: ${e.message}`);
  }
  
  // Read Forge logs for FREEZE entries
  let forgeFreezeLogs = [];
  try {
    const forgeLogs = fs.readFileSync(forgeLogFile, 'utf8');
    forgeFreezeLogs = forgeLogs.split('\n').filter(l => l.includes('FREEZE'));
  } catch (e) {
    log(`Error reading Forge logs: ${e.message}`);
  }
  
  // Read Playwright results
  let playwrightResults = null;
  try {
    const resultsFile = path.join(__dirname, 'freeze-test-results.json');
    if (fs.existsSync(resultsFile)) {
      playwrightResults = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    }
  } catch (e) {
    log(`Error reading Playwright results: ${e.message}`);
  }
  
  // Generate HTML report
  const reportHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Forge Terminal Freeze Analysis Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 10px; }
    h2 { color: #ff7b72; margin: 30px 0 15px; border-bottom: 1px solid #30363d; padding-bottom: 10px; }
    h3 { color: #7ee787; margin: 20px 0 10px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin: 20px 0; }
    .metric { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 15px; }
    .metric-value { font-size: 28px; font-weight: bold; color: #58a6ff; }
    .metric-label { color: #8b949e; margin-top: 5px; font-size: 12px; }
    .metric.danger .metric-value { color: #ff7b72; }
    .metric.success .metric-value { color: #7ee787; }
    .log-section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 15px; margin: 15px 0; max-height: 400px; overflow-y: auto; }
    .log-entry { font-family: 'Consolas', monospace; font-size: 12px; padding: 3px 0; border-bottom: 1px solid #21262d; }
    .log-entry.freeze { background: #3d1a1a; color: #ff7b72; }
    .log-entry.critical { background: #5c1a1a; color: #ff4444; font-weight: bold; }
    .screenshot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; }
    .screenshot-item { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 10px; }
    .screenshot-item img { width: 100%; border-radius: 4px; }
    .screenshot-item.freeze { border-color: #ff7b72; }
    .verdict { padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .verdict.pass { background: #1a3d1a; border: 2px solid #7ee787; }
    .verdict.fail { background: #3d1a1a; border: 2px solid #ff7b72; }
    .verdict h3 { margin: 0 0 10px; }
    pre { background: #0d1117; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Forge Terminal Freeze Analysis Report</h1>
    <p style="color: #8b949e; margin-bottom: 20px;">Generated: ${new Date().toISOString()}</p>
    
    <div class="verdict ${freezes.length + forgeFreezeLogs.length === 0 ? 'pass' : 'fail'}">
      <h3>${freezes.length + forgeFreezeLogs.length === 0 ? '✅ NO FREEZES DETECTED' : '❌ FREEZES DETECTED'}</h3>
      <p>Total freezes: ${freezes.length} (external monitor) + ${forgeFreezeLogs.length} (backend logs)</p>
    </div>
    
    <div class="summary">
      <div class="metric">
        <div class="metric-value">${config.duration}s</div>
        <div class="metric-label">Test Duration</div>
      </div>
      <div class="metric ${freezes.length > 0 ? 'danger' : 'success'}">
        <div class="metric-value">${freezes.length}</div>
        <div class="metric-label">External Monitor Freezes</div>
      </div>
      <div class="metric ${forgeFreezeLogs.length > 0 ? 'danger' : 'success'}">
        <div class="metric-value">${forgeFreezeLogs.length}</div>
        <div class="metric-label">Backend Freeze Logs</div>
      </div>
      <div class="metric">
        <div class="metric-value">${metrics.heartbeats?.successful || 0}</div>
        <div class="metric-label">Successful Heartbeats</div>
      </div>
      <div class="metric">
        <div class="metric-value">${Math.round(metrics.heartbeats?.avgLatency || 0)}ms</div>
        <div class="metric-label">Avg Heartbeat Latency</div>
      </div>
      <div class="metric">
        <div class="metric-value">${metrics.websocket?.messages || 0}</div>
        <div class="metric-label">WebSocket Messages</div>
      </div>
    </div>
    
    <h2>Backend Freeze Logs</h2>
    <div class="log-section">
      ${forgeFreezeLogs.length === 0 
        ? '<p style="color: #7ee787;">No freeze logs from backend</p>'
        : forgeFreezeLogs.map(l => {
            const isCritical = l.includes('CRITICAL');
            return `<div class="log-entry ${isCritical ? 'critical' : 'freeze'}">${escapeHtml(l)}</div>`;
          }).join('')
      }
    </div>
    
    <h2>External Monitor Freezes</h2>
    <div class="log-section">
      ${freezes.length === 0 
        ? '<p style="color: #7ee787;">No freezes detected by external monitor</p>'
        : `<pre>${JSON.stringify(freezes, null, 2)}</pre>`
      }
    </div>
    
    <h2>Playwright Test Results</h2>
    ${playwrightResults 
      ? `
        <div class="summary">
          <div class="metric">
            <div class="metric-value">${playwrightResults.heartbeats?.length || 0}</div>
            <div class="metric-label">UI Heartbeats</div>
          </div>
          <div class="metric ${(playwrightResults.freezes?.length || 0) > 0 ? 'danger' : 'success'}">
            <div class="metric-value">${playwrightResults.freezes?.length || 0}</div>
            <div class="metric-label">UI Freezes</div>
          </div>
        </div>
        <h3>Screenshots</h3>
        <div class="screenshot-grid">
          ${(playwrightResults.screenshots || []).map(s => `
            <div class="screenshot-item ${s.type === 'freeze' || s.type === 'critical_freeze' ? 'freeze' : ''}">
              <img src="${s.path}" alt="${s.type}" onerror="this.style.display='none'" />
              <p style="color: #8b949e; margin-top: 8px; font-size: 11px;">${s.type}${s.duration ? ` - ${s.duration}ms` : ''}</p>
            </div>
          `).join('')}
        </div>
      `
      : '<p style="color: #8b949e;">Playwright results not available</p>'
    }
    
    <h2>Raw Metrics</h2>
    <div class="log-section">
      <pre>${JSON.stringify(metrics, null, 2)}</pre>
    </div>
    
    <p style="color: #484f58; margin-top: 40px; text-align: center;">
      Forge Terminal Freeze Analysis | ${new Date().toISOString()}
    </p>
  </div>
</body>
</html>`;

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  
  const reportPath = path.join(config.reportDir, `freeze-report-${timestamp}.html`);
  fs.writeFileSync(reportPath, reportHtml);
  log(`Report saved to: ${reportPath}`);
  
  // Open in browser
  try {
    execSync(`start "" "${reportPath}"`, { shell: true });
  } catch (e) {
    log(`Could not open report in browser: ${e.message}`);
  }
  
  return reportPath;
}

// Cleanup
function cleanup() {
  log('Cleaning up...');
  
  if (monitorProcess) {
    monitorProcess.kill();
    log('Monitor stopped');
  }
  
  if (forgeProcess) {
    try {
      process.kill(-forgeProcess.pid); // Kill process group
    } catch (e) {
      try {
        forgeProcess.kill();
      } catch (e2) {}
    }
    log('Forge stopped');
  }
}

// Main
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              FORGE TERMINAL FREEZE DETECTION TEST                    ║
╠══════════════════════════════════════════════════════════════════════╣
║  Duration: ${config.duration}s                                                      ║
║  Port: ${config.port}                                                           ║
║  Report: ${config.reportDir.slice(-50).padEnd(50)}        ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  process.on('SIGINT', () => {
    log('Interrupted, cleaning up...');
    cleanup();
    process.exit(1);
  });

  try {
    // 1. Start Forge
    await startForge();
    
    // 2. Start monitor
    startMonitor();
    
    // 3. Wait a bit for monitor to connect
    await new Promise(r => setTimeout(r, 2000));
    
    // 4. Run Playwright test
    const testResult = await runPlaywrightTest();
    
    // 5. Generate report
    const reportPath = generateReport();
    
    log(`Test complete. Report: ${reportPath}`);
    log(`Test result: ${testResult === 0 ? 'PASS' : 'FAIL'}`);
    
  } catch (err) {
    log(`Error: ${err.message}`);
  } finally {
    cleanup();
  }
}

main();
