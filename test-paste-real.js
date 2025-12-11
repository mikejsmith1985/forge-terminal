const { chromium } = require('@playwright/test');

async function testKeyboardPaste() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         REAL KEYBOARD PASTE TEST WITH PLAYWRIGHT              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  
  // Grant clipboard permissions
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  
  const page = await context.newPage();
  let results = {
    pageLoaded: false,
    terminalReady: false,
    pasteTest: null,
    copyTest: null,
    basicCommandTest: null
  };

  try {
    // Load the page
    console.log('Step 1: Loading Forge Terminal at localhost:8333...');
    await page.goto('http://localhost:8333', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('  ✓ Page loaded');
    results.pageLoaded = true;

    // Wait for terminal to be ready
    console.log('\nStep 2: Waiting for terminal to initialize...');
    await page.waitForTimeout(3000);
    
    // Check if terminal is loaded
    const terminalReady = await page.evaluate(() => {
      return typeof Terminal !== 'undefined' || document.body.innerText.includes('$');
    });
    console.log(`  ${terminalReady ? '✓' : '?'} Terminal appears ready`);
    results.terminalReady = terminalReady;

    // Focus the terminal
    console.log('\nStep 3: Focusing terminal...');
    await page.click('body');
    await page.waitForTimeout(500);
    console.log('  ✓ Terminal focused');

    // TEST 1: Basic command to verify terminal is working
    console.log('\nStep 4: Testing basic terminal command...');
    console.log('  Sending: echo BASIC-TEST');
    
    await page.keyboard.type('echo BASIC-TEST', { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    
    // Get page text
    const afterBasicCommand = await page.evaluate(() => document.body.innerText);
    const basicCommandWorked = afterBasicCommand.includes('BASIC-TEST');
    console.log(`  ${basicCommandWorked ? '✓' : '✗'} Basic command: ${basicCommandWorked ? 'WORKED' : 'FAILED'}`);
    results.basicCommandTest = basicCommandWorked;

    if (!basicCommandWorked) {
      console.log('\n  ✗ Terminal is not responding to keyboard input!');
      console.log('  Page content:');
      console.log(afterBasicCommand.substring(0, 500));
    }

    // TEST 2: Paste with Ctrl+V
    console.log('\nStep 5: Testing Ctrl+V paste...');
    
    // Type the beginning of command
    await page.keyboard.type('echo ', { delay: 50 });
    console.log('  ✓ Typed: "echo "');
    
    // Get clipboard API working
    console.log('  Setting clipboard to: "PASTED-TEXT-SUCCESS"');
    const clipboardSet = await page.evaluate(async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        console.error('Clipboard write failed:', e.message);
        return false;
      }
    }, 'PASTED-TEXT-SUCCESS');
    
    if (!clipboardSet) {
      console.log('  ✗ Could not set clipboard');
    } else {
      console.log('  ✓ Clipboard set');
    }

    // Press Ctrl+V
    console.log('  Pressing Ctrl+V...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(1000);
    console.log('  ✓ Ctrl+V pressed');

    // Press Enter to execute
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    console.log('  ✓ Enter pressed');

    // Check if paste worked
    const afterPaste = await page.evaluate(() => document.body.innerText);
    const pasteWorked = afterPaste.includes('PASTED-TEXT-SUCCESS');
    
    console.log(`\n  ${pasteWorked ? '✓✓✓' : '✗✗✗'} Paste Result: ${pasteWorked ? 'SUCCESS' : 'FAILED'}`);
    results.pasteTest = pasteWorked;

    if (pasteWorked) {
      console.log('  The pasted text appeared in terminal output!');
    } else {
      console.log('  The pasted text did NOT appear in terminal output');
      console.log('\n  Terminal output after paste attempt:');
      console.log('  ' + afterPaste.substring(Math.max(0, afterPaste.length - 400)).split('\n').join('\n  '));
    }

    // TEST 3: Copy with Ctrl+C
    console.log('\nStep 6: Testing Ctrl+C with selection...');
    await page.keyboard.type('echo COPY-TEST-TEXT', { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    console.log('  ✓ Typed and executed: "echo COPY-TEST-TEXT"');
    
    // Try to select text - this is harder in a terminal but we can try
    // Select all with Ctrl+A
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(300);
    
    // Copy with Ctrl+C
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(500);
    console.log('  ✓ Pressed Ctrl+C on selected text');
    
    // Check if anything was copied to clipboard
    const copiedText = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch (e) {
        return null;
      }
    });
    
    const copyWorked = copiedText && copiedText.includes('COPY');
    console.log(`  ${copyWorked ? '✓' : '?'} Copy test: ${copyWorked ? 'Text in clipboard' : 'Could not verify clipboard'}`);
    results.copyTest = copyWorked;

  } catch (error) {
    console.error('\n✗ Test error:', error.message);
  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('Results:');
  console.log(`  Page Loaded:              ${results.pageLoaded ? '✓' : '✗'}`);
  console.log(`  Terminal Ready:           ${results.terminalReady ? '✓' : '✗'}`);
  console.log(`  Basic Command:            ${results.basicCommandTest ? '✓ WORKS' : '✗ FAILED'}`);
  console.log(`  Ctrl+V Paste:             ${results.pasteTest ? '✓ WORKS' : results.pasteTest === null ? '?' : '✗ FAILED'}`);
  console.log(`  Ctrl+C Copy:              ${results.copyTest ? '✓ WORKS' : results.copyTest === null ? '?' : '✗ FAILED'}`);

  console.log('\n' + '═'.repeat(66));
  
  if (results.pasteTest === true) {
    console.log('✓✓✓ PASTE IS WORKING ✓✓✓');
    console.log('═'.repeat(66));
    console.log();
    process.exit(0);
  } else if (results.pasteTest === false) {
    console.log('✗✗✗ PASTE IS BROKEN ✗✗✗');
    console.log('═'.repeat(66));
    console.log();
    process.exit(1);
  } else {
    console.log('? PASTE STATUS UNKNOWN');
    console.log('═'.repeat(66));
    console.log();
    process.exit(2);
  }
}

testKeyboardPaste().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
