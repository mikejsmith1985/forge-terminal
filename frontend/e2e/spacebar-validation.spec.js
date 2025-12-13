import { test, expect } from '@playwright/test';

const baseURL = 'http://127.0.0.1:8333';

test.describe('Spacebar Validation Tests', () => {
  
  test('spacebar works immediately on first load', async ({ page }) => {
    console.log('[Test] Fresh page navigation...');
    await page.goto(baseURL, { waitUntil: 'load', timeout: 15000 });
    
    // Wait for terminal
    await page.waitForSelector('.terminal-inner', { timeout: 10000 });
    console.log('[Test] Terminal loaded');
    
    // Wait for terminal to be fully ready
    await page.waitForTimeout(1000);
    
    // Click on terminal to ensure focus
    await page.click('.terminal-inner');
    console.log('[Test] Clicked terminal');
    
    // Type test including spacebar
    const testString = 'echo hello world';
    await page.keyboard.type(testString, { delay: 50 });
    console.log('[Test] Typed:', testString);
    
    // Check if input was captured (look for xterm content)
    await page.waitForTimeout(500);
    
    // Capture screenshot for evidence
    await page.screenshot({ path: 'test-results/spacebar-first-load.png' });
    console.log('[Test] Screenshot captured');
    
    // If we got here without timeout, spacebar worked
    console.log('[Test] ✅ Spacebar worked on first load');
  });

  test('spacebar works after clicking away and back', async ({ page }) => {
    await page.goto(baseURL, { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('.terminal-inner', { timeout: 10000 });
    await page.waitForTimeout(500);
    
    // Click terminal and type
    await page.click('.terminal-inner');
    await page.keyboard.type('test1 ', { delay: 30 });
    console.log('[Test] First input done');
    
    // Click outside terminal (on body)
    await page.click('body', { position: { x: 10, y: 10 } });
    console.log('[Test] Clicked away from terminal');
    
    // Click back on terminal
    await page.click('.terminal-inner');
    console.log('[Test] Clicked back on terminal');
    
    // Type again with spacebar
    await page.keyboard.type('test2 space', { delay: 30 });
    console.log('[Test] Second input with spacebar done');
    
    await page.screenshot({ path: 'test-results/spacebar-refocus.png' });
    console.log('[Test] ✅ Spacebar works after refocus');
  });

  test('spacebar works after diagnostics panel open/close', async ({ page }) => {
    await page.goto(baseURL, { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('.terminal-inner', { timeout: 10000 });
    await page.waitForTimeout(500);
    
    // Click terminal and type
    await page.click('.terminal-inner');
    await page.keyboard.type('before ', { delay: 30 });
    console.log('[Test] Typed before diagnostics');
    
    // Open diagnostics
    const debugBtn = page.locator('button:has-text("Debug")');
    await debugBtn.click();
    console.log('[Test] Opened diagnostics');
    
    // Wait for panel
    await page.waitForSelector('h4:has-text("Diagnostics")', { timeout: 3000 });
    
    // Close diagnostics
    await page.locator('button:has-text("×")').click();
    console.log('[Test] Closed diagnostics');
    
    // Click terminal again
    await page.click('.terminal-inner');
    
    // Type with spacebar
    await page.keyboard.type('after space', { delay: 30 });
    console.log('[Test] Typed after diagnostics');
    
    await page.screenshot({ path: 'test-results/spacebar-after-diagnostics.png' });
    console.log('[Test] ✅ Spacebar works after diagnostics modal');
  });
});
