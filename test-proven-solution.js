const { chromium } = require('@playwright/test');

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       TESTING PROVEN SOLUTION (attachCustomKeyEventHandler)   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const browserLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    browserLogs.push(text);
    if (text.includes('[Terminal]')) {
      console.log(`[LOG] ${text}`);
    }
  });

  try {
    console.log('Step 1: Loading page...');
    await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    console.log('✓ Page loaded\n');

    console.log('Step 2: Focus terminal and send Ctrl+V...');
    await page.evaluate(() => {
      const xterm = document.querySelector('.xterm');
      if (xterm) xterm.focus();
    });
    await page.waitForTimeout(300);

    // Send Ctrl+V - this should trigger attachCustomKeyEventHandler
    console.log('Pressing Ctrl+V...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(1500);

    console.log('\nStep 3: Check if handler was called...');
    const handlerCalled = browserLogs.some(log => 
      log.includes('[Terminal] Ctrl+V') || log.includes('Clipboard')
    );

    console.log(`Handler was called: ${handlerCalled ? 'YES ✓' : 'NO ✗'}`);

    if (handlerCalled) {
      console.log('\n✓✓✓ HANDLER IS WORKING ✓✓✓');
      console.log('The attachCustomKeyEventHandler is receiving Ctrl+V events');
      process.exit(0);
    } else {
      console.log('\n✗✗✗ HANDLER NOT CALLED ✗✗✗');
      console.log('Browser logs:', browserLogs.filter(l => l.includes('[Terminal]')).join('\n'));
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
