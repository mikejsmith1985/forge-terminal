import { test } from '@playwright/test';
import percySnapshot from '@percy/playwright';

test.describe('Debug Panel Visual Tests', () => {
  test('Debug tab visible in ribbon', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForSelector('.sidebar-view-tabs', { timeout: 10000 });
    
    // Take snapshot of the full app showing Debug tab
    await percySnapshot(page, 'Debug Tab in Ribbon');
  });

  test('Debug panel with feedback section', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForSelector('.sidebar-view-tabs', { timeout: 10000 });
    
    // Click Debug tab
    await page.locator('button.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(1000);
    
    // Take snapshot of Debug panel
    await percySnapshot(page, 'Debug Panel with Feedback Section');
  });

  test('Feedback section prominent display', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForSelector('.sidebar-view-tabs', { timeout: 10000 });
    
    // Click Debug tab
    await page.locator('button.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(1000);
    
    // Scroll to ensure feedback section is visible
    await page.evaluate(() => {
      document.querySelector('h4:has-text("Report Feedback")')?.scrollIntoView();
    });
    
    await page.waitForTimeout(500);
    
    // Take snapshot focused on feedback
    await percySnapshot(page, 'Debug Panel Feedback Section Detail');
  });

  test('Diagnostics data displayed', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForSelector('.sidebar-view-tabs', { timeout: 10000 });
    
    // Click Debug tab
    await page.locator('button.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(1000);
    
    // Scroll down to see all diagnostics
    await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar-content');
      if (sidebar) sidebar.scrollTop = sidebar.scrollHeight / 2;
    });
    
    await page.waitForTimeout(500);
    
    // Take snapshot of diagnostics
    await percySnapshot(page, 'Debug Panel Diagnostics Display');
  });
});
