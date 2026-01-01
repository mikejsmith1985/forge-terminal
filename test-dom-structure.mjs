import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const errors = [];
page.on('pageerror', error => {
  errors.push(error.message);
});

await page.goto('http://localhost:8333');
await page.waitForTimeout(8000);

console.log('\n=== JavaScript Errors ===');
if (errors.length > 0) {
  errors.forEach(err => console.log('ERROR:', err));
} else {
  console.log('No JavaScript errors');
}

// Check browser source for AMMonitor
const sourceHasAMMonitor = await page.evaluate(() => {
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  return scripts.map(s => s.src);
});

console.log('\n=== Script Tags ===');
sourceHasAMMonitor.forEach(src => console.log(src));

// Try to find the component in the DOM tree
const domStructure = await page.evaluate(() => {
  const terminalControls = document.querySelector('.terminal-controls');
  if (!terminalControls) return { error: 'No .terminal-controls' };
  
  return {
    terminalControls: !!terminalControls,
    nextSibling: terminalControls.nextElementSibling?.className || 'null',
    parentChildren: Array.from(terminalControls.parentElement.children).map(c => c.className)
  };
});

console.log('\n=== DOM Structure ===');
console.log(JSON.stringify(domStructure, null, 2));

await page.screenshot({ path: './test-results/am-dom-debug.png', fullPage: true });
await browser.close();
