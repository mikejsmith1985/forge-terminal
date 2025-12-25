const { chromium } = require('@playwright/test');

async function testPasteDebug() {
  console.log('\n=== CTRL+V PASTE DEBUG TEST ===\n');

  const browser = await chromium.launch({ headless: false }); // Show browser
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  
  const page = await context.newPage();

  // Capture console logs
  page.on('console', (msg) => {
    console.log(`[BROWSER ${msg.type()}]:`, msg.text());
  });

  // Capture errors
  page.on('pageerror', (err) => {
    console.error('[PAGE ERROR]:', err.message);
  });

  try {
    console.log('Loading http://localhost:8333...');
    await page.goto('http://localhost:8333', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Page loaded\n');

    await page.waitForTimeout(4000); // Wait for tabs to load

    console.log('Finding visible terminal...');
    // Wait for at least one visible terminal
    await page.waitForSelector('.terminal-inner:visible', { timeout: 10000 });
    
    // Get all visible terminals and click the first one
    const visibleTerminals = await page.locator('.terminal-inner').filter({ hasText: /./ }).first();
    console.log('Found visible terminal, clicking...');
    await visibleTerminals.click();
    await page.waitForTimeout(500);

    console.log('Typing "echo "...');
    await page.keyboard.type('echo ', { delay: 30 });
    await page.waitForTimeout(500);

    console.log('Setting clipboard to "PASTE-TEST-123"...');
    await page.evaluate(async () => {
      await navigator.clipboard.writeText('PASTE-TEST-123');
    });
    
    console.log('Pressing Ctrl+V...');
    await page.keyboard.press('Control+V');
    
    console.log('Waiting 2 seconds for paste to process...');
    await page.waitForTimeout(2000);

    console.log('Pressing Enter...');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const content = await page.evaluate(() => document.querySelector('.xterm')?.textContent || '');
    
    console.log('\n=== TERMINAL CONTENT (last 500 chars) ===');
    console.log(content.slice(-500));
    console.log('=== END ===\n');

    if (content.includes('PASTE-TEST-123')) {
      console.log('✓✓✓ PASTE WORKED! ✓✓✓');
    } else {
      console.log('✗✗✗ PASTE FAILED ✗✗✗');
    }

    console.log('\nKeeping browser open for 10 seconds for manual inspection...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await browser.close();
  }
}

testPasteDebug().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
