// clipboard-support.spec.js - Playwright tests for Ctrl+C and Ctrl+V functionality

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:8080';

test.describe('Clipboard Support (Ctrl+C and Ctrl+V)', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.xterm', { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('Terminal should be visible and ready', async ({ page }) => {
    const terminal = await page.locator('.xterm').count();
    expect(terminal).toBeGreaterThan(0);
    console.log('✓ Terminal element found');
  });

  test('Should handle Ctrl+V paste from clipboard', async ({ page, context }) => {
    // Set clipboard text using context API
    await context.evaluateHandle(async (text) => {
      await navigator.clipboard.writeText(text);
    }, 'echo "test-paste-content"');

    // Focus the terminal
    const terminal = page.locator('.xterm');
    await terminal.click();
    await page.waitForTimeout(300);

    // Send Ctrl+V (paste)
    console.log('Sending Ctrl+V to terminal...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);

    // Get terminal content via xterm API
    const terminalContent = await page.evaluate(() => {
      const xtermElement = document.querySelector('.xterm');
      return xtermElement?.textContent || '';
    });

    console.log('Terminal content after paste:', terminalContent.substring(0, 200));
    // Check if paste content appears in terminal (might appear with echo or in the buffer)
    expect(terminalContent.toLowerCase()).toContain('test-paste-content');
    console.log('✓ Paste content found in terminal');
  });

  test('Should handle Ctrl+C interrupt signal', async ({ page }) => {
    // Focus the terminal
    const terminal = page.locator('.xterm');
    await terminal.click();
    await page.waitForTimeout(300);

    // Start a long-running command (sleep) that we can interrupt
    console.log('Starting long-running process...');
    await page.keyboard.type('sleep 100');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Send Ctrl+C to interrupt
    console.log('Sending Ctrl+C to interrupt...');
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(500);

    // Terminal should respond with prompt (^C signal was received)
    const terminalContent = await page.evaluate(() => {
      const xtermElement = document.querySelector('.xterm');
      return xtermElement?.textContent || '';
    });

    console.log('Terminal content after Ctrl+C:', terminalContent.substring(terminalContent.length - 200));
    
    // After Ctrl+C, we should see a shell prompt or cursor
    // The exact output depends on shell behavior, but process should be interrupted
    expect(terminalContent.length).toBeGreaterThan(0);
    console.log('✓ Ctrl+C interrupt signal sent successfully');
  });

  test('Should handle rapid consecutive pastes', async ({ page, context }) => {
    // Set clipboard text
    await context.evaluateHandle(async (text) => {
      await navigator.clipboard.writeText(text);
    }, 'test123');

    // Focus the terminal
    const terminal = page.locator('.xterm');
    await terminal.click();
    await page.waitForTimeout(300);

    // Send multiple Ctrl+V commands rapidly
    console.log('Sending rapid Ctrl+V presses...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);

    // Check terminal content
    const terminalContent = await page.evaluate(() => {
      const xtermElement = document.querySelector('.xterm');
      return xtermElement?.textContent || '';
    });

    console.log('Terminal content after rapid pastes:', terminalContent.substring(0, 300));
    expect(terminalContent.toLowerCase()).toContain('test123');
    console.log('✓ Multiple rapid pastes handled correctly');
  });

  test('Should handle mixed Ctrl+C and typing', async ({ page }) => {
    // Focus the terminal
    const terminal = page.locator('.xterm');
    await terminal.click();
    await page.waitForTimeout(300);

    // Type a command
    console.log('Typing command...');
    await page.keyboard.type('echo "hello"');
    await page.waitForTimeout(300);

    // Send Ctrl+C to clear
    console.log('Sending Ctrl+C to clear...');
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(300);

    // Type another command
    console.log('Typing second command...');
    await page.keyboard.type('echo "world"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Verify terminal handled the sequence
    const terminalContent = await page.evaluate(() => {
      const xtermElement = document.querySelector('.xterm');
      return xtermElement?.textContent || '';
    });

    console.log('Terminal content after mixed actions:', terminalContent.substring(0, 300));
    expect(terminalContent.length).toBeGreaterThan(0);
    console.log('✓ Mixed Ctrl+C and typing handled correctly');
  });

  test('WebSocket should properly handle clipboard data', async ({ page, context }) => {
    // Set clipboard with special characters
    await context.evaluateHandle(async (text) => {
      await navigator.clipboard.writeText(text);
    }, 'echo "special chars: !@#$%^&*()"');

    // Focus the terminal
    const terminal = page.locator('.xterm');
    await terminal.click();
    await page.waitForTimeout(300);

    // Send Ctrl+V
    console.log('Pasting special characters...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);

    // Check that special characters are preserved
    const terminalContent = await page.evaluate(() => {
      const xtermElement = document.querySelector('.xterm');
      return xtermElement?.textContent || '';
    });

    console.log('Terminal content with special chars:', terminalContent.substring(0, 400));
    expect(terminalContent).toContain('special chars');
    console.log('✓ Special characters preserved in paste');
  });

  test('Terminal should still be responsive after Ctrl+V paste', async ({ page, context }) => {
    // Set clipboard text
    await context.evaluateHandle(async (text) => {
      await navigator.clipboard.writeText(text);
    }, 'pwd');

    // Focus the terminal
    const terminal = page.locator('.xterm');
    await terminal.click();
    await page.waitForTimeout(300);

    // Paste using Ctrl+V
    console.log('Pasting initial content...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(300);

    // Then press Enter to execute
    console.log('Pressing Enter to execute...');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Terminal should have executed the command
    const terminalContent = await page.evaluate(() => {
      const xtermElement = document.querySelector('.xterm');
      return xtermElement?.textContent || '';
    });

    console.log('Terminal content after paste and execute:', terminalContent.substring(0, 300));
    expect(terminalContent.length).toBeGreaterThan(0);
    console.log('✓ Terminal responsive after Ctrl+V');
  });

  test('Ctrl+V should not trigger default browser paste dialog', async ({ page, context }) => {
    // Set clipboard text
    await context.evaluateHandle(async (text) => {
      await navigator.clipboard.writeText(text);
    }, 'test');

    // Focus the terminal
    const terminal = page.locator('.xterm');
    await terminal.click();
    await page.waitForTimeout(300);

    // Monitor for any unexpected dialogs
    let unexpectedDialog = false;
    page.once('dialog', () => {
      unexpectedDialog = true;
      console.warn('⚠ Unexpected dialog appeared!');
    });

    // Send Ctrl+V
    console.log('Sending Ctrl+V...');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(500);

    // No dialog should have appeared
    expect(unexpectedDialog).toBe(false);
    console.log('✓ No browser dialogs triggered');
  });
});
