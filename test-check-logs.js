const { chromium } = require('@playwright/test');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const allLogs = [];
  page.on('console', msg => {
    allLogs.push(msg.text());
  });

  try {
    await page.goto('http://localhost:8333', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('All [Terminal] logs from page:');
    allLogs.filter(l => l.includes('[Terminal]')).forEach(l => {
      console.log(`  ${l.substring(0, 100)}`);
    });

    const registrationLog = allLogs.find(l => l.includes('Registering attachCustom'));
    console.log(`\nHandler registration log found: ${registrationLog ? 'YES' : 'NO'}`);

    if (!registrationLog) {
      console.log('\nERROR: Handler registration code is not executing!');
      console.log('This means the useEffect or attachCustomKeyEventHandler line has an error');
    }

    process.exit(registrationLog ? 0 : 1);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

test();
