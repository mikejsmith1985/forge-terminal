/**
 * DIAGNOSTIC TEST - Capture actual terminal output
 */
const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDiagnostic() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Loading page...');
  await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.xterm-screen', { timeout: 15000 });
  await sleep(3000);
  
  console.log('\nTest 1: Type "echo test"');
  await page.click('.xterm-screen');
  await sleep(200);
  
  // Type character by character
  for (const char of 'echo test') {
    await page.keyboard.type(char);
    await sleep(100);
  }
  
  await sleep(1000);
  
  // Get actual terminal content
  const output = await page.evaluate(() => {
    const screen = document.querySelector('.xterm-screen');
    return screen ? screen.textContent : '';
  });
  
  console.log('\n=== TERMINAL OUTPUT (last 500 chars) ===');
  console.log(output.slice(-500));
  console.log('=== END OUTPUT ===\n');
  
  console.log(`Output includes "echo test": ${output.includes('echo test')}`);
  console.log(`Output includes "echo": ${output.includes('echo')}`);
  console.log(`Output includes "test": ${output.includes('test')}`);
  
  await browser.close();
}

runDiagnostic().catch(console.error);
