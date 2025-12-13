const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.xterm-screen', { timeout: 15000 });
  await page.waitForTimeout(3000);
  
  console.log('Test: Type "echo hello world"');
  await page.click('.xterm-screen');
  await page.waitForTimeout(200);
  await page.keyboard.type('echo hello world', { delay: 50 });
  await page.waitForTimeout(1000);
  
  const output = await page.evaluate(() => document.querySelector('.xterm-screen').textContent);
  console.log('Success:', output.includes('echo hello world'));
  await browser.close();
  process.exit(output.includes('echo hello world') ? 0 : 1);
})();
