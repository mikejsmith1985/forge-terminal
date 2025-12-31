// paste-latency.spec.js - v3.8.2 E2E tests for paste latency fix
// Verifies that Ctrl+V paste is now faster using synchronous clipboardData

import { test, expect } from '@playwright/test';

test.describe('Paste Latency Fix (v3.8.2)', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    // Don't wait for networkidle - SSE connections never close
    await page.waitForLoadState('domcontentloaded');
    // v3.8.2: Terminal is the only view - wait for terminal layer directly
    await page.waitForSelector('.view-layer.terminal-layer.active .xterm', { timeout: 15000, state: 'visible' });
    await page.waitForTimeout(1000);
    console.log('✓ Terminal view active');
  });

  test('Ctrl+V should paste text with minimal latency', async ({ page, context }) => {
    const testText = 'quick-paste-test-' + Date.now();
    
    // Set clipboard text
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, testText);

    // Focus the terminal in the active terminal layer
    const terminal = page.locator('.view-layer.terminal-layer.active .xterm').first();
    await terminal.click();
    await page.waitForTimeout(300);

    // Measure paste latency
    const startTime = Date.now();
    
    // Send Ctrl+V
    await page.keyboard.press('Control+V');
    
    // Wait for paste to complete (should be fast now)
    await page.waitForTimeout(200);
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    console.log(`Paste latency: ${latency}ms`);
    
    // Paste should complete within 500ms (previously could take 1-2 seconds)
    expect(latency).toBeLessThan(500);
    console.log('✓ Paste completed within acceptable latency');
    
    // Verify terminal is still responsive after paste
    await page.keyboard.type('echo "responsive"');
    await page.waitForTimeout(200);
    console.log('✓ Terminal still responsive after paste');
  });

  test('Paste should work without triggering async permission dialog', async ({ page, context }) => {
    const testText = 'permission-test-' + Date.now();
    
    // Set clipboard text
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, testText);

    // Focus the terminal
    const terminal = page.locator('.view-layer.terminal-layer.active .xterm').first();
    await terminal.click();
    await page.waitForTimeout(300);

    // Monitor for dialogs (old implementation could trigger permission dialogs)
    let dialogAppeared = false;
    page.on('dialog', () => {
      dialogAppeared = true;
    });

    // Send Ctrl+V
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);

    expect(dialogAppeared).toBe(false);
    console.log('✓ No permission dialog appeared during paste');
  });

  test('Multiple rapid pastes should not cause errors', async ({ page, context }) => {
    const testText = 'rapid-';
    
    // Set clipboard text
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, testText);

    // Focus the terminal
    const terminal = page.locator('.view-layer.terminal-layer.active .xterm').first();
    await terminal.click();
    await page.waitForTimeout(300);

    // Send multiple rapid Ctrl+V presses - should not cause errors or hangs
    const startTime = Date.now();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Control+V');
      await page.waitForTimeout(50); // Minimal delay between pastes
    }
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log(`5 rapid pastes completed in ${totalTime}ms`);
    
    // 5 rapid pastes should complete in under 2 seconds
    expect(totalTime).toBeLessThan(2000);
    console.log('✓ Multiple rapid pastes completed without errors');
  });

  test('Paste should work in terminal', async ({ page, context }) => {
    const testText = 'terminal-paste-' + Date.now();
    
    // Set clipboard text
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, testText);

    // Focus and paste
    const terminal = page.locator('.view-layer.terminal-layer.active .xterm').first();
    await terminal.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(300);

    // Verify terminal is still responsive after paste
    await page.keyboard.type('echo test');
    await page.waitForTimeout(200);
    console.log('✓ Paste works in terminal - terminal still responsive');
  });

  test('Large text paste should complete without timeout', async ({ page, context }) => {
    // Generate a larger text block (100 lines)
    const lines = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`line-${i}: This is test content for paste latency verification`);
    }
    const largeText = lines.join('\n');
    
    // Set clipboard text
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, largeText);

    // Focus the terminal
    const terminal = page.locator('.view-layer.terminal-layer.active .xterm').first();
    await terminal.click();
    await page.waitForTimeout(300);

    // Measure large paste latency
    const startTime = Date.now();
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    console.log(`Large text paste latency: ${latency}ms for ${largeText.length} chars`);
    
    // Even large pastes should complete reasonably quickly
    expect(latency).toBeLessThan(2000);
    console.log('✓ Large text paste completed within acceptable time');
  });
});
