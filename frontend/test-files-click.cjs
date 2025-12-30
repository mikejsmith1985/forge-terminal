const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('FREEZE DETECTED')) {
        console.log('ERROR:', text.substring(0, 300));
      }
    }
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message.substring(0, 500)));
  
  await page.goto('http://127.0.0.1:3005');
  await page.waitForTimeout(2000);
  
  // Click Files tab
  console.log('Clicking Files tab...');
  const filesTab = page.locator('button:has-text("Files")').first();
  await filesTab.click({ force: true });
  await page.waitForTimeout(2000);
  
  const hasError = await page.locator('text=Something Went Wrong').isVisible().catch(() => false);
  console.log('Has error boundary:', hasError);
  
  await page.screenshot({ path: 'test-results/after-files-click.png' });
  await browser.close();
  
  process.exit(hasError ? 1 : 0);
})();
