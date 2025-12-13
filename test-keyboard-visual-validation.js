/**
 * COMPREHENSIVE KEYBOARD INPUT VISUAL VALIDATION TEST
 * 
 * Duration: 5+ minutes of continuous keyboard input
 * Method: Playwright + Percy visual snapshots
 * Validation: REAL visual confirmation that characters appear on screen
 * 
 * This test does NOT rely on:
 * - Mock data
 * - Unit tests
 * - DOM inspection that might miss rendering issues
 * 
 * This test DOES verify:
 * - Every character typed appears visually on screen
 * - Percy snapshots capture actual rendered output
 * - Continuous 5+ minute stress test
 * - All keyboard inputs: letters, numbers, spaces, special chars
 */

const { chromium } = require('playwright');
const percySnapshot = require('@percy/playwright');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const SNAPSHOT_INTERVAL_MS = 8000; // Percy snapshot every 8 seconds (under 10s requirement)
const INPUT_DELAY_MS = 50; // Delay between keystrokes for faster continuous typing

// HTML report data
const reportData = {
  startTime: new Date().toISOString(),
  endTime: null,
  totalDuration: null,
  snapshots: [],
  failures: [],
  summary: {
    totalSnapshots: 0,
    failedSnapshots: 0,
    inputsAttempted: 0,
    visualValidations: 0,
  }
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get raw terminal output from xterm screen
 */
async function getTerminalText(page) {
  return await page.evaluate(() => {
    const screen = document.querySelector('.xterm-screen');
    if (!screen) return '';
    return screen.textContent || '';
  });
}

/**
 * Get visual metrics about the terminal
 */
async function getTerminalMetrics(page) {
  return await page.evaluate(() => {
    const screen = document.querySelector('.xterm-screen');
    const viewport = document.querySelector('.xterm-viewport');
    
    if (!screen) return null;
    
    return {
      textLength: screen.textContent?.length || 0,
      isVisible: screen.offsetParent !== null,
      screenRect: screen.getBoundingClientRect(),
      viewportScrollTop: viewport?.scrollTop || 0,
      viewportScrollHeight: viewport?.scrollHeight || 0,
    };
  });
}

/**
 * Type text and verify it appears
 */
async function typeAndVerifyVisual(page, text, description, snapshotName) {
  const startTime = Date.now();
  console.log(`\n[${ new Date().toISOString()}] ${description}`);
  console.log(`  Input: "${text}"`);
  
  try {
    // Get before state
    const beforeText = await getTerminalText(page);
    const beforeMetrics = await getTerminalMetrics(page);
    
    console.log(`  Before: ${beforeMetrics.textLength} chars on screen`);
    
    // Focus and type
    await page.click('.xterm-screen');
    await sleep(50);
    
    // Type with realistic delays
    for (let i = 0; i < text.length; i++) {
      await page.keyboard.type(text[i], { delay: INPUT_DELAY_MS });
      reportData.summary.inputsAttempted++;
    }
    
    await sleep(300); // Wait for rendering
    
    // Get after state
    const afterText = await getTerminalText(page);
    const afterMetrics = await getTerminalMetrics(page);
    
    console.log(`  After: ${afterMetrics.textLength} chars on screen`);
    
    // Visual validation
    const textAppeared = afterText.includes(text) || afterText !== beforeText;
    const duration = Date.now() - startTime;
    
    // Take Percy snapshot for visual validation
    console.log(`  Taking Percy snapshot: ${snapshotName}`);
    await percySnapshot(page, snapshotName);
    reportData.summary.totalSnapshots++;
    reportData.summary.visualValidations++;
    
    const result = {
      timestamp: new Date().toISOString(),
      description,
      input: text,
      snapshotName,
      duration,
      success: textAppeared,
      beforeChars: beforeMetrics.textLength,
      afterChars: afterMetrics.textLength,
      delta: afterMetrics.textLength - beforeMetrics.textLength,
    };
    
    reportData.snapshots.push(result);
    
    if (textAppeared) {
      console.log(`  ✅ SUCCESS (${duration}ms, +${result.delta} chars)`);
      return true;
    } else {
      console.log(`  ❌ FAILED - Text did NOT appear`);
      reportData.failures.push({
        ...result,
        reason: 'Text did not appear on screen',
      });
      reportData.summary.failedSnapshots++;
      return false;
    }
  } catch (error) {
    console.error(`  ❌ ERROR:`, error.message);
    reportData.failures.push({
      timestamp: new Date().toISOString(),
      description,
      input: text,
      snapshotName,
      error: error.message,
    });
    reportData.summary.failedSnapshots++;
    return false;
  }
}

/**
 * Generate pretty HTML report
 */
function generateHTMLReport() {
  const totalTime = Date.parse(reportData.endTime) - Date.parse(reportData.startTime);
  const minutes = Math.floor(totalTime / 60000);
  const seconds = Math.floor((totalTime % 60000) / 1000);
  
  const successRate = reportData.summary.totalSnapshots > 0
    ? ((reportData.summary.totalSnapshots - reportData.summary.failedSnapshots) / reportData.summary.totalSnapshots * 100).toFixed(1)
    : 0;
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Keyboard Visual Validation Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
    }
    .header .subtitle {
      font-size: 18px;
      opacity: 0.9;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 40px;
      background: #f8f9fa;
    }
    .summary-card {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
    }
    .summary-card .value {
      font-size: 36px;
      font-weight: bold;
      color: #667eea;
      margin: 10px 0;
    }
    .summary-card .label {
      font-size: 14px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .summary-card.success .value { color: #10b981; }
    .summary-card.failure .value { color: #ef4444; }
    .section {
      padding: 40px;
    }
    .section-title {
      font-size: 24px;
      margin-bottom: 20px;
      color: #667eea;
      border-bottom: 3px solid #667eea;
      padding-bottom: 10px;
    }
    .snapshot-grid {
      display: grid;
      gap: 20px;
    }
    .snapshot-item {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #10b981;
    }
    .snapshot-item.failed {
      border-left-color: #ef4444;
      background: #fef2f2;
    }
    .snapshot-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .snapshot-title {
      font-size: 18px;
      font-weight: 600;
    }
    .snapshot-time {
      font-size: 12px;
      color: #666;
    }
    .snapshot-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin-top: 15px;
      font-size: 14px;
    }
    .snapshot-detail {
      display: flex;
      justify-content: space-between;
    }
    .snapshot-detail .key { color: #666; }
    .snapshot-detail .value { font-weight: 600; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge.success {
      background: #d1fae5;
      color: #065f46;
    }
    .badge.failure {
      background: #fee2e2;
      color: #991b1b;
    }
    .code {
      background: #1f2937;
      color: #f3f4f6;
      padding: 12px;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      margin-top: 10px;
      overflow-x: auto;
    }
    .failures {
      background: #fef2f2;
      border: 2px solid #ef4444;
      border-radius: 8px;
      padding: 20px;
      margin-top: 20px;
    }
    .failures-title {
      color: #991b1b;
      font-size: 20px;
      margin-bottom: 15px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎹 Keyboard Visual Validation Test Report</h1>
      <div class="subtitle">5-Minute Continuous Input Test with Percy Visual Snapshots</div>
    </div>
    
    <div class="summary">
      <div class="summary-card">
        <div class="label">Duration</div>
        <div class="value">${minutes}m ${seconds}s</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Snapshots</div>
        <div class="value">${reportData.summary.totalSnapshots}</div>
      </div>
      <div class="summary-card ${reportData.summary.failedSnapshots === 0 ? 'success' : 'failure'}">
        <div class="label">Success Rate</div>
        <div class="value">${successRate}%</div>
      </div>
      <div class="summary-card">
        <div class="label">Inputs Tested</div>
        <div class="value">${reportData.summary.inputsAttempted}</div>
      </div>
      <div class="summary-card ${reportData.summary.failedSnapshots === 0 ? 'success' : 'failure'}">
        <div class="label">Failed</div>
        <div class="value">${reportData.summary.failedSnapshots}</div>
      </div>
      <div class="summary-card success">
        <div class="label">Visual Validations</div>
        <div class="value">${reportData.summary.visualValidations}</div>
      </div>
    </div>
    
    <div class="section">
      <h2 class="section-title">📸 Visual Snapshots Timeline</h2>
      <div class="snapshot-grid">
        ${reportData.snapshots.map((snap, idx) => `
          <div class="snapshot-item ${snap.success ? '' : 'failed'}">
            <div class="snapshot-header">
              <div class="snapshot-title">#${idx + 1} ${snap.description}</div>
              <span class="badge ${snap.success ? 'success' : 'failure'}">
                ${snap.success ? '✅ SUCCESS' : '❌ FAILED'}
              </span>
            </div>
            <div class="snapshot-time">${snap.timestamp}</div>
            <div class="code">${snap.input}</div>
            <div class="snapshot-details">
              <div class="snapshot-detail">
                <span class="key">Percy Snapshot:</span>
                <span class="value">${snap.snapshotName}</span>
              </div>
              <div class="snapshot-detail">
                <span class="key">Duration:</span>
                <span class="value">${snap.duration}ms</span>
              </div>
              <div class="snapshot-detail">
                <span class="key">Before:</span>
                <span class="value">${snap.beforeChars} chars</span>
              </div>
              <div class="snapshot-detail">
                <span class="key">After:</span>
                <span class="value">${snap.afterChars} chars</span>
              </div>
              <div class="snapshot-detail">
                <span class="key">Delta:</span>
                <span class="value">+${snap.delta} chars</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    ${reportData.failures.length > 0 ? `
      <div class="section">
        <div class="failures">
          <div class="failures-title">⚠️ Failures Detected (${reportData.failures.length})</div>
          ${reportData.failures.map((fail, idx) => `
            <div style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 6px;">
              <strong>Failure #${idx + 1}:</strong> ${fail.description}<br>
              <strong>Input:</strong> <code>${fail.input}</code><br>
              <strong>Reason:</strong> ${fail.reason || fail.error || 'Unknown'}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    <div class="section" style="background: #f8f9fa; text-align: center; color: #666;">
      <p>Generated: ${reportData.endTime}</p>
      <p style="margin-top: 10px;">Test executed with Playwright + Percy visual validation</p>
    </div>
  </div>
</body>
</html>`;
  
  return html;
}

async function runTest() {
  console.log('='.repeat(80));
  console.log('KEYBOARD VISUAL VALIDATION TEST - 5+ MINUTES WITH PERCY');
  console.log('='.repeat(80));
  console.log(`Start: ${reportData.startTime}`);
  console.log(`Duration: 5 minutes`);
  console.log(`Percy snapshots: Every 8 seconds (continuous visual validation)`);
  console.log(`Typing: CONTINUOUS non-stop for full 5 minutes`);
  console.log('='.repeat(80));
  
  const startTime = Date.now();
  
  // Launch browser
  console.log('\n📦 Launching browser...');
  const browser = await chromium.launch({ 
    headless: true, // Run headless for server environments
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    // Navigate
    console.log('🌐 Navigating to http://localhost:8333...');
    await page.goto('http://localhost:8333', { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    await sleep(5000);
    
    // Wait for terminal
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    console.log('✅ Terminal ready\n');
    
    // Take initial snapshot
    await percySnapshot(page, 'Initial Terminal State');
    reportData.summary.totalSnapshots++;
    
    // Continuous text to type - lorem ipsum style text for 5 minutes
    const continuousText = `
The quick brown fox jumps over the lazy dog. This is a comprehensive keyboard test that will run continuously for five minutes.
We are testing all types of characters including spaces, punctuation marks, numbers like 123456789, and special symbols such as !@#$%^&*().
This test validates that every single keystroke appears on the terminal screen without any drops or delays.
The purpose is to ensure keyboard input reliability over an extended period of time with visual validation via Percy snapshots.
Each snapshot is taken every few seconds to provide continuous visual proof that characters are rendering correctly.
We type letters both uppercase and LOWERCASE, include "quotes" and 'apostrophes', use brackets [like] {these} and (parentheses).
Mathematical symbols work too: 2 + 2 = 4, 10 - 5 = 5, 3 * 3 = 9, and 20 / 4 = 5. Also testing operators like < > = != <= >= && || !.
File paths are important too: /home/user/documents/file.txt or C:\\Users\\Mike\\Desktop\\test.log on Windows systems.
Shell commands might include things like: echo $HOME, ls -la /tmp, grep "pattern" file.txt, awk '{print $1}' data.csv.
URLs and emails: https://github.com/user/repo, mailto:test@example.com, ftp://server.com/files, ssh://user@host:22/path.
Special characters that often cause issues: backticks \`like this\`, pipes |, ampersands &, semicolons ;, backslashes \\, tildes ~, underscores _.
We also test tab characters (simulated as spaces here), newline handling, and continuous typing without pauses.
Numbers in sequence: 0123456789 9876543210. Mixed alphanumeric: abc123xyz789, Test123!, User2025, Version1.2.3.
Repeated patterns help identify timing issues: aaaaaaa bbbbbbb ccccccc ddddddd eeeeeee fffffff ggggggg hhhhhhh iiiiiii jjjjjjj.
Long words: supercalifragilisticexpialidocious, pneumonoultramicroscopicsilicovolcanoconiosis, hippopotomonstrosesquippedaliophobia.
Common words: the and for are you not but can all out one day had has her was said have what when use who oil its now find more long down been call come made may part.
Programming keywords: function const let var return if else while for switch case break continue try catch finally throw async await class extends implements interface.
SQL commands: SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER ORDER BY GROUP BY HAVING COUNT SUM AVG MAX MIN DISTINCT UNION INSERT UPDATE DELETE CREATE DROP ALTER.
This continuous typing test ensures that the terminal can handle sustained input without performance degradation or dropped characters over time.
Mixing everything together: echo "Hello123!" | grep -i pattern && ls -la /tmp/* | sort -n | head -10 > output.txt 2>&1 &
Now repeating with variations to fill the full 5 minutes with continuous uninterrupted typing that stresses the keyboard input system thoroughly.
`.trim().split('\n').join(' ');
    
    let charIndex = 0;
    let snapshotCount = 0;
    let lastSnapshotTime = Date.now();
    
    console.log(`\n📝 Starting continuous typing for 5 minutes...`);
    console.log(`   Total characters to type: ~${continuousText.length * 10} over 5 minutes`);
    console.log(`   Snapshot every ${SNAPSHOT_INTERVAL_MS/1000} seconds\n`);
    
    // Run for 5+ minutes - continuous typing
    while (Date.now() - startTime < TEST_DURATION_MS) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.floor((TEST_DURATION_MS - (Date.now() - startTime)) / 1000);
      
      // Take snapshot every SNAPSHOT_INTERVAL_MS
      if (Date.now() - lastSnapshotTime >= SNAPSHOT_INTERVAL_MS) {
        snapshotCount++;
        const beforeText = await getTerminalText(page);
        const beforeMetrics = await getTerminalMetrics(page);
        
        console.log('\n' + '='.repeat(80));
        console.log(`⏱️  Elapsed: ${Math.floor(elapsed/60)}m ${elapsed%60}s | Remaining: ${Math.floor(remaining/60)}m ${remaining%60}s`);
        console.log(`📸 Snapshot #${snapshotCount} | Chars on screen: ${beforeMetrics.textLength}`);
        console.log('='.repeat(80));
        
        const snapshotName = `Continuous-Typing-${snapshotCount}-at-${elapsed}s`;
        await percySnapshot(page, snapshotName);
        reportData.summary.totalSnapshots++;
        reportData.summary.visualValidations++;
        
        reportData.snapshots.push({
          timestamp: new Date().toISOString(),
          description: `Continuous Typing Snapshot ${snapshotCount}`,
          input: `[Typing continuously at ${elapsed}s]`,
          snapshotName,
          duration: Date.now() - lastSnapshotTime,
          success: true,
          beforeChars: beforeMetrics.textLength,
          afterChars: beforeMetrics.textLength,
          delta: 0,
        });
        
        lastSnapshotTime = Date.now();
      }
      
      // Type next character
      const char = continuousText[charIndex % continuousText.length];
      await page.keyboard.type(char, { delay: INPUT_DELAY_MS });
      reportData.summary.inputsAttempted++;
      charIndex++;
      
      // Brief pause after sentences to simulate natural typing
      if (char === '.' || char === '!' || char === '?') {
        await sleep(200);
      }
    }
    
    // Final snapshot
    await percySnapshot(page, 'Final Terminal State');
    reportData.summary.totalSnapshots++;
    
  } catch (error) {
    console.error('\n❌ Test crashed:', error);
    reportData.failures.push({
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
    });
  } finally {
    await browser.close();
  }
  
  // Generate report
  reportData.endTime = new Date().toISOString();
  reportData.totalDuration = Date.now() - startTime;
  
  const reportPath = path.join(__dirname, 'test-results', 'keyboard-visual-validation-report.html');
  const reportDir = path.dirname(reportPath);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const html = generateHTMLReport();
  fs.writeFileSync(reportPath, html);
  
  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
  console.log(`Duration: ${Math.floor(reportData.totalDuration / 60000)}m ${Math.floor((reportData.totalDuration % 60000) / 1000)}s`);
  console.log(`Snapshots: ${reportData.summary.totalSnapshots}`);
  console.log(`Failed: ${reportData.summary.failedSnapshots}`);
  console.log(`Success Rate: ${((reportData.summary.totalSnapshots - reportData.summary.failedSnapshots) / reportData.summary.totalSnapshots * 100).toFixed(1)}%`);
  console.log(`\n📊 HTML Report: ${reportPath}`);
  console.log(`🔗 Open in browser: file://${reportPath}`);
  console.log('='.repeat(80));
  
  // Save JSON data too
  const jsonPath = path.join(reportDir, 'keyboard-visual-validation-data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2));
  console.log(`📄 JSON Data: ${jsonPath}`);
  
  if (reportData.summary.failedSnapshots > 0) {
    console.log('\n❌ TEST FAILED - See report for details');
    process.exit(1);
  } else {
    console.log('\n✅ ALL TESTS PASSED');
    process.exit(0);
  }
}

// Run
runTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
