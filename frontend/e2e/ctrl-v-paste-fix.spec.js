import { test, expect } from '@playwright/test';

/**
 * Issue #1: Ctrl+V Paste is Broken
 * 
 * This test validates that Ctrl+V paste works in the terminal.
 * RED: This test should FAIL until the fix is applied.
 */

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3005';

test.describe('Ctrl+V Paste Fix', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Dismiss tour overlay if present - must click Skip button
    try {
      // Wait briefly for tour to appear
      await page.waitForSelector('.tour-overlay', { timeout: 3000 });
      
      // Find and click the Skip button
      const skipButton = page.locator('button:has-text("Skip")');
      if (await skipButton.isVisible()) {
        await skipButton.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // Tour not present or already dismissed
    }
    
    // Ensure tour overlay is gone
    await page.waitForSelector('.tour-overlay', { state: 'hidden', timeout: 5000 }).catch(() => {});
    
    // Wait for terminal to be ready
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000); // Let terminal fully initialize
  });

  test('Ctrl+V pastes clipboard content into terminal', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Put test text in clipboard
    const testText = 'echo "paste-test-success"';
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, testText);
    
    // Focus the terminal
    const terminal = page.locator('.xterm-screen');
    await terminal.click();
    await page.waitForTimeout(200);
    
    // Press Ctrl+V to paste
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(500);
    
    // Take screenshot of terminal after paste
    await page.screenshot({ 
      path: 'test-results/ctrl-v-paste-result.png',
      fullPage: false 
    });
    
    // Verify the text was pasted by checking terminal content
    // The terminal should now show the pasted command
    const terminalContent = await page.locator('.xterm-rows').textContent();
    
    // The pasted text should appear in terminal
    expect(terminalContent).toContain('echo');
    expect(terminalContent).toContain('paste-test-success');
  });

  // Note: Right-click paste is handled differently in xterm.js
  // It may trigger browser context menu instead of automatic paste
  // The Ctrl+V test above verifies the primary paste functionality
});
