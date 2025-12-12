/**
 * Keyboard Responsiveness Performance Test
 * Tests that keyboard input is NOT blocked or lagging
 */

import { test, expect } from '@playwright/test';

test.use({ 
  baseURL: 'http://127.0.0.1:8333',
  actionTimeout: 20000,
});

test('keyboard input should be responsive (no lag)', async ({ page }) => {
  console.log('\n=== PERFORMANCE TEST: Keyboard Responsiveness ===\n');
  
  // Navigate
  await page.goto('/');
  
  // Wait for any terminal to appear
  await page.waitForSelector('.xterm', { timeout: 15000 });
  
  // Wait for shell to be ready
  await page.waitForTimeout(2500);
  console.log('Terminal connected');
  
  // Focus the VISIBLE terminal screen
  const visibleScreen = page.locator('.xterm-screen >> visible=true');
  await visibleScreen.click();
  await page.waitForTimeout(500);
  
  // Test rapid typing - measure time
  const testString = 'echo "keyboard performance test 1234567890"';
  const startTime = Date.now();
  
  await page.keyboard.type(testString, { delay: 20 });
  
  const typingTime = Date.now() - startTime;
  console.log(`Typed ${testString.length} chars in ${typingTime}ms`);
  console.log(`Rate: ${Math.round((testString.length / typingTime) * 1000)} chars/sec`);
  
  // Expected: ~20ms delay per char = ~900ms for 43 chars
  // If there's blocking I/O, this would be much higher
  const expectedMaxTime = testString.length * 50 + 2000; // 50ms per char max + 2s buffer
  
  console.log(`Expected max time: ${expectedMaxTime}ms`);
  console.log(`Actual time: ${typingTime}ms`);
  
  // Execute command
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/keyboard-perf-test.png' });
  
  // Performance assertion
  expect(typingTime, `Typing should not lag (expected <${expectedMaxTime}ms)`).toBeLessThan(expectedMaxTime);
  
  // Test spacebar specifically (known issue area)
  console.log('\nTesting spacebar...');
  await page.keyboard.type('echo ', { delay: 50 });
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.keyboard.type('test', { delay: 50 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  
  await page.screenshot({ path: 'test-results/keyboard-spacebar-test.png' });
  
  console.log('✓ Keyboard responsiveness test PASSED\n');
});
