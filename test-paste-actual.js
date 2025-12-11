const { chromium } = require('@playwright/test');
const fs = require('fs');

async function testPaste() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        ACTUAL KEYBOARD PASTE TEST WITH PLAYWRIGHT             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  let testResults = {
    pageLoaded: false,
    terminalFound: false,
    pasteWorked: false,
    errors: []
  };

  page.on('console', msg => {
    if (msg.type() === 'error') {
      testResults.errors.push(msg.text());
    }
    // Log important terminal messages
    if (msg.text().includes('[Terminal]') || msg.text().includes('clipboard')) {
      console.log(`  [Browser Console] ${msg.text()}`);
    }
  });

  try {
    console.log('Step 1: Loading page http://localhost:8333...');
    const response = await page.goto('http://localhost:8333', { 
      waitUntil: 'domcontentloaded',
      timeout: 10000 
    });
    console.log(`  ✓ Page loaded (status: ${response.status()})`);
    testResults.pageLoaded = true;

    // Wait for terminal to initialize
    console.log('\nStep 2: Waiting for terminal initialization...');
    await page.waitForTimeout(2000);
    
    // Check if xterm is loaded
    const hasXterm = await page.evaluate(() => {
      return typeof Terminal !== 'undefined' || 
             document.querySelector('[class*="xterm"]') !== null;
    });
    console.log(`  ${hasXterm ? '✓' : '?'} Terminal found`);
    testResults.terminalFound = hasXterm;

    // Get the terminal iframe or element
    console.log('\nStep 3: Finding terminal input element...');
    const iframes = await page.frames();
    console.log(`  Found ${iframes.length} frame(s)`);
    
    // Click to focus
    await page.click('body');
    await page.waitForTimeout(500);
    console.log('  ✓ Clicked and focused page');

    // Now test paste behavior
    console.log('\nStep 4: Setting up clipboard and testing paste...');
    
    // Set clipboard content from browser
    await page.evaluate(() => {
      return navigator.clipboard.writeText('TEST-PASTE-SUCCESS');
    });
    console.log('  ✓ Set clipboard to: "TEST-PASTE-SUCCESS"');

    // Type "echo " first
    console.log('\nStep 5: Typing "echo " in terminal...');
    await page.keyboard.type('echo ');
    await page.waitForTimeout(300);
    console.log('  ✓ Typed "echo "');

    // Now paste with Ctrl+V
    console.log('\nStep 6: Pressing Ctrl+V to paste...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(1000);
    console.log('  ✓ Ctrl+V pressed');

    // Check page content for the pasted text
    console.log('\nStep 7: Checking if pasted text appears on page...');
    const pageContent = await page.content();
    const pasteFound = pageContent.includes('TEST-PASTE-SUCCESS');
    
    if (pasteFound) {
      console.log('  ✓✓✓ PASTE WORKED - Text found in page ✓✓✓');
      testResults.pasteWorked = true;
    } else {
      console.log('  ✗✗✗ PASTE FAILED - Text NOT found in page ✗✗✗');
      testResults.pasteWorked = false;
      
      // Show what we got instead
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('\n  Page content (first 300 chars):');
      console.log('  ' + bodyText.substring(0, 300).split('\n').join('\n  '));
    }

    // Check for console errors
    console.log('\nStep 8: Checking for JavaScript errors...');
    if (testResults.errors.length === 0) {
      console.log('  ✓ No errors detected');
    } else {
      console.log(`  ✗ ${testResults.errors.length} error(s) detected:`);
      testResults.errors.forEach((err, i) => {
        console.log(`    ${i + 1}. ${err}`);
      });
    }

  } catch (error) {
    console.error('\n✗ Test error:', error.message);
    testResults.errors.push(error.message);
  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST RESULTS                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`Page Loaded:        ${testResults.pageLoaded ? '✓' : '✗'}`);
  console.log(`Terminal Found:     ${testResults.terminalFound ? '✓' : '✗'}`);
  console.log(`Paste Worked:       ${testResults.pasteWorked ? '✓ YES' : '✗ NO'}`);
  console.log(`JS Errors:          ${testResults.errors.length === 0 ? '✓ None' : `✗ ${testResults.errors.length}`}`);

  if (testResults.pasteWorked) {
    console.log('\n✓✓✓ CTRL+V PASTE IS WORKING ✓✓✓\n');
    process.exit(0);
  } else {
    console.log('\n✗✗✗ CTRL+V PASTE IS NOT WORKING ✗✗✗\n');
    process.exit(1);
  }
}

testPaste().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
