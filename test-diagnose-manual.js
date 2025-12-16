#!/usr/bin/env node
/**
 * Manual test for /diagnose command
 * Run with: node test-diagnose-manual.js
 */

const { chromium } = require('playwright');

async function testDiagnoseCommand() {
  console.log('🧪 Testing /diagnose command...\n');
  
  const browser = await chromium.launch({
    headless: true
  });
  
  try {
    const page = await browser.newPage();
    
    // Navigate to Forge Terminal
    console.log('📍 Navigating to http://localhost:8080...');
    await page.goto('http://localhost:8080', { waitUntil: 'load', timeout: 10000 });
    
    // Wait for terminal to load
    console.log('⏳ Waiting for terminal to initialize...');
    await page.waitForSelector('.xterm', { timeout: 10000 });
    await page.waitForTimeout(3000); // Extra time for PTY
    
    // Click terminal to focus
    console.log('🖱️  Clicking terminal to focus...');
    await page.click('.xterm');
    await page.waitForTimeout(500);
    
    // Type /diagnose command
    console.log('⌨️  Typing: /diagnose all');
    await page.keyboard.type('/diagnose all', { delay: 100 });
    await page.waitForTimeout(500);
    
    // Press Enter
    console.log('↩️  Pressing Enter...');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000); // Wait for command to execute
    
    // Get terminal output
    console.log('📄 Reading terminal output...');
    const terminalText = await page.evaluate(() => {
      const xterm = document.querySelector('.xterm');
      return xterm ? xterm.textContent : '';
    });
    
    // Verify output
    console.log('\n═══════════════════════════════════════');
    console.log('📊 TERMINAL OUTPUT (last 1000 chars):');
    console.log('═══════════════════════════════════════');
    console.log(terminalText.slice(-1000));
    console.log('═══════════════════════════════════════\n');
    
    // Test assertions
    const tests = [
      { name: 'Contains "Forge Diagnostic Report"', pass: terminalText.includes('Forge Diagnostic Report') },
      { name: 'Contains "[Keyboard Test]"', pass: terminalText.includes('[Keyboard Test]') },
      { name: 'Contains "[Focus Test]"', pass: terminalText.includes('[Focus Test]') },
      { name: 'Contains "[Overlay Test]"', pass: terminalText.includes('[Overlay Test]') },
      { name: 'Contains "[Terminal Mount Test]"', pass: terminalText.includes('[Terminal Mount Test]') },
      { name: 'Contains "End of Report"', pass: terminalText.includes('End of Report') },
      { name: 'Contains textareaCount', pass: /textareaCount/.test(terminalText) },
      { name: 'Contains spaceEventSeen', pass: /spaceEventSeen/.test(terminalText) },
    ];
    
    console.log('🧪 TEST RESULTS:');
    console.log('═══════════════════════════════════════');
    let passed = 0;
    let failed = 0;
    
    tests.forEach(test => {
      if (test.pass) {
        console.log(`✅ ${test.name}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        failed++;
      }
    });
    
    console.log('═══════════════════════════════════════');
    console.log(`📊 SUMMARY: ${passed}/${tests.length} tests passed`);
    
    if (failed === 0) {
      console.log('✅ ALL TESTS PASSED!\n');
      await browser.close();
      process.exit(0);
    } else {
      console.log(`❌ ${failed} tests failed\n`);
      console.log('❗ Keeping browser open for inspection...');
      console.log('   Press Ctrl+C to exit');
      // Keep browser open for manual inspection
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    await browser.close();
    process.exit(1);
  }
}

// Run test
testDiagnoseCommand().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
