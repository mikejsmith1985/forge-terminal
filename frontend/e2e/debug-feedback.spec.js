import { test, expect } from '@playwright/test';

test.describe('Debug Panel with Feedback Feature', () => {
  test('should display Debug tab in ribbon without dev mode', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:8333');
    
    // Wait for app to load
    await page.waitForSelector('.sidebar-view-tabs', { timeout: 10000 });
    
    // Verify Debug tab is visible (should not require dev mode)
    const debugTab = page.locator('button.sidebar-view-tab:has-text("Debug")');
    await expect(debugTab).toBeVisible();
    
    // Verify it's alongside Cards and Files tabs
    const cardsTab = page.locator('button.sidebar-view-tab:has-text("Cards")');
    const filesTab = page.locator('button.sidebar-view-tab:has-text("Files")');
    await expect(cardsTab).toBeVisible();
    await expect(filesTab).toBeVisible();
  });

  test('should open Debug panel and show diagnostics', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForSelector('.sidebar-view-tabs', { timeout: 10000 });
    
    // Click Debug tab
    const debugTab = page.locator('button.sidebar-view-tab:has-text("Debug")');
    await debugTab.click();
    
    // Wait for panel to render
    await page.waitForTimeout(500);
    
    // Verify Debug panel header
    await expect(page.locator('h3:has-text("🐛 Debug")')).toBeVisible();
    
    // Verify diagnostic sections are present
    await expect(page.locator('text=Terminal Info')).toBeVisible();
    await expect(page.locator('text=Focus State')).toBeVisible();
    await expect(page.locator('text=WebSocket')).toBeVisible();
    
    // Verify refresh and auto controls
    await expect(page.locator('button:has-text("Refresh")')).toBeVisible();
    await expect(page.locator('button:has-text("Auto")')).toBeVisible();
  });

  test('should display feedback section with Send Feedback button', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForSelector('.sidebar-view-tabs', { timeout: 10000 });
    
    // Click Debug tab
    const debugTab = page.locator('button.sidebar-view-tab:has-text("Debug")');
    await debugTab.click();
    await page.waitForTimeout(500);
    
    // Verify Feedback section is visible
    await expect(page.locator('h4:has-text("Report Feedback")')).toBeVisible();
    
    // Verify feedback description text
    await expect(page.locator('text=Found a bug or have a feature request?')).toBeVisible();
    
    // Verify Send Feedback button exists and is visible
    const feedbackButton = page.locator('button:has-text("Send Feedback")');
    await expect(feedbackButton).toBeVisible();
    
    // Verify button is clickable
    await expect(feedbackButton).toBeEnabled();
  });

  test('should open Feedback modal when Send Feedback button is clicked', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForSelector('.sidebar-view-tabs', { timeout: 10000 });
    
    // Click Debug tab
    const debugTab = page.locator('button.sidebar-view-tab:has-text("Debug")');
    await debugTab.click();
    await page.waitForTimeout(500);
    
    // Click Send Feedback button
    const feedbackButton = page.locator('button:has-text("Send Feedback")');
    await feedbackButton.click();
    
    // Wait for modal to appear
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    
    // Verify Feedback modal is open
    await expect(page.locator('.modal-overlay')).toBeVisible();
    
    // Verify modal header
    await expect(page.locator('h2:has-text("Submit Feedback")')).toBeVisible();
    
    // Verify key elements in feedback modal
    await expect(page.locator('text=GitHub Token')).toBeVisible();
    await expect(page.locator('button:has-text("Capture Screenshot")')).toBeVisible();
  });

  test('should switch between tabs correctly', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForSelector('.sidebar-view-tabs', { timeout: 10000 });
    
    // Start with Cards (default)
    await expect(page.locator('h3:has-text("⚡ Commands")')).toBeVisible();
    
    // Switch to Debug
    await page.locator('button.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('h3:has-text("🐛 Debug")')).toBeVisible();
    await expect(page.locator('h4:has-text("Report Feedback")')).toBeVisible();
    
    // Switch to Files
    await page.locator('button.sidebar-view-tab:has-text("Files")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('h3:has-text("📁 Files")')).toBeVisible();
    
    // Switch back to Debug
    await page.locator('button.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('h3:has-text("🐛 Debug")')).toBeVisible();
    await expect(page.locator('h4:has-text("Report Feedback")')).toBeVisible();
  });

  test('should show diagnostic data in Debug panel', async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForSelector('.sidebar-view-tabs', { timeout: 10000 });
    
    // Click Debug tab
    await page.locator('button.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(500);
    
    // Verify Terminal Info section has data
    const terminalInfo = page.locator('text=Terminal Info').locator('..');
    await expect(terminalInfo).toContainText('Tab ID');
    await expect(terminalInfo).toContainText('Rows × Cols');
    
    // Verify Focus State section has data
    const focusState = page.locator('text=Focus State').locator('..');
    await expect(focusState).toContainText('Active Element');
    await expect(focusState).toContainText('Has Focus');
    
    // Verify WebSocket section has data
    const wsSection = page.locator('text=WebSocket').locator('..');
    await expect(wsSection).toContainText('State');
  });
});
