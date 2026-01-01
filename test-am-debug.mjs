import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  console.log(`[BROWSER ${msg.type()}]:`, msg.text());
});

page.on('pageerror', error => {
  console.log('[BROWSER ERROR]:', error.message);
});

await page.goto('http://localhost:8333');
await page.waitForTimeout(5000);

// Check if AMMonitor component exists
const amMonitor = await page.locator('.am-monitor').count();
console.log(`\n.am-monitor elements found: ${amMonitor}`);

// Check if activeTab exists
const activeTab = await page.evaluate(() => {
  return window.__FORGE_DEBUG__ || 'No debug info';
});
console.log('Debug info:', activeTab);

// Take screenshot
await page.screenshot({ path: './test-results/am-debug.png', fullPage: true });

await page.waitForTimeout(3000);
await browser.close();
