const { chromium } = require('@playwright/test');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  try {
    console.log('Loading page...');
    await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('Testing keydown event detection...');
    
    // Add a keydown listener to detect if events are fired
    await page.evaluate(() => {
      window.testLog = [];
      document.addEventListener('keydown', (e) => {
        window.testLog.push(`keydown: ${e.key}`);
      }, true);
      
      // Also check xterm's custom handler
      console.log('Testing if attachCustomKeyEventHandler exists...');
    });

    // Send keyboard input
    console.log('Sending Ctrl+V...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);

    // Check what was logged
    const testLog = await page.evaluate(() => window.testLog || []);
    console.log('\nKeyboard events detected:');
    testLog.forEach(entry => console.log('  ' + entry));

    // Check console logs
    console.log('\nBrowser console logs:');
    logs.forEach(log => {
      if (log.includes('[Terminal]') || log.includes('keydown') || log.includes('attachCustom')) {
        console.log('  ' + log);
      }
    });

    if (testLog.length === 0) {
      console.log('  (No keyboard events detected)');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

test();
