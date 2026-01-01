import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('http://localhost:8333');
await page.waitForTimeout(3000);

// Get the actual source code being executed
const sourceCode = await page.evaluate(() => {
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  if (scripts.length === 0) return 'No scripts found';
  
  return fetch(scripts[0].src)
    .then(r => r.text())
    .catch(e => `Error: ${e.message}`);
});

// Search for AMMonitor in the source
const hasAMMonitor = sourceCode.includes('AMMonitor');
const hasRenderedLog = sourceCode.includes('AMMonitor.*Rendered') || sourceCode.includes('[AMMonitor] Rendered');
const hasDivWrapper = sourceCode.includes('AM Monitor - Shows LLM activity');

console.log('Source code analysis:');
console.log(`  Has AMMonitor component: ${hasAMMonitor}`);
console.log(`  Has debug log: ${hasRenderedLog}`);
console.log(`  Has new div wrapper: ${hasDivWrapper}`);

if (hasAMMonitor) {
  // Find where AMMonitor is used
  const amMonitorMatches = sourceCode.match(/.{100}AMMonitor.{100}/g);
  if (amMonitorMatches) {
    console.log('\nAMMonitor usage context:');
    amMonitorMatches.slice(0, 3).forEach((m, i) => {
      console.log(`\n  Match ${i + 1}:`);
      console.log(`    ...${m}...`);
    });
  }
}

await browser.close();
