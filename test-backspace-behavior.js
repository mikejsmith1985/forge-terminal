const puppeteer = require('puppeteer');

/**
 * BACKSPACE BUG REPRODUCTION TEST
 * 
 * This test actually types characters, backspaces them, and validates
 * what's VISIBLE on screen - not just that keys were sent.
 * 
 * The bug: Backspace works sometimes but not always, with delays.
 * User reports: Can delete blank space but not always letters.
 */

(async () => {
  console.log('🧪 Starting Backspace Behavior Test\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 }
  });
  
  const page = await browser.newPage();
  
  // Go to Forge Terminal
  await page.goto('http://localhost:8333');
  await page.waitForSelector('.xterm', { timeout: 10000 });
  
  console.log('✓ Forge Terminal loaded\n');
  
  // Wait for shell prompt to appear
  await new Promise(r => setTimeout(r, 2000));
  
  // Click terminal to focus
  await page.click('.xterm');
  await new Promise(r => setTimeout(r, 500));
  
  console.log('📝 Test 1: Type 20 chars, backspace 10, validate remaining text\n');
  
  // Type 20 characters
  const testString1 = 'ABCDEFGHIJKLMNOPQRST'; // 20 chars
  await page.keyboard.type(testString1, { delay: 50 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  
  // Get visible text before backspace
  let visibleText = await page.evaluate(() => {
    const term = document.querySelector('.xterm');
    const lines = Array.from(term.querySelectorAll('.xterm-rows > div'));
    const lastLine = lines[lines.length - 1];
    return lastLine ? lastLine.innerText : '';
  });
  
  console.log(`   Before backspace: "${visibleText}"`);
  const hasFullString = visibleText.includes(testString1);
  console.log(`   Contains "${testString1}": ${hasFullString ? '✓' : '✗ FAIL'}\n`);
  
  // Backspace 10 times
  console.log('   Pressing Backspace 10 times...');
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Backspace');
    await page.evaluate(() => new Promise(r => setTimeout(r, 100))); // Wait between backspaces
  }
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  
  // Get visible text after backspace
  visibleText = await page.evaluate(() => {
    const term = document.querySelector('.xterm');
    const lines = Array.from(term.querySelectorAll('.xterm-rows > div'));
    const lastLine = lines[lines.length - 1];
    return lastLine ? lastLine.innerText : '';
  });
  
  const expectedRemaining = 'ABCDEFGHIJ'; // First 10 chars should remain
  console.log(`   After 10 backspaces: "${visibleText}"`);
  console.log(`   Expected: "${expectedRemaining}"`);
  const correctRemaining = visibleText.includes(expectedRemaining) && 
                          !visibleText.includes('K'); // K should be deleted
  console.log(`   Correct text remaining: ${correctRemaining ? '✓' : '✗ FAIL'}\n`);
  
  if (!correctRemaining) {
    console.log('   🔴 BACKSPACE BUG DETECTED: Text not deleted correctly!\n');
  }
  
  // Clear line
  await page.keyboard.down('Control'); await page.keyboard.press('KeyC'); await page.keyboard.up('Control');
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  
  console.log('📝 Test 2: Type 40 chars, backspace 20, validate\n');
  
  const testString2 = 'The quick brown fox jumps over lazy dog'; // 40 chars
  await page.keyboard.type(testString2, { delay: 50 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  
  visibleText = await page.evaluate(() => {
    const term = document.querySelector('.xterm');
    const lines = Array.from(term.querySelectorAll('.xterm-rows > div'));
    const lastLine = lines[lines.length - 1];
    return lastLine ? lastLine.innerText : '';
  });
  
  console.log(`   Before backspace: "${visibleText}"`);
  
  // Backspace 20 times
  console.log('   Pressing Backspace 20 times...');
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Backspace');
    await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  }
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  
  visibleText = await page.evaluate(() => {
    const term = document.querySelector('.xterm');
    const lines = Array.from(term.querySelectorAll('.xterm-rows > div'));
    const lastLine = lines[lines.length - 1];
    return lastLine ? lastLine.innerText : '';
  });
  
  const expectedRemaining2 = 'The quick brown fox '; // First 20 chars
  console.log(`   After 20 backspaces: "${visibleText}"`);
  console.log(`   Expected: "${expectedRemaining2}"`);
  const correctRemaining2 = visibleText.includes('The quick brown fox') &&
                           !visibleText.includes('jumps'); // "jumps" should be deleted
  console.log(`   Correct text remaining: ${correctRemaining2 ? '✓' : '✗ FAIL'}\n`);
  
  if (!correctRemaining2) {
    console.log('   🔴 BACKSPACE BUG DETECTED: Text not deleted correctly!\n');
  }
  
  // Clear line
  await page.keyboard.down('Control'); await page.keyboard.press('KeyC'); await page.keyboard.up('Control');
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  
  console.log('📝 Test 3: Rapid backspace (user reported issue)\n');
  
  await page.keyboard.type('HelloWorld', { delay: 50 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  
  // Rapid backspace without delays
  console.log('   Rapidly pressing Backspace 5 times (no delay)...');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Backspace');
    // NO DELAY - this is how users actually type
  }
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  
  visibleText = await page.evaluate(() => {
    const term = document.querySelector('.xterm');
    const lines = Array.from(term.querySelectorAll('.xterm-rows > div'));
    const lastLine = lines[lines.length - 1];
    return lastLine ? lastLine.innerText : '';
  });
  
  console.log(`   After rapid backspace: "${visibleText}"`);
  console.log(`   Expected: "Hello"`);
  const rapidCorrect = visibleText.includes('Hello') && !visibleText.includes('World');
  console.log(`   Correct: ${rapidCorrect ? '✓' : '✗ FAIL - RAPID BACKSPACE FAILS'}\n`);
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 TEST RESULTS:\n');
  console.log(`   Test 1 (20→10): ${correctRemaining ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`   Test 2 (40→20): ${correctRemaining2 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`   Test 3 (Rapid): ${rapidCorrect ? '✓ PASS' : '✗ FAIL'}`);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (!correctRemaining || !correctRemaining2 || !rapidCorrect) {
    console.log('🔴 BACKSPACE BUG CONFIRMED\n');
    console.log('Issue: Backspace not deleting characters correctly');
    console.log('Likely cause: Timing issue or PTY buffer problem\n');
  } else {
    console.log('✅ Backspace working correctly\n');
  }
  
  console.log('Test complete. Browser will stay open for manual inspection.');
  // Keep browser open for inspection
  // await browser.close();
})();
