const { chromium } = require('@playwright/test');

async function test() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('DEBUGGING: Testing attachCustomKeyEventHandler');
  console.log('═══════════════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('1. Loading page...');
    await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('2. Checking how many xterm instances exist...');
    const termCount = await page.evaluate(() => {
      return document.querySelectorAll('.xterm').length;
    });
    console.log(`   Found ${termCount} xterm instances`);

    console.log('\n3. Getting first xterm instance and focusing it...');
    const focused = await page.evaluate(() => {
      const first = document.querySelector('.xterm');
      if (first) {
        first.focus();
        return 'Focused first xterm';
      }
      return 'No xterm found';
    });
    console.log(`   ${focused}`);

    console.log('\n4. Injecting test code to check handler...');
    await page.evaluate(() => {
      // Try to detect if handler was called
      window.handlerCalls = [];
      
      // Patch console.log to capture [Terminal] logs
      const originalLog = console.log;
      console.log = function(...args) {
        const msg = args.join(' ');
        if (msg.includes('[Terminal]')) {
          window.handlerCalls.push(msg);
        }
        originalLog.apply(console, args);
      };
      
      console.log('[TEST] Handler detection injected');
    });

    console.log('\n5. Sending Ctrl+V...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(800);

    console.log('\n6. Checking if handler was called...');
    const calls = await page.evaluate(() => window.handlerCalls || []);
    
    console.log(`Handler log calls: ${calls.length}`);
    calls.forEach(call => console.log(`  - ${call}`));

    if (calls.length > 0) {
      console.log('\n✓ Handler WAS called');
    } else {
      console.log('\n✗ Handler was NOT called');
      console.log('\nThis suggests:');
      console.log('  1. Handler not registered properly');
      console.log('  2. Terminal not focused');
      console.log('  3. Synthetic keyboard event not reaching xterm handler');
    }

    process.exit(calls.length > 0 ? 0 : 1);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

test();
