const { chromium } = require('@playwright/test');

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         KEYBOARD PASTE TEST (FIXED FOCUS)                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();

  try {
    console.log('Loading page...');
    await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('Finding xterm element...');
    // Find the xterm-screen element which is where keyboard input goes
    const xtermFound = await page.evaluate(() => {
      const elem = document.querySelector('.xterm');
      return elem ? true : false;
    });
    console.log(`  ${xtermFound ? '✓' : '✗'} xterm element: ${xtermFound ? 'found' : 'not found'}`);

    // Focus the xterm element
    console.log('Focusing xterm element...');
    await page.evaluate(() => {
      const xterm = document.querySelector('.xterm');
      if (xterm) xterm.focus();
    });
    await page.waitForTimeout(300);

    console.log('Sending test input...');
    // Use page.keyboard which sends to the focused element
    await page.keyboard.type('echo KEYBOARD-TEST', { delay: 30 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);

    const result = await page.content();
    const worked = result.includes('KEYBOARD-TEST');

    console.log(`\nResult: ${worked ? '✓ KEYBOARD INPUT WORKS' : '✗ KEYBOARD INPUT FAILED'}`);

    if (!worked) {
      console.log('\nDEBUG: Page content:');
      const text = await page.evaluate(() => document.body.innerText);
      console.log(text.substring(0, 400));
    }

    process.exit(worked ? 0 : 1);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

test();
