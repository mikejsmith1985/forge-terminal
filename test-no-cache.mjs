import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  // Disable cache completely
  ignoreHTTPSErrors: true
});

const page = await context.newPage();

// Enable cache bypass
await page.route('**/*', route => {
  route.continue({
    headers: {
      ...route.request().headers(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
});

console.log('Opening with cache disabled...');
await page.goto('http://localhost:8333', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// Check for AM Monitor
const amCount = await page.locator('.am-monitor').count();
console.log(`\nAM Monitor elements found: ${amCount}`);

if (amCount > 0) {
  console.log('✅ SUCCESS! AM Monitor is now visible!');
  
  const amText = await page.locator('.am-monitor').first().textContent();
  console.log(`  Text: ${amText}`);
} else {
  console.log('❌ Still not visible even with cache bypass');
  
  // Check console for debug log
  await page.evaluate(() => console.log('TEST'));
}

await page.screenshot({ path: './test-results/am-no-cache.png', fullPage: true });
await page.waitForTimeout(3000);
await browser.close();
