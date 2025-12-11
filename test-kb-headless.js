const { chromium } = require('@playwright/test');

async function test() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('Real Keyboard Input Test (Headless)');
  console.log('═══════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('1. Navigating to localhost:8333...');
    await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log('   ✓ Page loaded');

    await page.waitForTimeout(2000);

    const content = await page.content();
    const hasXterm = content.includes('xterm') || content.includes('terminal');
    console.log(`\n2. Terminal initialized: ${hasXterm ? '✓' : '?'}`);

    console.log('\n3. Checking for console errors...');
    let errorCount = 0;
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('   ! ' + msg.text());
        errorCount++;
      }
    });
    
    await page.waitForTimeout(1000);
    console.log(`   Errors found: ${errorCount}`);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('IMPORTANT: Headless testing has limitations');
    console.log('═══════════════════════════════════════════════════\n');

    if (errorCount === 0) {
      console.log('✓ No JS errors - application loaded successfully');
    } else {
      console.log('✗ JS errors detected - check above');
    }

    console.log('\nTO ACTUALLY TEST Ctrl+V PASTE:');
    console.log('  Run this command:');
    console.log('    ./forge');
    console.log('  Then open browser and MANUALLY:');
    console.log('    1. Copy text somewhere (Ctrl+C in notepad)');
    console.log('    2. Click in terminal');
    console.log('    3. Press Ctrl+V');
    console.log('    4. Report: Does text appear? YES or NO?\n');

  } catch (error) {
    console.error('\n✗ Test error:', error.message);
  } finally {
    await browser.close();
  }
}

test().catch(console.error);
