/**
 * Paste Fix Validation - v3.11.7
 * 
 * Tests that paste works reliably after removing duplicate handler.
 * User reported: Paste worked ~17% before fix (83% failure rate)
 * After fix: Should work 100% of the time
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3005';

test.describe('Paste Fix Validation', () => {
  
  test('paste works consistently (100 attempts)', async ({ page, context }) => {
    test.setTimeout(300000); // 5 minutes for 100 iterations
    
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    console.log('[Test] Opening Forge...');
    await page.goto(BASE_URL);
    await page.waitForTimeout(3000);
    
    // Dismiss tour
    const tourSkip = page.locator('button:has-text("Skip")');
    if (await tourSkip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tourSkip.click();
      await page.waitForTimeout(500);
    }
    
    const terminal = page.locator('.xterm-screen, .terminal').first();
    await expect(terminal).toBeVisible({ timeout: 10000 });
    
    // Focus terminal
    await terminal.click({ force: true });
    await page.waitForTimeout(500);
    
    let successCount = 0;
    const attempts = 100;
    
    // Take screenshot at start
    await page.screenshot({ path: 'test-results/paste-100x-start.png', fullPage: true });
    console.log('[Test] Screenshot: Test start');
    
    for (let i = 0; i < attempts; i++) {
      const testText = `PASTE_${i}_${Date.now()}`;
      
      // Copy to clipboard
      await page.evaluate((text) => {
        return navigator.clipboard.writeText(text);
      }, testText);
      
      await page.waitForTimeout(300);
      
      // Paste
      await page.keyboard.press('Control+v');
      
      // Wait for paste to complete
      await page.waitForTimeout(800);
      
      // Check if text appeared
      const pageHTML = await page.content();
      if (pageHTML.includes(testText)) {
        successCount++;
        if ((i+1) % 10 === 0) {
          console.log(`[Test] Progress: ${i+1}/100 - ${successCount}/${i+1} successful (${Math.round(successCount/(i+1)*100)}%)`);
          // Take screenshot every 10 iterations
          await page.screenshot({ path: `test-results/paste-100x-iter${i+1}.png`, fullPage: true });
        }
      } else {
        console.log(`[Test] Attempt ${i+1}: ✗ PASTE FAILED - "${testText}" not found`);
      }
      
      // Clear for next attempt
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    
    const successRate = (successCount / attempts) * 100;
    
    // Take final screenshot
    await page.screenshot({ path: 'test-results/paste-100x-complete.png', fullPage: true });
    
    console.log(`\n[Test] ═══════════════════════════════`);
    console.log(`[Test] Success Rate: ${successRate}%`);
    console.log(`[Test] Successes: ${successCount}/${attempts}`);
    console.log(`[Test] Failures: ${attempts - successCount}/${attempts}`);
    console.log(`[Test] ═══════════════════════════════\n`);
    
    // BEFORE FIX: ~17% (17 out of 100)
    // AFTER FIX: Should be 100% (100 out of 100)
    expect(successRate).toBeGreaterThanOrEqual(95); // Allow 5 failures max
  });
  
});
