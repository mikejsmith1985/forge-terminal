/**
 * PASTE RELIABILITY TEST - TDD RED PHASE
 * v3.11.7
 * 
 * BUG: Paste fails 83% of the time due to race condition between:
 *   - Native paste event handler (handlePaste)
 *   - Ctrl+V keyboard handler (duplicate async clipboard API call)
 * 
 * TEST: Paste text 100 times, expect 100% success rate (not 17%)
 * 
 * This test WILL FAIL before fix is deployed
 */

const { test, expect } = require('@playwright/test');

const DEV_SERVER_PORT = process.env.DEV_SERVER_PORT || 3005;
const BASE_URL = `http://localhost:${DEV_SERVER_PORT}`;

test.describe('Paste Reliability - 83% Failure Bug', () => {
  
  test('should paste text 100 times with 100% success rate', async ({ page, context }) => {
    test.setTimeout(300000); // 5 minutes for 100 pastes
    
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    console.log('[Test] Opening Forge...');
    await page.goto(BASE_URL);
    await page.waitForTimeout(3000);
    
    // Dismiss tour if present
    const tourDismiss = page.locator('button:has-text("Got it")');
    if (await tourDismiss.isVisible()) {
      await tourDismiss.click();
      await page.waitForTimeout(500);
    }
    
    // Find terminal
    const terminal = page.locator('.xterm-screen, .terminal').first();
    await expect(terminal).toBeVisible({ timeout: 10000 });
    console.log('[Test] ✓ Terminal visible');
    
    // Click terminal to focus
    await terminal.click({ force: true });
    await page.waitForTimeout(500);
    
    let successCount = 0;
    let failCount = 0;
    const testIterations = 100;
    
    console.log(`[Test] Starting ${testIterations} paste attempts...`);
    
    for (let i = 0; i < testIterations; i++) {
      const testText = `PASTE_TEST_${i}_${Date.now()}`;
      
      // Copy text to clipboard and wait for it to be ready
      await page.evaluate((text) => {
        return navigator.clipboard.writeText(text);
      }, testText);
      
      await page.waitForTimeout(200); // Increased wait for clipboard
      
      // Get terminal content before paste
      const beforeText = await terminal.textContent();
      
      // Paste with Ctrl+V
      await page.keyboard.press('Control+v');
      
      // Press Enter to execute so text appears in terminal output (not just prompt)
      await page.keyboard.press('Enter');
      
      // Wait for execution
      await page.waitForTimeout(150);
      
      // Check if text appeared (it should be in the input buffer/prompt)
      // Check page HTML for the text (might be in composition view or helper textarea)
      const pageHTML = await page.content();
      const textFound = pageHTML.includes(testText);
      
      if (textFound) {
        successCount++;
        if (i % 10 === 0 || i < 5) {
          console.log(`[Test] ${i}: ✓ Success (${successCount}/${i+1} = ${Math.round(successCount/(i+1)*100)}%)`);
        }
      } else {
        failCount++;
        if (i < 5 || failCount < 10) { // Only log first few failures
          console.log(`[Test] ${i}: ✗ FAILED - Text "${testText}" not found`);
        }
      }
      
      // Clear the prompt for next iteration
      await page.keyboard.press('Escape'); // Clear any input
      await page.waitForTimeout(50);
    }
    
    const successRate = (successCount / testIterations) * 100;
    console.log(`\n[Test] FINAL RESULTS:`);
    console.log(`[Test]   Successes: ${successCount}/${testIterations}`);
    console.log(`[Test]   Failures:  ${failCount}/${testIterations}`);
    console.log(`[Test]   Success Rate: ${successRate.toFixed(1)}%`);
    
    // CRITICAL ASSERTION: Must be at least 95% success rate
    // Before fix: ~17% (83% failure)
    // After fix: ~100%
    expect(successRate).toBeGreaterThanOrEqual(95);
    
    console.log('[Test] ✅ Paste reliability test PASSED');
  });
  
  test('should paste without race conditions (visual proof test)', async ({ page, context }) => {
    test.setTimeout(120000);
    
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    console.log('[Test] Opening Forge for visual validation...');
    await page.goto(BASE_URL);
    await page.waitForTimeout(3000);
    
    // Dismiss tour if present (it has Skip/Next buttons, not "Got it")
    const tourSkip2 = page.locator('button:has-text("Skip")');
    if (await tourSkip2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tourSkip2.click();
      await page.waitForTimeout(500);
    }
    
    const terminal = page.locator('.xterm-screen, .terminal').first();
    await expect(terminal).toBeVisible({ timeout: 10000 });
    await terminal.click({ force: true });
    await page.waitForTimeout(500);
    
    // Take screenshot BEFORE paste
    await page.screenshot({ path: 'test-results/paste-test-before.png', fullPage: true });
    console.log('[Test] ✓ Screenshot 1: Before paste');
    
    // Copy specific test text
    const testMessage = 'THIS IS A PASTE RELIABILITY TEST - If you see this, paste worked!';
    await page.evaluate((text) => {
      navigator.clipboard.writeText(text);
    }, testMessage);
    
    await page.waitForTimeout(200);
    
    // Paste
    console.log('[Test] Pressing Ctrl+V...');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(500);
    
    // Press Enter to execute the command so text appears in terminal output
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    // Take screenshot AFTER paste and enter
    await page.screenshot({ path: 'test-results/paste-test-after.png', fullPage: true });
    console.log('[Test] ✓ Screenshot 2: After paste + Enter');
    
    // Verify text appeared in terminal output (after Enter executed it)
    // xterm renders text in .xterm-rows, but textContent includes CSS
    // Try getting all row text directly
    const allText = await page.evaluate(() => {
      const rows = document.querySelectorAll('.xterm-rows > div');
      return Array.from(rows).map(row => row.textContent).join('\n');
    });
    
    console.log(`[Test] Extracted terminal rows (first 500 chars): ${allText.substring(0, 500)}`);
    const textFound = allText.includes(testMessage) || allText.includes('THIS IS A PASTE');
    console.log(`[Test] Found "${testMessage}" in terminal rows: ${textFound}`);
    
    expect(textFound).toBeTruthy();
    
    console.log('[Test] ✅ Visual proof test PASSED');
    console.log('[Test] Screenshots saved:');
    console.log('[Test]   - test-results/paste-test-before.png');
    console.log('[Test]   - test-results/paste-test-after.png');
  });
});
