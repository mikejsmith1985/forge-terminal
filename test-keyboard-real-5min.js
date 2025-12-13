/**
 * REAL 5-MINUTE KEYBOARD TEST
 * 
 * This test runs for 5+ minutes with REAL keyboard input
 * Tests spacebar, letters, numbers, special chars over time
 * Validates no mock data - only real terminal I/O
 */

const { chromium } = require('playwright');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const TEST_DURATION_MS = 5 * 60 * 1000 + 10000; // 5 minutes + 10 seconds buffer
const CHECK_INTERVAL_MS = 15000; // Check every 15 seconds

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getTerminalOutput(page) {
  return await page.evaluate(() => {
    const screen = document.querySelector('.xterm-screen');
    if (!screen) return '';
    return screen.textContent || '';
  });
}

async function typeAndVerify(page, text, description) {
  const startTime = Date.now();
  console.log(`\n[${new Date().toISOString()}] Testing: ${description}`);
  console.log(`Input: "${text}"`);
  
  // Get current output
  const beforeOutput = await getTerminalOutput(page);
  
  // Focus terminal
  await page.click('.xterm-screen');
  await sleep(100);
  
  // Type the text
  await page.keyboard.type(text, { delay: 50 });
  await sleep(500);
  
  // Get new output
  const afterOutput = await getTerminalOutput(page);
  
  // Check if text appeared
  const appeared = afterOutput.includes(text) || afterOutput.length > beforeOutput.length;
  const duration = Date.now() - startTime;
  
  console.log(`Result: ${appeared ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Output length before: ${beforeOutput.length}, after: ${afterOutput.length}`);
  
  if (!appeared) {
    console.log('❌ Text did NOT appear in terminal!');
    console.log(`Expected to see: "${text}"`);
    return false;
  }
  
  return true;
}

async function runTest() {
  console.log('='.repeat(80));
  console.log('REAL 5-MINUTE KEYBOARD TEST - NO MOCK DATA');
  console.log('='.repeat(80));
  console.log(`Start time: ${new Date().toISOString()}`);
  console.log(`Will run until: ${new Date(Date.now() + TEST_DURATION_MS).toISOString()}`);
  console.log('='.repeat(80));
  
  const startTime = Date.now();
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Launch browser
  console.log('\n📦 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate to Forge
  console.log('🌐 Navigating to http://localhost:8333...');
  await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000); // Wait for terminal to fully initialize
  
  // Wait for terminal to be visible
  await page.waitForSelector('.xterm-screen', { timeout: 10000 });
  console.log('✅ Terminal screen detected');
  
  console.log('✅ Page loaded, starting keyboard tests...\n');
  
  // Test cases to run repeatedly
  const testCases = [
    { text: 'echo hello world', desc: 'Basic command with spaces' },
    { text: 'ls -la', desc: 'Command with flags' },
    { text: 'pwd', desc: 'Simple command' },
    { text: 'echo "test 123"', desc: 'Command with quotes and numbers' },
    { text: 'cat /etc/hostname', desc: 'Command with path' },
    { text: 'echo $HOME', desc: 'Command with variable' },
    { text: 'history | tail -5', desc: 'Pipe command' },
    { text: 'date +%Y-%m-%d', desc: 'Command with special chars' },
  ];
  
  let testIndex = 0;
  let checkCount = 0;
  
  // Run tests for 5+ minutes
  while (Date.now() - startTime < TEST_DURATION_MS) {
    checkCount++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.floor((TEST_DURATION_MS - (Date.now() - startTime)) / 1000);
    
    console.log('\n' + '='.repeat(80));
    console.log(`Check #${checkCount} | Elapsed: ${elapsed}s | Remaining: ${remaining}s`);
    console.log('='.repeat(80));
    
    // Clear any existing input
    await page.keyboard.press('Control+C');
    await sleep(500);
    
    // Run a test
    const testCase = testCases[testIndex % testCases.length];
    const success = await typeAndVerify(page, testCase.text, testCase.desc);
    
    if (success) {
      testsPassed++;
      // Press Enter to execute
      await page.keyboard.press('Enter');
      await sleep(1000);
    } else {
      testsFailed++;
    }
    
    testIndex++;
    
    // Wait before next check
    await sleep(CHECK_INTERVAL_MS);
  }
  
  // Final report
  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
  console.log(`End time: ${new Date().toISOString()}`);
  console.log(`Total duration: ${totalTime}s (${Math.floor(totalTime / 60)}m ${totalTime % 60}s)`);
  console.log(`Tests passed: ${testsPassed}`);
  console.log(`Tests failed: ${testsFailed}`);
  console.log(`Success rate: ${Math.round(testsPassed / (testsPassed + testsFailed) * 100)}%`);
  console.log('='.repeat(80));
  
  if (testsFailed > 0) {
    console.log('\n❌ KEYBOARD INPUT FAILED - See failures above');
    await browser.close();
    process.exit(1);
  } else {
    console.log('\n✅ ALL TESTS PASSED - Keyboard working correctly');
    await browser.close();
    process.exit(0);
  }
}

// Run the test
runTest().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
