/**
 * 60-SECOND REAL KEYBOARD TEST
 * Tests keyboard input with REAL data, not mocks
 * Runs for 60+ seconds with multiple validation checks
 */

const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('='.repeat(80));
  console.log('60-SECOND REAL KEYBOARD TEST');
  console.log('='.repeat(80));
  console.log(`Start: ${new Date().toISOString()}`);
  
  const startTime = Date.now();
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate
  console.log('\n🌐 Loading Forge Terminal...');
  await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Wait for terminal
  console.log('⏳ Waiting for terminal to initialize...');
  await page.waitForSelector('.xterm-screen', { timeout: 15000 });
  await sleep(3000);
  console.log('✅ Terminal ready\n');
  
  // Test function
  async function testKeyboard(testNum, text) {
    const checkStart = Date.now();
    console.log(`[Test ${testNum}] Typing: "${text}"`);
    
    // Focus and type
    await page.click('.xterm-screen');
    await sleep(200);
    await page.keyboard.type(text, { delay: 50 });
    await sleep(500);
    
    // Get output
    const output = await page.evaluate(() => {
      const screen = document.querySelector('.xterm-screen');
      return screen ? screen.textContent : '';
    });
    
    // Verify
    const success = output.includes(text);
    const duration = Date.now() - checkStart;
    
    console.log(`  Result: ${success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Output length: ${output.length} chars`);
    
    if (success) {
      testsPassed++;
      // Execute command
      await page.keyboard.press('Enter');
      await sleep(1000);
    } else {
      testsFailed++;
      console.log(`  ❌ Expected "${text}" in output`);
    }
    
    return success;
  }
  
  // Run tests for 60+ seconds
  const tests = [
    'echo "test 1"',
    'pwd',
    'ls -la',
    'date',
    'echo $USER',
    'whoami',
    'uname -a',
    'echo "with spaces"',
    'history',
    'echo test123',
  ];
  
  let testIndex = 0;
  const targetDuration = 65000; // 65 seconds
  
  while (Date.now() - startTime < targetDuration) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.floor((targetDuration - (Date.now() - startTime)) / 1000);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Elapsed: ${elapsed}s | Remaining: ${remaining}s`);
    console.log('='.repeat(80));
    
    // Clear any pending input
    await page.keyboard.press('Control+C');
    await sleep(300);
    
    // Run test
    const test = tests[testIndex % tests.length];
    await testKeyboard(testIndex + 1, test);
    
    testIndex++;
    await sleep(3000); // 3 second pause between tests
  }
  
  // Final report
  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  console.log('\n' + '='.repeat(80));
  console.log('FINAL RESULTS');
  console.log('='.repeat(80));
  console.log(`End: ${new Date().toISOString()}`);
  console.log(`Duration: ${totalTime}s`);
  console.log(`Tests passed: ${testsPassed}`);
  console.log(`Tests failed: ${testsFailed}`);
  console.log(`Success rate: ${testsPassed + testsFailed > 0 ? Math.round(testsPassed / (testsPassed + testsFailed) * 100) : 0}%`);
  console.log('='.repeat(80));
  
  await browser.close();
  
  if (testsFailed > 0 || testsPassed === 0) {
    console.log('\n❌ KEYBOARD TEST FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ ALL KEYBOARD TESTS PASSED');
    process.exit(0);
  }
}

runTest().catch(err => {
  console.error('\n❌ Test crashed:', err.message);
  process.exit(1);
});
