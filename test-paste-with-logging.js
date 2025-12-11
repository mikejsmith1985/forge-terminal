const { chromium } = require('@playwright/test');

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     TESTING CTRL+V WITH DETAILED LOGGING                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const terminalLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Terminal]') || text.includes('Ctrl')) {
      terminalLogs.push(text);
      console.log(`  [Browser] ${text}`);
    }
  });

  try {
    console.log('Loading page...');
    await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('\nFocusing terminal...');
    await page.evaluate(() => {
      const xterm = document.querySelector('.xterm');
      if (xterm) xterm.focus();
    });
    await page.waitForTimeout(300);

    console.log('\nSetting clipboard...');
    await page.evaluate(async () => {
      await navigator.clipboard.writeText('PASTE-TEST-SUCCESS');
      console.log('[TEST] Clipboard set to: PASTE-TEST-SUCCESS');
    });

    console.log('\nSending Ctrl+V (paste)...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(2000);

    console.log('\nChecking if anything was logged about Ctrl+V...');
    if (terminalLogs.length === 0) {
      console.log('  (No [Terminal] logs detected)');
    }

    console.log('\nChecking page content...');
    const content = await page.content();
    const pasteFound = content.includes('PASTE-TEST-SUCCESS');
    console.log(`  Pasted text in page: ${pasteFound ? 'YES' : 'NO'}`);

    if (!pasteFound) {
      const text = await page.evaluate(() => document.body.innerText);
      console.log('\n  Terminal output (last 400 chars):');
      console.log('  ' + text.substring(Math.max(0, text.length - 400)).split('\n').join('\n  '));
    }

    process.exit(pasteFound ? 0 : 1);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

test();
