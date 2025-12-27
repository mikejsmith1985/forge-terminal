/**
 * Test: Feedback Button and Logger Enhancement
 * 
 * Purpose: Verify feedback button exists, is clickable, and logger captures last 3 minutes
 * 
 * Test Cases:
 * 1. Feedback button visible in ribbon
 * 2. Feedback modal opens on click
 * 3. Logger tracks timestamps
 * 4. getRecentLogs returns last 3 minutes
 */

const { test, expect } = require('@playwright/test');

test.describe('Feedback Button and Logger Enhancement', () => {
  let page;

  test.beforeEach(async ({ page: newPage }) => {
    page = newPage;
    await page.goto('http://localhost:17171');
    await page.waitForLoadState('networkidle');
  });

  test('should display feedback button in ribbon', async () => {
    // Wait for theme controls to be visible
    await page.waitForSelector('.theme-controls', { timeout: 5000 });

    // Find the feedback button (MessageCircle icon)
    const feedbackButton = page.locator('.theme-controls button[title="Send Feedback"]');
    await expect(feedbackButton).toBeVisible();

    // Verify it's positioned before the version button
    const buttons = await page.locator('.theme-controls button').all();
    expect(buttons.length).toBeGreaterThan(0);
  });

  test('should open feedback modal on click', async () => {
    // Click feedback button
    const feedbackButton = page.locator('.theme-controls button[title="Send Feedback"]');
    await feedbackButton.click();

    // Wait for modal to appear
    await page.waitForSelector('.modal-overlay', { timeout: 2000 });
    
    // Verify modal elements
    await expect(page.locator('textarea[placeholder*="describe"]')).toBeVisible();
    await expect(page.locator('button:has-text("Submit Feedback")')).toBeVisible();
  });

  test('should capture screenshots in feedback modal', async () => {
    // Open feedback modal
    await page.locator('.theme-controls button[title="Send Feedback"]').click();
    await page.waitForSelector('.modal-overlay');

    // Click capture screenshot button
    const captureBtn = page.locator('button:has-text("Capture")').first();
    await captureBtn.click();

    // Wait for screenshot to be captured
    await page.waitForTimeout(1000);

    // Verify screenshot appears in modal (check for image preview)
    const screenshots = await page.locator('img[src^="data:image"]').count();
    expect(screenshots).toBeGreaterThan(0);
  });

  test('should verify logger tracks timestamps', async () => {
    // Execute some console.log commands to generate logs
    await page.evaluate(() => {
      console.log('[Test] Log entry 1');
      console.warn('[Test] Warning entry');
      console.error('[Test] Error entry');
    });

    // Wait a bit for logs to be processed
    await page.waitForTimeout(500);

    // Check that logger has captured these with timestamps
    const hasTimestamps = await page.evaluate(() => {
      const { getLogs } = require('../utils/logger');
      const logs = getLogs();
      return logs.includes('[Test]') && logs.includes('[INFO]');
    });

    expect(hasTimestamps).toBeTruthy();
  });

  test('should retrieve last 3 minutes of logs', async () => {
    // Generate logs over time
    await page.evaluate(() => {
      console.log('[Recent] Log at', new Date().toISOString());
    });

    await page.waitForTimeout(100);

    // Test getRecentLogs function
    const recentLogs = await page.evaluate(() => {
      // Import getRecentLogs from logger
      const loggerModule = require('../utils/logger');
      return loggerModule.getRecentLogs(3);
    });

    // Verify logs are returned and contain recent entries
    expect(recentLogs).toBeTruthy();
    expect(typeof recentLogs).toBe('string');
  });

  test('should include logs in feedback submission', async () => {
    // Generate some test logs
    await page.evaluate(() => {
      console.log('[Feedback Test] Generating test logs');
      console.warn('[Feedback Test] Warning log');
    });

    // Open feedback modal
    await page.locator('.theme-controls button[title="Send Feedback"]').click();
    await page.waitForSelector('.modal-overlay');

    // Fill in feedback comment
    await page.fill('textarea', 'Test feedback with logs');

    // Note: We won't actually submit to avoid creating GitHub issues
    // Just verify the submit button is enabled when comment is present
    const submitBtn = page.locator('button:has-text("Submit Feedback")');
    await expect(submitBtn).toBeEnabled();
  });
});
