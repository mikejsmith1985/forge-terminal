/**
 * Simple Terminal Startup Performance Test
 * Measures time from page load to terminal ready
 */

import { test, expect } from '@playwright/test';

test.use({ 
  baseURL: 'http://127.0.0.1:8333',
  actionTimeout: 20000,
});

test('measure terminal connection time', async ({ page }) => {
  console.log('\n=== PERFORMANCE TEST: Terminal Connection Speed ===\n');
  
  const startTime = Date.now();
  
  // Navigate to app
  await page.goto('/');
  const pageLoadTime = Date.now() - startTime;
  console.log(`[1] Page loaded: ${pageLoadTime}ms`);
  
  // Wait for any terminal to appear
  await page.waitForSelector('.xterm', { timeout: 15000 });
  const xtermReadyTime = Date.now() - startTime;
  console.log(`[2] Terminal UI ready: ${xtermReadyTime}ms`);
  
  // Wait a moment for the active terminal to stabilize
  await page.waitForTimeout(1500);
  
  const connectionTime = Date.now() - startTime;
  console.log(`[3] Terminal connected: ${connectionTime}ms`);
  
  // Find the VISIBLE terminal screen (last one is usually visible in tab-based UI)
  const visibleScreen = page.locator('.xterm-screen >> visible=true');
  await visibleScreen.click();
  await page.keyboard.type('echo "performance test"');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  
  const interactiveTime = Date.now() - startTime;
  console.log(`[4] Terminal interactive: ${interactiveTime}ms`);
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/perf-test-connection.png' });
  
  console.log('\n=== RESULTS ===');
  console.log(`Connection time: ${connectionTime}ms`);
  console.log(`Interactive time: ${interactiveTime}ms`);
  
  // Performance assertions
  expect(connectionTime, 'Connection should be fast').toBeLessThan(15000);
  
  console.log('✓ Performance test PASSED\n');
});
