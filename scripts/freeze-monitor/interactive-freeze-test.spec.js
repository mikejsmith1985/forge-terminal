/**
 * Interactive Freeze Detection Test
 * 
 * This test simulates actual user interaction (typing, pasting, command execution)
 * to trigger the freezes you're experiencing.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FORGE_URL = process.env.FORGE_URL || 'http://localhost:8333';
const TEST_DURATION_MS = 3 * 60 * 1000; // 3 minutes

const results = {
  startTime: null,
  freezes: [],
  interactions: [],
  summary: {}
};

test.describe('Interactive Freeze Detection', () => {
  test('Simulate actual user interactions', async ({ page }) => {
    results.startTime = Date.now();
    
    // Navigate to Forge Terminal
    console.log(`[Interactive Test] Navigating to ${FORGE_URL}`);
    await page.goto(FORGE_URL, { waitUntil: 'networkidle' });
    
    // Wait for terminal to be ready
    await page.waitForSelector('.xterm', { timeout: 30000 });
    console.log('[Interactive Test] Terminal loaded');
    
    // Focus the terminal
    await page.click('.xterm');
    await page.waitForTimeout(1000);
    
    const endTime = Date.now() + TEST_DURATION_MS;
    let interactionCount = 0;
    let freezeCount = 0;
    
    console.log(`[Interactive Test] Starting ${TEST_DURATION_MS/1000}s interactive session...`);
    
    // Take initial screenshot
    await page.screenshot({ 
      path: path.join(__dirname, 'test-results', 'interactive-start.png'),
      fullPage: true 
    });
    
    while (Date.now() < endTime) {
      const elapsed = Math.floor((Date.now() - results.startTime) / 1000);
      
      // Measure UI responsiveness before interaction
      const beforeInteractionLatency = await page.evaluate(() => {
        return new Promise(resolve => {
          const start = performance.now();
          requestAnimationFrame(() => {
            resolve(performance.now() - start);
          });
        });
      });
      
      // Random interaction pattern
      const action = Math.floor(Math.random() * 5);
      const actionStart = Date.now();
      
      try {
        switch(action) {
          case 0:
            // Type a command
            await page.keyboard.type('echo "Testing freeze ' + interactionCount + '"', { delay: 50 });
            await page.keyboard.press('Enter');
            console.log(`[${elapsed}s] Typed command`);
            break;
            
          case 1:
            // Paste multiline text
            const pasteText = `line1
line2
line3
line4
line5`;
            await page.evaluate((text) => {
              navigator.clipboard.writeText(text);
            }, pasteText);
            await page.keyboard.press('Control+V');
            console.log(`[${elapsed}s] Pasted 5 lines`);
            break;
            
          case 2:
            // Type and cancel
            await page.keyboard.type('ls -la /some/long/path', { delay: 30 });
            await page.keyboard.press('Control+C');
            console.log(`[${elapsed}s] Type + Cancel`);
            break;
            
          case 3:
            // Rapid typing
            await page.keyboard.type('git status && git diff', { delay: 10 });
            await page.keyboard.press('Enter');
            console.log(`[${elapsed}s] Rapid typing`);
            break;
            
          case 4:
            // Switch tabs (if multiple exist)
            await page.keyboard.press('Control+Tab');
            await page.waitForTimeout(200);
            console.log(`[${elapsed}s] Tab switch`);
            break;
        }
        
        interactionCount++;
        const actionDuration = Date.now() - actionStart;
        
        results.interactions.push({
          time: elapsed,
          action,
          duration: actionDuration
        });
        
        // Measure UI responsiveness after interaction
        const afterInteractionLatency = await page.evaluate(() => {
          return new Promise(resolve => {
            const start = performance.now();
            requestAnimationFrame(() => {
              resolve(performance.now() - start);
            });
          });
        });
        
        // Check if interaction caused a freeze
        if (afterInteractionLatency > 100 || actionDuration > 500) {
          freezeCount++;
          const freezeData = {
            time: elapsed,
            action,
            actionDuration,
            rafLatencyBefore: beforeInteractionLatency,
            rafLatencyAfter: afterInteractionLatency,
            severity: afterInteractionLatency > 500 ? 'CRITICAL' : 'WARNING'
          };
          
          results.freezes.push(freezeData);
          
          console.log(`[${elapsed}s] ⚠️ FREEZE DETECTED:`, JSON.stringify(freezeData));
          
          // Capture screenshot
          await page.screenshot({ 
            path: path.join(__dirname, 'test-results', `freeze-${freezeCount}-${elapsed}s.png`),
            fullPage: true 
          });
        }
        
        // Progress report every 30s
        if (elapsed % 30 === 0 && elapsed > 0) {
          console.log(`[Interactive Test] Progress: ${elapsed}s, Interactions: ${interactionCount}, Freezes: ${freezeCount}`);
        }
        
      } catch (error) {
        console.error(`[${elapsed}s] Error during interaction:`, error.message);
      }
      
      // Wait before next interaction
      await page.waitForTimeout(Math.random() * 2000 + 500);
    }
    
    // Final summary
    results.summary = {
      totalDuration: TEST_DURATION_MS / 1000,
      totalInteractions: interactionCount,
      totalFreezes: freezeCount,
      freezeRate: ((freezeCount / interactionCount) * 100).toFixed(1) + '%'
    };
    
    console.log(`[Interactive Test] Complete. Interactions: ${interactionCount}, Freezes: ${freezeCount}`);
    
    // Generate report
    const reportPath = path.join(__dirname, 'interactive-freeze-report.html');
    generateReport(reportPath);
    console.log(`[Interactive Test] Report: ${reportPath}`);
    
    // Take final screenshot
    await page.screenshot({ 
      path: path.join(__dirname, 'test-results', 'interactive-end.png'),
      fullPage: true 
    });
    
    // Assert no critical freezes
    const criticalFreezes = results.freezes.filter(f => f.severity === 'CRITICAL');
    expect(criticalFreezes.length).toBe(0);
  });
});

function generateReport(reportPath) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Interactive Freeze Test Report</title>
  <style>
    body { font-family: system-ui; background: #0d1117; color: #c9d1d9; padding: 40px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #58a6ff; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 30px 0; }
    .metric { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; text-align: center; }
    .metric-value { font-size: 2.5em; font-weight: bold; color: #3fb950; }
    .metric-value.warning { color: #d29922; }
    .metric-value.danger { color: #f85149; }
    .metric-label { color: #8b949e; margin-top: 8px; }
    .freeze-list { margin: 30px 0; }
    .freeze-item { background: #161b22; border-left: 4px solid #f85149; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .freeze-item.warning { border-left-color: #d29922; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #30363d; }
    th { background: #161b22; color: #f0f6fc; }
    code { background: #0d1117; padding: 2px 6px; border-radius: 3px; color: #79c0ff; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎯 Interactive Freeze Test Report</h1>
    <p>Test Duration: ${results.summary.totalDuration}s | Generated: ${new Date().toISOString()}</p>
    
    <div class="summary">
      <div class="metric">
        <div class="metric-value">${results.summary.totalInteractions}</div>
        <div class="metric-label">Total Interactions</div>
      </div>
      <div class="metric">
        <div class="metric-value ${results.summary.totalFreezes > 5 ? 'danger' : results.summary.totalFreezes > 0 ? 'warning' : ''}">${results.summary.totalFreezes}</div>
        <div class="metric-label">Freezes Detected</div>
      </div>
      <div class="metric">
        <div class="metric-value ${parseFloat(results.summary.freezeRate) > 10 ? 'danger' : parseFloat(results.summary.freezeRate) > 5 ? 'warning' : ''}">${results.summary.freezeRate}</div>
        <div class="metric-label">Freeze Rate</div>
      </div>
      <div class="metric">
        <div class="metric-value">${results.freezes.filter(f => f.severity === 'CRITICAL').length}</div>
        <div class="metric-label">Critical Freezes</div>
      </div>
    </div>
    
    ${results.freezes.length > 0 ? `
    <h2>⚠️ Freeze Events</h2>
    <div class="freeze-list">
      ${results.freezes.map(f => `
        <div class="freeze-item ${f.severity === 'WARNING' ? 'warning' : ''}">
          <strong>[${f.time}s] ${f.severity}</strong><br>
          Action: ${getActionName(f.action)}<br>
          Action Duration: <code>${f.actionDuration}ms</code><br>
          RAF Latency: Before <code>${f.rafLatencyBefore.toFixed(2)}ms</code>, After <code>${f.rafLatencyAfter.toFixed(2)}ms</code>
        </div>
      `).join('')}
    </div>
    ` : '<p style="color: #3fb950;">✅ No freezes detected during interactive testing!</p>'}
    
    <h2>📊 All Interactions</h2>
    <table>
      <tr><th>Time</th><th>Action</th><th>Duration</th></tr>
      ${results.interactions.map(i => `
        <tr>
          <td>${i.time}s</td>
          <td>${getActionName(i.action)}</td>
          <td>${i.duration}ms</td>
        </tr>
      `).join('')}
    </table>
  </div>
</body>
</html>`;
  
  fs.writeFileSync(reportPath, html);
}

function getActionName(action) {
  const names = ['Type Command', 'Paste 5 Lines', 'Type + Cancel', 'Rapid Typing', 'Tab Switch'];
  return names[action] || 'Unknown';
}
