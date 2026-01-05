/**
 * SIMPLE PASTE TEST - Does paste work at all?
 * v3.11.7
 */

const { test, expect } = require('@playwright/test');

const DEV_SERVER_PORT = process.env.DEV_SERVER_PORT || 3005;
const BASE_URL = `http://localhost:${DEV_SERVER_PORT}`;

test.describe('Basic Paste Test', () => {
  
  test('can paste text once', async ({ page, context }) => {
    test.setTimeout(60000);
    
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    console.log('[Test] Opening Forge...');
    await page.goto(BASE_URL);
    await page.waitForTimeout(3000);
    
    // Dismiss tour if present
    const tourSkip = page.locator('button:has-text("Skip")').first();
    if (await tourSkip.isVisible()) {
      await tourSkip.click();
      console.log('[Test] ✓ Tour dismissed');
      await page.waitForTimeout(500);
    }
    
    // Take initial screenshot
    await page.screenshot({ path: 'test-results/01-app-loaded.png', fullPage: true });
    console.log('[Test] ✓ Screenshot: App loaded');
    
    // Find terminal
    const terminal = page.locator('.xterm-screen').first();
    await expect(terminal).toBeVisible({ timeout: 10000 });
    console.log('[Test] ✓ Terminal visible');
    
    // Click terminal to focus (force if blocked)
    await terminal.click({ force: true });
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'test-results/02-terminal-focused.png', fullPage: true });
    console.log('[Test] ✓ Screenshot: Terminal focused');
    
    // Type something first to verify terminal is working
    await page.keyboard.type('echo "Terminal works"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-results/03-typed-command.png', fullPage: true });
    console.log('[Test] ✓ Screenshot: Typed command');
    
    // Now test paste
    const testText = 'PASTE_WORKS_' + Date.now();
    console.log(`[Test] Copying to clipboard: ${testText}`);
    
    await page.evaluate((text) => {
      navigator.clipboard.writeText(text);
    }, testText);
    
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'test-results/04-before-paste.png', fullPage: true });
    console.log('[Test] ✓ Screenshot: Before paste');
    
    // Paste
    console.log('[Test] Pressing Ctrl+V...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'test-results/05-after-paste.png', fullPage: true });
    console.log('[Test] ✓ Screenshot: After paste');
    
    // Check if text appeared - including in the prompt/compositionview
    const terminalText = await terminal.textContent();
    console.log(`[Test] Terminal full text length: ${terminalText.length}`);
    console.log(`[Test] Terminal text (last 500 chars): ${terminalText.substring(terminalText.length - 500)}`);
    console.log(`[Test] Looking for: "${testText}"`);
    
    // Also check the page HTML for compositionview (where prompt text lives)
    const pageHTML = await page.content();
    const hasInComposition = pageHTML.includes(testText);
    console.log(`[Test] Found in page HTML: ${hasInComposition}`);
    
    if (terminalText.includes(testText)) {
      console.log('[Test] ✅ PASTE WORKED - Text found in terminal textContent');
    } else if (hasInComposition) {
      console.log('[Test] ✅ PASTE WORKED - Text found in composition view (prompt)');
    } else {
      console.log('[Test] ❌ PASTE FAILED - Text NOT found anywhere');
    }
    
    // Accept if text is in terminal OR composition view
    expect(terminalText.includes(testText) || hasInComposition).toBeTruthy();
  });
});
