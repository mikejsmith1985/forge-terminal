/**
 * Manual buffer capture - run this while Copilot is showing a prompt
 * Opens browser console and dumps the terminal buffer contents
 */

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Opening production Forge Terminal on localhost:3005...');
  await page.goto('http://localhost:3005');
  await page.waitForTimeout(3000);
  
  console.log('\n🔍 INSTRUCTIONS:');
  console.log('1. The browser window is now open');
  console.log('2. Enable auto-respond on a tab (right-click → Auto-respond)');
  console.log('3. Run: copilot');
  console.log('4. Ask it to install python');
  console.log('5. When the prompt appears, press ENTER in this console');
  console.log('\nPress ENTER when ready to capture buffer...');
  
  // Wait for user input
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });
  
  console.log('\n📸 Capturing buffer state...\n');
  
  const buffer = await page.evaluate(() => {
    // Get the actual xterm buffer
    const screens = document.querySelectorAll('.xterm-screen');
    const buffers = [];
    
    screens.forEach((screen, idx) => {
      const rows = screen.querySelectorAll('.xterm-rows > div');
      const lines = Array.from(rows).map(row => row.textContent || '');
      buffers.push({
        terminalIndex: idx,
        lines: lines,
        fullText: lines.join('\n')
      });
    });
    
    return buffers;
  });
  
  console.log('═'.repeat(100));
  buffer.forEach((term, idx) => {
    console.log(`\nTERMINAL ${idx + 1}:`);
    console.log('─'.repeat(100));
    console.log(term.fullText.slice(-2000)); // Last 2000 chars
    console.log('─'.repeat(100));
  });
  console.log('═'.repeat(100));
  
  // Also check what lastOutputRef would contain
  const refCheck = await page.evaluate(() => {
    // Try to access the component's ref if possible
    return {
      note: 'Cannot directly access React refs, but buffer above shows what xterm sees'
    };
  });
  
  console.log('\n📋 Now run pattern detection on this buffer...');
  
  // Don't close - leave it open for inspection
  console.log('\nBrowser will stay open. Close manually when done.');
})();
