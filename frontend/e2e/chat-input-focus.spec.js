/**
 * E2E Test: Chat Input Focus Bug
 * 
 * Issue: When in chat view mode, typing in the chat textarea sends keystrokes
 * to the hidden terminal instead of the chat input.
 * 
 * This test verifies that:
 * 1. New tabs start in chat mode (default)
 * 2. The chat textarea can receive focus
 * 3. Typing in the chat textarea updates the input value (not terminal)
 * 4. The terminal textarea does NOT have focus when in chat mode
 */

import { test, expect } from '@playwright/test';

test.describe('Chat Input Focus', () => {
  
  test('chat textarea receives keystrokes when in chat mode', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForSelector('.chat-view', { timeout: 10000 });
    
    // Take screenshot of initial state
    await page.screenshot({ path: 'test-results/chat-focus-01-initial.png', fullPage: true });
    
    // Verify we're in chat mode (chat view should be visible)
    const chatView = page.locator('.chat-view');
    await expect(chatView).toBeVisible();
    
    // Find the chat textarea
    const chatTextarea = page.locator('.chat-view-input');
    await expect(chatTextarea).toBeVisible();
    
    // Click on the chat textarea to focus it
    await chatTextarea.click();
    
    // Small delay to let focus settle
    await page.waitForTimeout(200);
    
    // Take screenshot after clicking textarea
    await page.screenshot({ path: 'test-results/chat-focus-02-after-click.png', fullPage: true });
    
    // Check what element has focus
    const activeElementTag = await page.evaluate(() => document.activeElement?.tagName);
    const activeElementClass = await page.evaluate(() => document.activeElement?.className);
    console.log('Active element after click:', activeElementTag, activeElementClass);
    
    // The active element should be a TEXTAREA with class containing 'chat-view-input'
    expect(activeElementTag).toBe('TEXTAREA');
    expect(activeElementClass).toContain('chat-view-input');
    
    // Type some text
    const testText = 'Hello this is a test message';
    await chatTextarea.type(testText, { delay: 50 });
    
    // Take screenshot after typing
    await page.screenshot({ path: 'test-results/chat-focus-03-after-typing.png', fullPage: true });
    
    // Verify the textarea contains our typed text
    const textareaValue = await chatTextarea.inputValue();
    console.log('Textarea value after typing:', textareaValue);
    expect(textareaValue).toBe(testText);
    
    // Verify the terminal helper textarea does NOT have focus
    const xtermTextareaFocused = await page.evaluate(() => {
      const xtermTextarea = document.querySelector('.xterm-helper-textarea');
      return xtermTextarea === document.activeElement;
    });
    expect(xtermTextareaFocused).toBe(false);
    
    console.log('✅ Chat input focus test PASSED');
  });

  test('terminal does not steal focus on tab creation', async ({ page }) => {
    await page.goto('/');
    
    // Wait for initial load
    await page.waitForSelector('.chat-view', { timeout: 10000 });
    
    // Check what has focus immediately after page load
    await page.waitForTimeout(500); // Let any queueMicrotask focus calls complete
    
    const initialActiveTag = await page.evaluate(() => document.activeElement?.tagName);
    const initialActiveClass = await page.evaluate(() => document.activeElement?.className);
    console.log('Initial focus after page load:', initialActiveTag, initialActiveClass);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/chat-focus-04-initial-focus.png', fullPage: true });
    
    // The xterm-helper-textarea should NOT have focus when in chat mode
    const xtermHasFocus = await page.evaluate(() => {
      const xtermTextarea = document.querySelector('.xterm-helper-textarea');
      return xtermTextarea === document.activeElement;
    });
    
    console.log('xterm-helper-textarea has focus:', xtermHasFocus);
    
    // This is the critical assertion - terminal should NOT steal focus in chat mode
    expect(xtermHasFocus).toBe(false);
    
    console.log('✅ Terminal focus stealing test PASSED');
  });

  test('can type in chat after switching from terminal', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.chat-view', { timeout: 10000 });
    
    // Find and click the Terminal toggle button to switch to terminal
    const terminalToggle = page.locator('.chat-view-btn.terminal-toggle-btn');
    if (await terminalToggle.isVisible()) {
      await terminalToggle.click();
      await page.waitForTimeout(300);
    }
    
    // Take screenshot in terminal mode
    await page.screenshot({ path: 'test-results/chat-focus-05-terminal-mode.png', fullPage: true });
    
    // Now switch back to chat mode - find the Chat button in terminal view
    const chatButton = page.locator('.switch-to-chat-btn');
    if (await chatButton.isVisible()) {
      await chatButton.click();
      await page.waitForTimeout(300);
    }
    
    // Take screenshot after switching back
    await page.screenshot({ path: 'test-results/chat-focus-06-back-to-chat.png', fullPage: true });
    
    // Now try to type in the chat textarea
    const chatTextarea = page.locator('.chat-view-input');
    await expect(chatTextarea).toBeVisible();
    
    await chatTextarea.click();
    await page.waitForTimeout(200);
    
    const testText = 'Typing after mode switch';
    await chatTextarea.type(testText, { delay: 30 });
    
    // Take screenshot after typing
    await page.screenshot({ path: 'test-results/chat-focus-07-typing-after-switch.png', fullPage: true });
    
    // Verify text was entered in chat, not terminal
    const textareaValue = await chatTextarea.inputValue();
    expect(textareaValue).toBe(testText);
    
    console.log('✅ Mode switch typing test PASSED');
  });
});
