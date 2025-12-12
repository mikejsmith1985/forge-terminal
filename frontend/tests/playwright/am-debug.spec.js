import { test, expect } from '@playwright/test';

test.describe('Debug Test', () => {
  test('screenshot page', async ({ page }) => {
    await page.goto('http://127.0.0.1:8333');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
    
    const html = await page.content();
    console.log('Page HTML:', html.substring(0, 500));
    
    // Try to find any element
    const bodyContent = await page.textContent('body');
    console.log('Body content:', bodyContent?.substring(0, 200));
  });
});
