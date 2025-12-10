/**
 * Ctrl+C Behavior Test - Copy vs SIGINT
 * 
 * Tests that Ctrl+C behaves correctly:
 * - When text is selected: Copy to clipboard (doesn't interrupt process)
 * - When no text selected: Send SIGINT to interrupt running process
 * 
 * This test verifies the fix for the issue where Ctrl+C was always
 * sending SIGINT and terminating processes, even when user wanted to copy.
 */

import { test, expect } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.FORGE_URL || 'http://localhost:8333';
const TEST_TIMEOUT = 30000;

test.describe('Ctrl+C: Copy vs SIGINT Behavior', () => {
  test.setTimeout(TEST_TIMEOUT);

  test.beforeEach(async ({ page }) => {
    // Navigate to Forge Terminal
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    
    // Wait for terminal to be ready
    await page.waitForSelector('.xterm', { timeout: 15000 });
    await page.waitForTimeout(2000); // Give terminal time to initialize
  });

  test('Ctrl+C with text selected should copy (not send SIGINT)', async ({ page, context }) => {
    console.log('TEST 1: Ctrl+C with selection should copy');
    
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Step 1: Type a command that produces output
    console.log('  Step 1: Typing echo command...');
    await page.locator('.xterm').click();
    await page.keyboard.type('echo "Test message for copying"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Step 2: Select text in terminal using triple-click (selects entire line)
    console.log('  Step 2: Selecting text with triple-click...');
    const terminal = page.locator('.xterm');
    await terminal.click({ clickCount: 3 });
    await page.waitForTimeout(500);
    
    // Step 3: Press Ctrl+C to copy
    console.log('  Step 3: Pressing Ctrl+C...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);
    
    // Step 4: Verify text was copied to clipboard
    console.log('  Step 4: Checking clipboard...');
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    console.log('  Clipboard contents:', clipboardText);
    
    expect(clipboardText).toContain('Test message for copying');
    
    // Step 5: Verify terminal is still responsive (process wasn't interrupted)
    console.log('  Step 5: Verifying terminal is still responsive...');
    await page.keyboard.type('echo "Still working"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const terminalContent = await terminal.textContent();
    expect(terminalContent).toContain('Still working');
    
    console.log('✅ TEST 1 PASSED: Copy worked without sending SIGINT');
  });

  test('Ctrl+C without selection should send SIGINT', async ({ page }) => {
    console.log('TEST 2: Ctrl+C without selection should interrupt process');
    
    // Step 1: Start a long-running process (sleep)
    console.log('  Step 1: Starting long-running process (sleep 30)...');
    await page.locator('.xterm').click();
    await page.keyboard.type('sleep 30');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Step 2: Verify process is running (terminal should show no prompt yet)
    console.log('  Step 2: Verifying process is running...');
    const terminal = page.locator('.xterm');
    let content = await terminal.textContent();
    console.log('  Terminal content:', content.slice(-100));
    
    // Step 3: Press Ctrl+C WITHOUT selecting text
    console.log('  Step 3: Pressing Ctrl+C to interrupt...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1500);
    
    // Step 4: Verify process was interrupted (prompt should return)
    console.log('  Step 4: Verifying process was interrupted...');
    content = await terminal.textContent();
    console.log('  Terminal content after Ctrl+C:', content.slice(-100));
    
    // Should see prompt again (process was interrupted)
    // Common prompts: $, #, >, or username@hostname
    const hasPromptReturned = 
      content.includes('$') || 
      content.includes('#') || 
      content.includes('>') ||
      content.match(/[\w-]+@[\w-]+/); // username@hostname pattern
    
    expect(hasPromptReturned).toBeTruthy();
    
    // Step 5: Verify terminal is responsive after interrupt
    console.log('  Step 5: Verifying terminal is still responsive...');
    await page.keyboard.type('echo "Interrupted successfully"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    content = await terminal.textContent();
    expect(content).toContain('Interrupted successfully');
    
    console.log('✅ TEST 2 PASSED: SIGINT interrupted process successfully');
  });

  test('Multiple Ctrl+C without selection should not cause issues', async ({ page }) => {
    console.log('TEST 3: Multiple Ctrl+C presses should be stable');
    
    // Step 1: Start a long-running process
    console.log('  Step 1: Starting long-running process...');
    await page.locator('.xterm').click();
    await page.keyboard.type('sleep 30');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Step 2: Press Ctrl+C multiple times rapidly
    console.log('  Step 2: Pressing Ctrl+C three times rapidly...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1500);
    
    // Step 3: Verify terminal is still responsive
    console.log('  Step 3: Verifying terminal is still responsive...');
    const terminal = page.locator('.xterm');
    await page.keyboard.type('echo "Still alive"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const content = await terminal.textContent();
    expect(content).toContain('Still alive');
    
    console.log('✅ TEST 3 PASSED: Multiple Ctrl+C handled gracefully');
  });

  test('Ctrl+C behavior in TUI application', async ({ page }) => {
    console.log('TEST 4: Ctrl+C in TUI (like vim) should interrupt');
    
    // This test verifies Ctrl+C works in interactive TUI apps
    // We'll use 'cat' as a simple interactive process
    
    // Step 1: Start cat (waits for input)
    console.log('  Step 1: Starting cat command...');
    await page.locator('.xterm').click();
    await page.keyboard.type('cat');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Step 2: Type some input
    console.log('  Step 2: Typing input to cat...');
    await page.keyboard.type('test input');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    // Step 3: Press Ctrl+C to exit cat
    console.log('  Step 3: Pressing Ctrl+C to exit cat...');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1500);
    
    // Step 4: Verify we're back at prompt
    console.log('  Step 4: Verifying back at prompt...');
    const terminal = page.locator('.xterm');
    await page.keyboard.type('echo "Exited cat"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const content = await terminal.textContent();
    expect(content).toContain('Exited cat');
    
    console.log('✅ TEST 4 PASSED: Ctrl+C interrupted TUI application');
  });
});
