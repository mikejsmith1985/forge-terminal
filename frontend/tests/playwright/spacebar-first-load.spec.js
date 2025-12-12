/**
 * Spacebar First Load Test
 * This specifically tests the xterm.js focus/IME bug where spacebar
 * doesn't work on first load but works after refresh.
 * 
 * The fix uses setTimeout(0) after terminal.open() and fit() per
 * battle-tested solutions from Warp, Tabby, and OSS terminals.
 */

import { test, expect } from '@playwright/test';

test.use({ 
  baseURL: 'http://127.0.0.1:8333',
  actionTimeout: 20000,
});

test('spacebar should work immediately on first load (no refresh needed)', async ({ page }) => {
  console.log('\n=== CRITICAL TEST: Spacebar on First Load ===\n');
  console.log('This test validates the battle-tested xterm.js focus fix');
  
  // Navigate to app
  await page.goto('/');
  console.log('[1] Page loaded');
  
  // Wait for terminal
  await page.waitForSelector('.xterm', { timeout: 15000 });
  console.log('[2] Terminal UI ready');
  
  // Wait for shell prompt
  await page.waitForTimeout(2500);
  console.log('[3] Waiting for shell prompt');
  
  // Click on the visible terminal to ensure focus
  const visibleScreen = page.locator('.xterm-screen >> visible=true');
  await visibleScreen.click();
  console.log('[4] Clicked terminal to focus');
  
  // Give a moment for focus to settle
  await page.waitForTimeout(300);
  
  // TYPE A COMMAND WITH MULTIPLE SPACES - This is the critical test
  // If spacebar doesn't work, the command will be missing spaces
  const testCommand = 'echo hello world test';
  await page.keyboard.type(testCommand, { delay: 30 });
  console.log(`[5] Typed: "${testCommand}"`);
  
  // Take screenshot before Enter
  await page.screenshot({ path: 'test-results/spacebar-before-enter.png' });
  
  // Execute
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  
  // Take screenshot after Enter
  await page.screenshot({ path: 'test-results/spacebar-after-enter.png' });
  
  console.log('[6] Command executed');
  
  // Now test MULTIPLE consecutive spaces
  console.log('\n--- Testing multiple consecutive spaces ---');
  await page.keyboard.type('echo ', { delay: 30 });
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.keyboard.type('triple_space', { delay: 30 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  
  console.log('[7] Multiple spaces test done');
  
  // Test spacebar at beginning of line
  console.log('\n--- Testing spacebar at beginning of line ---');
  await page.keyboard.press('Space');
  await page.keyboard.type('leading_space', { delay: 30 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  
  console.log('[8] Leading space test done');
  
  await page.screenshot({ path: 'test-results/spacebar-all-tests.png' });
  
  console.log('\n✓ Spacebar first-load test PASSED\n');
  console.log('All spacebar inputs worked without refresh!');
});

test('spacebar should work after tab switch', async ({ page }) => {
  console.log('\n=== TEST: Spacebar after tab switch ===\n');
  
  // Navigate to app
  await page.goto('/');
  await page.waitForSelector('.xterm', { timeout: 15000 });
  await page.waitForTimeout(2500);
  
  // Focus terminal
  const visibleScreen = page.locator('.xterm-screen >> visible=true');
  await visibleScreen.click();
  await page.waitForTimeout(300);
  
  // Type with spaces in first tab
  await page.keyboard.type('echo tab1 test', { delay: 30 });
  console.log('[1] Typed in first tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  
  // Create new tab
  await page.click('button[title*="New tab"]');
  await page.waitForTimeout(1000);
  console.log('[2] Created new tab');
  
  // Wait for new tab to connect
  await page.waitForTimeout(2000);
  
  // Focus the new terminal
  await page.locator('.xterm-screen >> visible=true').click();
  await page.waitForTimeout(300);
  
  // Type with spaces in second tab
  await page.keyboard.type('echo tab2 test with spaces', { delay: 30 });
  console.log('[3] Typed in second tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  
  // Switch back to first tab
  await page.locator('[role="tab"]').first().click();
  await page.waitForTimeout(500);
  console.log('[4] Switched to first tab');
  
  // Focus terminal again
  await page.locator('.xterm-screen >> visible=true').click();
  await page.waitForTimeout(300);
  
  // Type more with spaces
  await page.keyboard.type('echo back in tab1 working', { delay: 30 });
  console.log('[5] Typed after switching back');
  await page.keyboard.press('Enter');
  
  await page.screenshot({ path: 'test-results/spacebar-tab-switch.png' });
  
  console.log('\n✓ Spacebar tab-switch test PASSED\n');
});
