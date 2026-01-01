import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Add cache-buster to URL
const timestamp = Date.now();
await page.goto(`http://localhost:8333?v=${timestamp}`);
await page.waitForTimeout(6000);

// Check for AM Monitor
const amCount = await page.locator('.am-monitor').count();
console.log(`AM Monitor elements: ${amCount}`);

if (amCount > 0) {
  console.log('✅ AM Monitor is visible!');
  const text = await page.locator('.am-monitor').first().textContent();
  console.log(`Text: "${text}"`);
  
  const bgColor = await page.locator('.am-monitor').first().evaluate(el => {
    return window.getComputedStyle(el).backgroundColor;
  });
  console.log(`Background color: ${bgColor}`);
} else {
  console.log('❌ AM Monitor still not found');
}

await page.screenshot({ path: './test-results/am-cache-bust.png', fullPage: true });
await browser.close();
