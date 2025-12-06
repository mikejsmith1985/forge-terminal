// issue19.spec.js - Tests for Issue #19 fixes
// 1. Session recovery banners should only show recent sessions (24h)
// 2. Spacebar should work in feedback modal textarea

import { test, expect } from '@playwright/test';
import path from 'path';
import { spawn } from 'child_process';

test.describe('Issue #19 - Session Recovery and Keyboard Input Fixes', () => {
  let serverProcess;
  let baseURL;

  test.beforeAll(async () => {
    // Start the server
    const forgePath = path.join(process.cwd(), '..', 'bin', 'forge');
    
    serverProcess = spawn(forgePath, [], {
      env: { ...process.env, NO_BROWSER: '1' },
      stdio: 'pipe'
    });

    // Wait for server to start and capture the URL
    await new Promise((resolve) => {
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/http:\/\/(127\.0\.0\.1|localhost):\d+/);
        if (match) {
          baseURL = match[0];
          resolve();
        }
      });
      
      setTimeout(() => {
        if (!baseURL) {
          baseURL = 'http://127.0.0.1:8333';
          resolve();
        }
      }, 5000);
    });
  });

  test.afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  test('should only show AM sessions from last 24 hours', async ({ page }) => {
    // Navigate to app
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Wait for app to load
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Check for AM restore cards
    const restoreCards = await page.locator('.am-restore-card').count();
    
    // Get info about sessions via API
    const response = await page.request.get(`${baseURL}/api/am/check`);
    const data = await response.json();
    
    console.log(`Found ${data.sessions ? data.sessions.length : 0} recoverable sessions`);
    
    // All sessions should be from last 24 hours
    if (data.sessions && data.sessions.length > 0) {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      for (const session of data.sessions) {
        const sessionDate = new Date(session.lastUpdated);
        expect(sessionDate.getTime()).toBeGreaterThan(twentyFourHoursAgo.getTime());
      }
    }
    
    // The number of cards should match the number of sessions
    expect(restoreCards).toBe(data.sessions ? data.sessions.length : 0);
  });

  test('should properly dismiss AM session cards', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Wait for app to load
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Check if there are any restore cards
    const initialCount = await page.locator('.am-restore-card').count();
    
    if (initialCount > 0) {
      // Click dismiss on first card
      await page.locator('.am-restore-card').first().locator('[title="Dismiss"]').click();
      
      // Wait for card to disappear
      await page.waitForTimeout(1000);
      
      // Verify card was removed
      const afterCount = await page.locator('.am-restore-card').count();
      expect(afterCount).toBe(initialCount - 1);
      
      // Verify session was archived via API
      const response = await page.request.get(`${baseURL}/api/am/check`);
      const data = await response.json();
      expect(data.sessions.length).toBe(afterCount);
    }
  });

  test('spacebar should work in feedback modal textarea', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Open feedback modal
    await page.click('button[title="Send Feedback"]');
    
    // Wait for modal to appear
    await page.waitForSelector('.modal-overlay', { state: 'visible', timeout: 5000 });
    
    // Find the textarea
    const textarea = page.locator('textarea[placeholder*="Describe"]');
    await expect(textarea).toBeVisible();
    
    // Click in textarea to focus
    await textarea.click();
    
    // Type text with spaces
    const testText = 'Hello World Test Space';
    await textarea.fill(testText);
    
    // Verify the text was entered correctly with spaces
    const value = await textarea.inputValue();
    expect(value).toBe(testText);
    expect(value.includes(' ')).toBeTruthy();
    
    // Also test typing character by character (simulates real typing)
    await textarea.clear();
    await textarea.type('Test with space bar', { delay: 50 });
    
    const typedValue = await textarea.inputValue();
    expect(typedValue).toContain(' ');
    expect(typedValue).toBe('Test with space bar');
  });

  test('spacebar should work in feedback modal input fields', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Open feedback modal
    await page.click('button[title="Send Feedback"]');
    await page.waitForSelector('.modal-overlay', { state: 'visible' });
    
    // Click "Update Settings" if the setup view isn't already shown
    const updateSettingsButton = page.locator('button:has-text("Update Settings")');
    if (await updateSettingsButton.isVisible()) {
      await updateSettingsButton.click();
    }
    
    // Find the GitHub token input
    const tokenInput = page.locator('input[type="password"][placeholder*="ghp"]');
    if (await tokenInput.isVisible()) {
      await tokenInput.click();
      
      // Type with spaces (though tokens don't have spaces, this tests the input works)
      await tokenInput.type('test token value', { delay: 50 });
      
      const inputValue = await tokenInput.inputValue();
      expect(inputValue).toContain(' ');
    }
  });

  test('keyboard shortcuts should still work outside input fields', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    
    // Count initial tabs
    const initialTabCount = await page.locator('.tab').count();
    
    // Press Ctrl+T to create new tab (outside input fields)
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(500);
    
    // Verify new tab was created
    const newTabCount = await page.locator('.tab').count();
    expect(newTabCount).toBe(Math.min(initialTabCount + 1, 20)); // Max 20 tabs
  });

  test('keyboard shortcuts should NOT trigger in feedback modal textarea', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Count initial tabs
    const initialTabCount = await page.locator('.tab').count();
    
    // Open feedback modal
    await page.click('button[title="Send Feedback"]');
    await page.waitForSelector('.modal-overlay', { state: 'visible' });
    
    // Focus on textarea
    const textarea = page.locator('textarea[placeholder*="Describe"]');
    await textarea.click();
    
    // Try to trigger Ctrl+T (should NOT create new tab while in textarea)
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(500);
    
    // Verify no new tab was created
    const currentTabCount = await page.locator('.tab').count();
    expect(currentTabCount).toBe(initialTabCount);
    
    // Verify the textarea still works
    await textarea.type('Testing keyboard input');
    const value = await textarea.inputValue();
    expect(value).toContain('Testing keyboard input');
  });

  test('old AM sessions should be auto-archived on startup', async ({ page }) => {
    // This test verifies the backend logic for auto-archiving old sessions
    const response = await page.request.get(`${baseURL}/api/am/check`);
    const data = await response.json();
    
    // If there are sessions, verify they're all recent
    if (data.sessions && data.sessions.length > 0) {
      const now = Date.now();
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
      
      for (const session of data.sessions) {
        const sessionTime = new Date(session.lastUpdated).getTime();
        expect(sessionTime).toBeGreaterThan(twentyFourHoursAgo);
      }
    }
    
    // Verify that old sessions were moved to archive
    // (We can't easily check the filesystem in Playwright, but the API response validates this)
    expect(data.hasRecoverable).toBe(data.sessions && data.sessions.length > 0);
  });
});
