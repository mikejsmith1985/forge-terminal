/**
 * Playwright Freeze Detection Test
 * 
 * This test continuously monitors the Forge Terminal UI for freezes.
 * It runs in a separate process and can detect when the UI becomes unresponsive.
 * 
 * Run with: npx playwright test freeze-detection.spec.js --headed
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FORGE_URL = process.env.FORGE_URL || 'http://localhost:8333';
const TEST_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 500;
const FREEZE_THRESHOLD_MS = 2000;

// Results storage
const results = {
  startTime: null,
  endTime: null,
  heartbeats: [],
  freezes: [],
  screenshots: [],
};

test.describe('Freeze Detection Monitor', () => {
  test.setTimeout(TEST_DURATION_MS + 60000); // Add buffer

  test('Monitor UI responsiveness for freezes', async ({ page }) => {
    results.startTime = Date.now();
    
    // Navigate to Forge Terminal
    console.log(`[Freeze Test] Navigating to ${FORGE_URL}`);
    await page.goto(FORGE_URL, { waitUntil: 'networkidle' });
    
    // Wait for terminal to be ready
    await page.waitForSelector('.xterm', { timeout: 30000 });
    console.log('[Freeze Test] Terminal loaded');
    
    // Take initial screenshot
    const initialScreenshot = await page.screenshot({ path: 'freeze-test-start.png' });
    results.screenshots.push({ time: Date.now(), path: 'freeze-test-start.png', type: 'initial' });
    
    // Inject heartbeat checker into page
    await page.evaluate(() => {
      window.__freezeTestHeartbeat = {
        lastResponse: Date.now(),
        count: 0,
        maxLatency: 0,
      };
      
      // Create a function that measures UI thread responsiveness
      window.__checkResponsiveness = () => {
        return new Promise((resolve) => {
          const start = performance.now();
          requestAnimationFrame(() => {
            const latency = performance.now() - start;
            window.__freezeTestHeartbeat.lastResponse = Date.now();
            window.__freezeTestHeartbeat.count++;
            window.__freezeTestHeartbeat.maxLatency = Math.max(
              window.__freezeTestHeartbeat.maxLatency, 
              latency
            );
            resolve(latency);
          });
        });
      };
    });
    
    // Monitor loop
    const endTime = Date.now() + TEST_DURATION_MS;
    let lastCheck = Date.now();
    let freezeCount = 0;
    
    console.log(`[Freeze Test] Starting ${TEST_DURATION_MS/1000}s monitoring...`);
    
    while (Date.now() < endTime) {
      const checkStart = Date.now();
      
      try {
        // Call the in-page responsiveness check with timeout
        const latency = await Promise.race([
          page.evaluate(() => window.__checkResponsiveness()),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), FREEZE_THRESHOLD_MS)
          )
        ]);
        
        const totalLatency = Date.now() - checkStart;
        
        results.heartbeats.push({
          time: Date.now(),
          latency: totalLatency,
          frameLatency: latency,
        });
        
        // Check for freeze
        if (totalLatency > FREEZE_THRESHOLD_MS) {
          freezeCount++;
          console.log(`[Freeze Test] 🔴 FREEZE DETECTED: ${totalLatency}ms`);
          
          // Take screenshot
          const screenshotPath = `freeze-${freezeCount}-${Date.now()}.png`;
          await page.screenshot({ path: screenshotPath });
          
          results.freezes.push({
            time: Date.now(),
            duration: totalLatency,
            screenshot: screenshotPath,
          });
          results.screenshots.push({ 
            time: Date.now(), 
            path: screenshotPath, 
            type: 'freeze',
            duration: totalLatency 
          });
        }
        
        lastCheck = Date.now();
        
      } catch (err) {
        // Timeout or error - definitely a freeze
        const duration = Date.now() - checkStart;
        freezeCount++;
        console.log(`[Freeze Test] 🔴 CRITICAL FREEZE: ${duration}ms - ${err.message}`);
        
        const screenshotPath = `freeze-critical-${freezeCount}-${Date.now()}.png`;
        try {
          await page.screenshot({ path: screenshotPath, timeout: 10000 });
          results.screenshots.push({ 
            time: Date.now(), 
            path: screenshotPath, 
            type: 'critical_freeze',
            duration 
          });
        } catch (e) {
          console.log('[Freeze Test] Could not capture screenshot');
        }
        
        results.freezes.push({
          time: Date.now(),
          duration,
          error: err.message,
          screenshot: screenshotPath,
        });
      }
      
      // Wait for next interval
      await page.waitForTimeout(HEARTBEAT_INTERVAL_MS);
      
      // Progress report every 30 seconds
      if (results.heartbeats.length % 60 === 0) {
        const elapsed = (Date.now() - results.startTime) / 1000;
        console.log(`[Freeze Test] Progress: ${elapsed.toFixed(0)}s, Freezes: ${freezeCount}`);
      }
    }
    
    results.endTime = Date.now();
    
    // Take final screenshot
    await page.screenshot({ path: 'freeze-test-end.png' });
    results.screenshots.push({ time: Date.now(), path: 'freeze-test-end.png', type: 'final' });
    
    // Generate report
    const report = generateReport(results);
    fs.writeFileSync('freeze-test-report.html', report);
    fs.writeFileSync('freeze-test-results.json', JSON.stringify(results, null, 2));
    
    console.log(`[Freeze Test] Complete. Freezes detected: ${freezeCount}`);
    console.log('[Freeze Test] Report: freeze-test-report.html');
    
    // Fail test if freezes were detected
    expect(freezeCount, 'Freezes were detected during monitoring').toBe(0);
  });
});

function generateReport(results) {
  const duration = (results.endTime - results.startTime) / 1000;
  const avgLatency = results.heartbeats.length > 0 
    ? results.heartbeats.reduce((a, b) => a + b.latency, 0) / results.heartbeats.length 
    : 0;
  const maxLatency = results.heartbeats.length > 0
    ? Math.max(...results.heartbeats.map(h => h.latency))
    : 0;
  
  const freezeList = results.freezes.map(f => `
    <div class="freeze-item">
      <span class="freeze-time">${new Date(f.time).toISOString()}</span>
      <span class="freeze-duration">${f.duration}ms</span>
      ${f.screenshot ? `<img src="${f.screenshot}" class="freeze-screenshot" />` : ''}
    </div>
  `).join('');
  
  const screenshotList = results.screenshots.map(s => `
    <div class="screenshot-item ${s.type}">
      <img src="${s.path}" />
      <p>${s.type} - ${new Date(s.time).toISOString()}${s.duration ? ` (${s.duration}ms)` : ''}</p>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <title>Freeze Detection Report - Forge Terminal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #00d4ff; margin-bottom: 20px; }
    h2 { color: #ff6b6b; margin: 30px 0 15px; border-bottom: 1px solid #333; padding-bottom: 10px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .metric { background: #16213e; border-radius: 10px; padding: 20px; }
    .metric-value { font-size: 36px; font-weight: bold; color: #00d4ff; }
    .metric-label { color: #888; margin-top: 5px; }
    .metric.danger .metric-value { color: #ff6b6b; }
    .metric.success .metric-value { color: #4ade80; }
    .freeze-item { background: #2a1a1a; border-left: 4px solid #ff6b6b; padding: 15px; margin: 10px 0; border-radius: 5px; }
    .freeze-time { color: #888; }
    .freeze-duration { color: #ff6b6b; font-weight: bold; margin-left: 20px; }
    .freeze-screenshot { max-width: 400px; margin-top: 10px; border: 1px solid #333; border-radius: 5px; }
    .screenshot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .screenshot-item { background: #16213e; padding: 15px; border-radius: 10px; }
    .screenshot-item img { width: 100%; border-radius: 5px; }
    .screenshot-item p { margin-top: 10px; color: #888; font-size: 12px; }
    .screenshot-item.freeze { border: 2px solid #ff6b6b; }
    .screenshot-item.critical_freeze { border: 2px solid #ff0000; background: #2a1a1a; }
    .no-freezes { background: #1a2a1a; border: 2px solid #4ade80; padding: 30px; border-radius: 10px; text-align: center; }
    .no-freezes h3 { color: #4ade80; font-size: 24px; }
    .chart { height: 200px; background: #16213e; border-radius: 10px; padding: 15px; margin: 20px 0; position: relative; overflow: hidden; }
    .chart-bar { position: absolute; bottom: 30px; width: 2px; background: #00d4ff; }
    .chart-bar.freeze { background: #ff6b6b; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Freeze Detection Report</h1>
    <p style="color: #888; margin-bottom: 20px;">Forge Terminal UI Responsiveness Test</p>
    
    <div class="summary">
      <div class="metric">
        <div class="metric-value">${duration.toFixed(1)}s</div>
        <div class="metric-label">Test Duration</div>
      </div>
      <div class="metric">
        <div class="metric-value">${results.heartbeats.length}</div>
        <div class="metric-label">Heartbeats</div>
      </div>
      <div class="metric ${results.freezes.length > 0 ? 'danger' : 'success'}">
        <div class="metric-value">${results.freezes.length}</div>
        <div class="metric-label">Freezes Detected</div>
      </div>
      <div class="metric">
        <div class="metric-value">${avgLatency.toFixed(0)}ms</div>
        <div class="metric-label">Avg Latency</div>
      </div>
      <div class="metric ${maxLatency > 1000 ? 'danger' : ''}">
        <div class="metric-value">${maxLatency.toFixed(0)}ms</div>
        <div class="metric-label">Max Latency</div>
      </div>
    </div>
    
    <h2>Latency Timeline</h2>
    <div class="chart" id="latencyChart">
      ${results.heartbeats.slice(-200).map((h, i, arr) => {
        const height = Math.min(h.latency / 10, 170);
        const isFreeze = h.latency > 2000;
        return `<div class="chart-bar ${isFreeze ? 'freeze' : ''}" style="left: ${(i/arr.length)*100}%; height: ${height}px;"></div>`;
      }).join('')}
    </div>
    
    <h2>Freezes</h2>
    ${results.freezes.length === 0 
      ? '<div class="no-freezes"><h3>✓ No Freezes Detected</h3><p>The UI remained responsive throughout the test.</p></div>'
      : freezeList
    }
    
    <h2>Screenshots</h2>
    <div class="screenshot-grid">
      ${screenshotList}
    </div>
    
    <p style="color: #666; margin-top: 40px; text-align: center;">
      Generated ${new Date().toISOString()} | Forge Terminal Freeze Monitor
    </p>
  </div>
</body>
</html>`;
}
