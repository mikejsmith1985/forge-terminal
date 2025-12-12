/**
 * Simple Terminal Startup Performance Test
 * Measures time from page load to terminal ready
 */

import { test, expect } from '@playwright/test';

test.use({ 
  baseURL: 'http://127.0.0.1:8333',
  actionTimeout: 15000 
});

test('measure terminal connection time', async ({ page }) => {
  console.log('\n=== PERFORMANCE TEST: Terminal Connection Speed ===\n');
  
  const startTime = Date.now();
  
  // Navigate to app
  await page.goto('/');
  const pageLoadTime = Date.now() - startTime;
  console.log(`[1] Page loaded: ${pageLoadTime}ms`);
  
  // Wait for terminal container
  await page.waitForSelector('.xterm', { timeout: 10000 });
  const xtermReadyTime = Date.now() - startTime;
  console.log(`[2] Terminal UI ready: ${xtermReadyTime}ms`);
  
  // Wait for "Connected" text (terminal is connected to backend)
  await page.waitForSelector('.xterm-screen', { timeout: 10000 });
  
  // Look for the orange "Forge Terminal" connected message
  const connectedIndicator = page.locator('text=/Connected/i');
  await connectedIndicator.waitFor({ timeout: 15000 });
  
  const connectionTime = Date.now() - startTime;
  console.log(`[3] Terminal connected: ${connectionTime}ms`);
  
  // Wait a bit more for prompt to appear
  await page.waitForTimeout(1000);
  const fullReadyTime = Date.now() - startTime;
  console.log(`[4] Terminal fully ready: ${fullReadyTime}ms`);
  
  // Test typing immediately
  await page.keyboard.type('echo "performance test"');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  
  const interactiveTime = Date.now() - startTime;
  console.log(`[5] Terminal interactive: ${interactiveTime}ms`);
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/perf-test-connection.png' });
  
  console.log('\n=== RESULTS ===');
  console.log(`Total connection time: ${connectionTime}ms`);
  console.log(`Full ready time: ${fullReadyTime}ms`);
  console.log(`Interactive time: ${interactiveTime}ms`);
  
  // Performance assertions
  expect(connectionTime, 'Connection should be fast').toBeLessThan(10000);
  expect(fullReadyTime, 'Should be fully ready quickly').toBeLessThan(15000);
  
  console.log('✓ Performance test PASSED\n');
});

test('measure new tab creation time', async ({ page }) => {
  console.log('\n=== PERFORMANCE TEST: New Tab Creation ===\n');
  
  // Initial setup
  await page.goto('/');
  await page.waitForSelector('.xterm-screen', { timeout: 10000 });
  await page.locator('text=/Connected/i').waitFor({ timeout: 15000 });
  console.log('Initial tab ready');
  
  // Create new tab
  const startTime = Date.now();
  
  // Click new tab button
  await page.click('button[title*="New Tab"]');
  
  // Wait for second tab element
  const secondTabButton = page.locator('[role="tab"]').nth(1);
  await secondTabButton.waitFor({ timeout: 5000 });
  const tabCreatedTime = Date.now() - startTime;
  console.log(`[1] Tab UI created: ${tabCreatedTime}ms`);
  
  // Wait for connection in new tab
  await page.locator('text=/Connected/i').nth(1).waitFor({ timeout: 15000 });
  const tabConnectedTime = Date.now() - startTime;
  console.log(`[2] New tab connected: ${tabConnectedTime}ms`);
  
  await page.waitForTimeout(1000);
  const tabReadyTime = Date.now() - startTime;
  console.log(`[3] New tab ready: ${tabReadyTime}ms`);
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/perf-test-newtab.png' });
  
  console.log('\n=== RESULTS ===');
  console.log(`Tab creation time: ${tabConnectedTime}ms`);
  
  expect(tabConnectedTime, 'New tab should be fast').toBeLessThan(10000);
  
  console.log('✓ New tab performance test PASSED\n');
});
