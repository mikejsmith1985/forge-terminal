/**
 * Automated test for auto-respond with GitHub Copilot CLI
 * Tests the exact scenario: gh copilot → switch model → ask to install python
 * 
 * Usage: node test-auto-respond-copilot.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'http://localhost:8333';
const RESULTS_DIR = path.join(__dirname, 'test-results', 'auto-respond-copilot');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureState(page, label) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${label}.png`;
  await page.screenshot({ 
    path: path.join(RESULTS_DIR, filename),
    fullPage: true 
  });
  console.log(`📸 Screenshot: ${filename}`);
  
  // Also capture console logs
  const logs = await page.evaluate(() => {
    const entries = [];
    // Get last 50 console entries
    if (window.console._logs) {
      entries.push(...window.console._logs.slice(-50));
    }
    return entries;
  });
  
  return { screenshot: filename, logs };
}

async function getTerminalBuffer(page) {
  return await page.evaluate(() => {
    const terminal = document.querySelector('.xterm-screen');
    if (!terminal) return null;
    
    // Get all text content
    const rows = terminal.querySelectorAll('.xterm-rows > div');
    const lines = Array.from(rows).map(row => row.textContent || '');
    return lines.join('\n');
  });
}

(async () => {
  console.log('🚀 Starting auto-respond test with GitHub Copilot CLI...\n');
  
  const browser = await chromium.launch({ 
    headless: false,  // Run visible so we can see what's happening
    slowMo: 100       // Slow down operations to make them visible
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    console.log(text);
  });
  
  try {
    console.log('1️⃣ Opening Forge Terminal...');
    await page.goto(TEST_URL);
    await sleep(2000);
    await captureState(page, '01-initial-load');
    
    console.log('2️⃣ Creating new tab for test...');
    // Click the + button to create a fresh tab
    await page.click('.new-tab-btn');
    await sleep(1000);
    
    // Get the newly created tab and enable auto-respond on it
    const tabs = await page.locator('.tab').all();
    const newTab = tabs[tabs.length - 1]; // Last tab is the new one
    
    console.log('3️⃣ Enabling auto-respond on new tab...');
    await newTab.click({ button: 'right' });
    await sleep(500);
    
    // Click auto-respond in context menu
    const autoRespondBtn = await page.locator('button:has-text("Auto-respond")').first();
    await autoRespondBtn.click();
    await sleep(1000);
    await captureState(page, '02-auto-respond-enabled');
    
    // Verify it's enabled in console logs
    const hasEnabledLog = consoleLogs.some(log => log.includes('[Auto-Respond] ENABLED'));
    console.log(`   ✓ Auto-respond enabled in logs: ${hasEnabledLog}`);
    
    console.log('4️⃣ Starting copilot in terminal...');
    // Start copilot
    await page.keyboard.type('copilot', { delay: 100 });
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(3000); // Wait for Copilot to load
    await captureState(page, '03-copilot-launched');
    
    console.log('5️⃣ Handling folder consent prompt (if appears)...');
    // Copilot may ask to read folder contents - press 1 or Enter to allow
    await page.keyboard.press('1');
    await sleep(1000);
    await captureState(page, '04-after-consent');
    
    console.log('6️⃣ Asking copilot to install python...');
    await page.keyboard.type('install python', { delay: 100 });
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(8000); // Give Copilot time to generate command and show prompt
    await captureState(page, '05-copilot-prompt');
    
    console.log('7️⃣ Waiting for confirmation prompt...');
    await sleep(3000); // Extra wait for prompt to fully render
    
    // Capture the state when prompt appears
    const state1 = await captureState(page, '06-prompt-showing');
    const buffer1 = await getTerminalBuffer(page);
    
    console.log('\n📋 Terminal buffer at prompt:');
    console.log('─'.repeat(80));
    console.log(buffer1?.slice(-1000) || 'No buffer captured');
    console.log('─'.repeat(80));
    
    // Check if auto-respond logs show detection
    const detectionLogs = consoleLogs.filter(log => 
      log.includes('[Auto-Respond] Detection check') ||
      log.includes('[Auto-Respond] Prompt detected') ||
      log.includes('[Auto-Respond] ACTIVATED')
    );
    
    console.log('\n🔍 Auto-respond detection logs:');
    detectionLogs.forEach(log => console.log(log));
    
    // Wait to see if auto-respond kicks in
    console.log('\n⏳ Waiting 8 seconds to see if auto-respond triggers...');
    await sleep(8000);
    
    const state2 = await captureState(page, '07-after-waiting');
    const buffer2 = await getTerminalBuffer(page);
    
    // Check if the prompt was auto-responded to
    const wasAutoResponded = consoleLogs.some(log => log.includes('[Auto-Respond] ACTIVATED'));
    
    console.log('\n📊 Test Results:');
    console.log('═'.repeat(80));
    console.log(`Auto-respond enabled:     ${hasEnabledLog ? '✅' : '❌'}`);
    console.log(`Prompt detected:          ${detectionLogs.length > 0 ? '✅' : '❌'}`);
    console.log(`Auto-respond activated:   ${wasAutoResponded ? '✅' : '❌'}`);
    console.log(`Buffer changed:           ${buffer1 !== buffer2 ? '✅' : '❌'}`);
    console.log('═'.repeat(80));
    
    // Write detailed report
    const report = {
      timestamp: new Date().toISOString(),
      testName: 'Auto-Respond with GitHub Copilot CLI',
      results: {
        autoRespondEnabled: hasEnabledLog,
        promptDetected: detectionLogs.length > 0,
        autoRespondActivated: wasAutoResponded,
        bufferChanged: buffer1 !== buffer2
      },
      detectionLogs,
      terminalBuffers: {
        beforeWaiting: buffer1?.slice(-1500),
        afterWaiting: buffer2?.slice(-1500)
      },
      allConsoleLogs: consoleLogs
    };
    
    const reportPath = path.join(RESULTS_DIR, 'test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Full report: ${reportPath}`);
    
    console.log('\n✅ Test complete. Press Ctrl+C to close browser or wait 30s...');
    await sleep(30000);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await captureState(page, '99-error');
  } finally {
    await browser.close();
  }
})();
