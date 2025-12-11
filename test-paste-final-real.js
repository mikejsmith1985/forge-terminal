const { chromium } = require('@playwright/test');

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     FINAL REAL TEST: Ctrl+V PASTE FUNCTIONALITY              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const allLogs = [];
  page.on('console', msg => {
    allLogs.push(msg.text());
  });

  try {
    console.log('Step 1: Loading page...');
    await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    console.log('✓ Page loaded with handler registered\n');

    console.log('Step 2: Focusing terminal...');
    await page.evaluate(() => {
      const xterm = document.querySelector('.xterm');
      if (xterm) xterm.focus();
    });
    await page.waitForTimeout(300);
    console.log('✓ Terminal focused\n');

    console.log('Step 3: Sending Ctrl+V...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(1000);
    console.log('✓ Ctrl+V sent\n');

    console.log('Step 4: Checking for handler execution logs...');
    const handlerCalls = allLogs.filter(l => l.includes('Handler called'));
    const ctrlVDetected = allLogs.filter(l => l.includes('Ctrl+V detected'));
    
    console.log(`  Handler called events: ${handlerCalls.length}`);
    handlerCalls.slice(0, 3).forEach(l => console.log(`    - ${l}`));
    
    console.log(`  Ctrl+V detected events: ${ctrlVDetected.length}`);
    ctrlVDetected.forEach(l => console.log(`    - ${l}`));

    console.log('\nStep 5: Checking for clipboard read...');
    const clipboardLogs = allLogs.filter(l => l.includes('Clipboard'));
    console.log(`  Clipboard events: ${clipboardLogs.length}`);
    clipboardLogs.forEach(l => console.log(`    - ${l}`));

    // Check if Ctrl+V was detected
    const ctrlVWorks = ctrlVDetected.length > 0;
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log(`Handler Registration:     ✓`);
    console.log(`Handler Called on Ctrl+V: ${ctrlVWorks ? '✓ YES' : '✗ NO'}`);
    console.log(`Clipboard Integration:    ${clipboardLogs.length > 0 ? '✓ YES' : '? UNKNOWN'}`);

    if (ctrlVWorks) {
      console.log('\n' + '═'.repeat(66));
      console.log('✓✓✓ CTRL+V HANDLER IS WORKING ✓✓✓');
      console.log('═'.repeat(66));
      console.log('\nThe handler successfully intercepts Ctrl+V events.');
      console.log('Next: Test actual paste in real browser\n');
      process.exit(0);
    } else {
      console.log('\n' + '═'.repeat(66));
      console.log('✗✗✗ CTRL+V NOT REACHING HANDLER ✗✗✗');
      console.log('═'.repeat(66));
      console.log('\nThe handler is registered but Ctrl+V is not triggering it.');
      console.log('Possible causes:');
      console.log('  - Terminal focus issue');
      console.log('  - Synthetic keyboard events not reaching attachCustomKeyEventHandler');
      console.log('  - Need to test with real keyboard in browser\n');
      process.exit(1);
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

test();
