const { chromium } = require('@playwright/test');

async function testKeyboardPaste() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         REAL KEYBOARD PASTE TEST WITH PLAYWRIGHT              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  
  const page = await context.newPage();
  let pasteWorked = false;
  let copyWorked = false;
  let basicWorked = false;

  try {
    console.log('Step 1: Loading page...');
    await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    console.log('  ✓ Page loaded');

    console.log('\nStep 2: Waiting for terminal...');
    await page.waitForTimeout(2000);
    console.log('  ✓ Waited for terminal');

    console.log('\nStep 3: Focusing terminal...');
    await page.click('body').catch(() => {});
    await page.waitForTimeout(500);
    console.log('  ✓ Focused');

    // TEST 1: Basic command
    console.log('\nStep 4: Test basic command "echo BASIC-TEST"');
    await page.keyboard.type('echo BASIC-TEST', { delay: 30 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const afterBasic = await page.content();
    basicWorked = afterBasic.includes('BASIC-TEST');
    console.log(`  ${basicWorked ? '✓' : '✗'} Basic: ${basicWorked ? 'WORKS' : 'FAILED'}`);

    if (!basicWorked) {
      console.log('\n  ERROR: Terminal not responding to keyboard input');
      throw new Error('Terminal not responding');
    }

    // TEST 2: Paste
    console.log('\nStep 5: Test Ctrl+V paste');
    
    // Type prefix
    await page.keyboard.type('echo ', { delay: 30 });
    console.log('  Typed: "echo "');
    
    // Set clipboard
    await page.evaluate(async () => {
      await navigator.clipboard.writeText('PASTED-SUCCESS');
    });
    console.log('  Set clipboard to: "PASTED-SUCCESS"');
    
    // Press Ctrl+V
    console.log('  Pressing Ctrl+V...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);
    
    // Press Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    
    // Check result
    const afterPaste = await page.content();
    pasteWorked = afterPaste.includes('PASTED-SUCCESS');
    console.log(`  ${pasteWorked ? '✓' : '✗'} Paste: ${pasteWorked ? 'WORKS' : 'FAILED'}`);

    if (!pasteWorked) {
      const text = await page.evaluate(() => document.body.innerText);
      console.log('\n  Page content after paste:');
      console.log('  ' + text.substring(Math.max(0, text.length - 300)).split('\n').join('\n  '));
    }

  } catch (error) {
    console.error('\nError:', error.message);
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST RESULTS                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Basic Command Test:     ${basicWorked ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Ctrl+V Paste Test:      ${pasteWorked ? '✓ PASS' : '✗ FAIL'}`);

  if (pasteWorked) {
    console.log('\n' + '═'.repeat(66));
    console.log('✓✓✓ CTRL+V PASTE IS WORKING ✓✓✓');
    console.log('═'.repeat(66) + '\n');
    process.exit(0);
  } else {
    console.log('\n' + '═'.repeat(66));
    console.log('✗✗✗ CTRL+V PASTE IS NOT WORKING ✗✗✗');
    console.log('═'.repeat(66) + '\n');
    process.exit(1);
  }
}

testKeyboardPaste().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
