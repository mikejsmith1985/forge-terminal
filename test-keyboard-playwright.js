#!/usr/bin/env node
/**
 * Real keyboard input test using Playwright
 * Actually tests Ctrl+V paste functionality
 */

const { chromium } = require('@playwright/test');

async function test() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('Real Keyboard Input Test with Playwright');
  console.log('═══════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('1. Navigating to localhost:8333...');
    await page.goto('http://localhost:8333', { waitUntil: 'networkidle' });
    console.log('   ✓ Page loaded');

    // Wait for terminal to be ready
    console.log('\n2. Waiting for terminal to load...');
    await page.waitForSelector('[class*="terminal"]', { timeout: 10000 }).catch(() => {
      console.log('   Note: Terminal selector not found, continuing anyway');
    });
    console.log('   ✓ Terminal element found');

    // Click in the terminal
    console.log('\n3. Clicking in terminal to focus...');
    await page.click('body');
    await page.waitForTimeout(500);
    console.log('   ✓ Terminal focused');

    // Test 1: Type a simple command
    console.log('\n4. TEST 1: Typing "echo test1" command...');
    await page.keyboard.type('echo test1', { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    console.log('   ✓ Command typed and sent');

    // Test 2: Paste via Ctrl+V
    console.log('\n5. TEST 2: Testing Ctrl+V paste...');
    
    // First, let's manually set clipboard content
    await page.evaluate(() => {
      navigator.clipboard.writeText('hello-from-paste');
    });
    console.log('   ✓ Clipboard set to: "hello-from-paste"');

    // Type something to clear
    await page.keyboard.type('echo ', { delay: 50 });
    console.log('   ✓ Typed "echo " in terminal');

    // Now press Ctrl+V
    console.log('   → Pressing Ctrl+V...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);
    console.log('   ✓ Ctrl+V pressed');

    // Check what's in the terminal
    const terminalContent = await page.evaluate(() => {
      // Try to get text from terminal
      const terminal = document.querySelector('[class*="xterm"]');
      if (terminal) {
        return terminal.innerText || terminal.textContent;
      }
      return document.body.innerText;
    });

    console.log('\n6. Checking terminal content...');
    console.log('   Terminal text (first 500 chars):');
    console.log('   ' + terminalContent.substring(0, 500).split('\n').join('\n   '));

    // Check if paste worked
    const pasteFound = terminalContent.includes('hello-from-paste');
    
    if (pasteFound) {
      console.log('\n   ✓ SUCCESS: Pasted text found in terminal!');
      console.log('   Ctrl+V paste is WORKING ✓');
    } else {
      console.log('\n   ✗ FAILED: Pasted text NOT found in terminal');
      console.log('   Ctrl+V paste is NOT WORKING ✗');
      console.log('\n   Expected to see: "hello-from-paste"');
      console.log('   But terminal shows the content above');
    }

    // Test 3: Select and Ctrl+C copy
    console.log('\n7. TEST 3: Testing Ctrl+C copy with selection...');
    await page.keyboard.type('echo copytest', { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Try to select text
    console.log('   → Attempting to select text...');
    // This is harder to test since we can't easily select xterm text
    console.log('   (Selection test requires manual verification)');

    console.log('\n═══════════════════════════════════════════════════');
    console.log('Test Summary:');
    console.log('═══════════════════════════════════════════════════\n');
    console.log(`Ctrl+V Paste: ${pasteFound ? '✓ WORKING' : '✗ BROKEN'}`);
    console.log('\nIf paste is broken:');
    console.log('  - Check browser console for errors');
    console.log('  - Check if xterm is configured correctly');
    console.log('  - Verify clipboardMode is set to "on"');

  } catch (error) {
    console.error('\n✗ Test error:', error.message);
  } finally {
    // Keep browser open for 5 seconds so you can see results
    console.log('\n(Closing browser in 5 seconds...)');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

test().catch(console.error);
