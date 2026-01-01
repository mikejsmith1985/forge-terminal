import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('http://localhost:8333');
await page.waitForTimeout(5000);

// Check React state
const reactState = await page.evaluate(() => {
  // Find React root
  const app = document.querySelector('#root');
  if (!app) return { error: 'No #root' };
  
  // Try to get React fiber
  const fiberKey = Object.keys(app).find(key => key.startsWith('__reactFiber'));
  if (!fiberKey) return { error: 'No React fiber' };
  
  return {
    hasRoot: !!app,
    hasFiber: !!fiberKey,
    tabsExist: !!document.querySelector('.tab-bar'),
    terminalExists: !!document.querySelector('.terminal-container')
  };
});

console.log('React State:', reactState);

// Check if tabs array is populated
const tabsInfo = await page.evaluate(() => {
  const tabBar = document.querySelector('.tab-bar');
  if (!tabBar) return { error: 'No tab bar' };
  
  const tabs = document.querySelectorAll('.tab');
  return {
    tabCount: tabs.length,
    tabIds: Array.from(tabs).map(t => t.getAttribute('data-tab-id') || 'no-id')
  };
});

console.log('Tabs Info:', tabsInfo);

await page.screenshot({ path: './test-results/am-react-debug.png', fullPage: true });
await browser.close();
