const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.xterm-screen', { timeout: 15000 });
  await page.waitForTimeout(3000);
  
  const tests = ['echo test1', 'pwd', 'whoami', 'date', 'echo "hello world"'];
  let passed = 0, failed = 0;
  const start = Date.now();
  
  while (Date.now() - start < 65000) {
    for (const cmd of tests) {
      await page.keyboard.press('Control+C');
      await page.waitForTimeout(300);
      await page.click('.xterm-screen');
      await page.waitForTimeout(200);
      await page.keyboard.type(cmd, { delay: 50 });
      await page.waitForTimeout(500);
      
      const output = await page.evaluate(() => document.querySelector('.xterm-screen').textContent);
      if (output.includes(cmd.split('"').join(''))) {  // Remove quotes for matching
        passed++;
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
      } else {
        failed++;
      }
      
      if (Date.now() - start >= 65000) break;
    }
  }
  
  const duration = Math.floor((Date.now() - start) / 1000);
  console.log(`Duration: ${duration}s | Passed: ${passed} | Failed: ${failed} | Rate: ${Math.round(passed/(passed+failed)*100)}%`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
