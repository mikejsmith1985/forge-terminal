import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const logs = [];
page.on('console', msg => {
  logs.push(`[${msg.type()}] ${msg.text()}`);
});

await page.goto('http://localhost:8333');
await page.waitForTimeout(8000);

console.log('=== Console Logs (filtered for AMMonitor) ===');
const amLogs = logs.filter(l => l.includes('AMMonitor'));
if (amLogs.length > 0) {
  amLogs.forEach(l => console.log(l));
} else {
  console.log('❌ NO AMMonitor logs found');
  console.log('\nAll console logs:');
  logs.slice(-10).forEach(l => console.log(l));
}

await page.screenshot({ path: './test-results/am-final-check.png', fullPage: true });
await browser.close();
