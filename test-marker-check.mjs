import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto(`http://localhost:8333?v=${Date.now()}`);
await page.waitForTimeout(5000);

// Look for the red marker text
const markerText = await page.locator('text=AM Monitor Container').count();
console.log(`Marker text found: ${markerText}`);

if (markerText > 0) {
  console.log('✅ SUCCESS! New code is loaded!');
} else {
  console.log('❌ Marker not found - old code still loading');
}

// Check what JS file is being loaded
const scripts = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
});

console.log('\nLoaded scripts:');
scripts.forEach(s => console.log(`  ${s}`));

await page.screenshot({ path: './test-results/am-marker-check.png', fullPage: true });
await browser.close();
