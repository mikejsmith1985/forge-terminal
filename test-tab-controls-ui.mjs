import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    console.log('Opening Forge at http://localhost:7244...');
    await page.goto('http://localhost:7244', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Click Settings button
    console.log('Opening Settings modal...');
    const settingsBtn = await page.waitForSelector('button[aria-label="Settings"], button:has-text("Settings"), .settings-button', { timeout: 5000 });
    await settingsBtn.click();
    await page.waitForTimeout(1000);
    
    // Click Tab Controls tab
    console.log('Clicking Tab Controls tab...');
    const tabControlsTab = await page.waitForSelector('text=Tab Controls', { timeout: 5000 });
    await tabControlsTab.click();
    await page.waitForTimeout(2000);
    
    // Check for error message
    const failedMsg = await page.$('text=Failed to load settings');
    if (failedMsg) {
      console.error('❌ FAILED: "Failed to load settings" error is visible!');
    } else {
      console.log('✓ No error message');
    }
    
    // Check sections
    const checks = {
      globalPresets: await page.$('text=Global Presets'),
      autoClycleRadio: await page.$('label:has-text("Auto-cycle")'),
      visualDiagram: await page.$('text=Visual Preview') || await page.$('.diagram'),
      tab1: await page.$('text=Tab 1'),
      tab20: await page.$('text=Tab 20'),
      terminalTheme: await page.$('text=Terminal Theme'),
      controlRibbon: await page.$('text=Control Ribbon'),
      saveButton: await page.$('button:has-text("Save")')
    };
    
    console.log('\n=== VALIDATION RESULTS ===');
    let allPassed = !failedMsg;
    for (const [key, element] of Object.entries(checks)) {
      const found = !!element;
      console.log(`${found ? '✓' : '❌'} ${key}: ${found ? 'FOUND' : 'NOT FOUND'}`);
      if (!found) allPassed = false;
    }
    
    // Take screenshot
    console.log('\nTaking screenshot...');
    await page.screenshot({ path: 'tab-controls-validation.png', fullPage: true });
    
    console.log(`\n${allPassed ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'}`);
    console.log('Screenshot saved: tab-controls-validation.png');
    
    await page.waitForTimeout(3000);
    
  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await browser.close();
  }
})();
