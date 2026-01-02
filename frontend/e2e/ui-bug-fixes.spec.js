import { test, expect } from '@playwright/test';

/**
 * Tests for UI bug fixes:
 * 1. Quick Instructions modal not closing when clicking inputs
 */

test.describe('UI Bug Fixes', () => {
  
  test.beforeEach(async ({ page }) => {
    // Clear any tour state
    await page.addInitScript(() => {
      localStorage.setItem('hasSeenTour', 'true');
      localStorage.setItem('forge_hasSeenTour', 'true');
    });
    
    await page.goto('/');
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);
    
    // Force close tour by clicking skip/close multiple times
    for (let i = 0; i < 3; i++) {
      const skipButton = page.locator('button:has-text("Skip")');
      const skipTourButton = page.locator('button:has-text("Skip tour")');
      const nextButton = page.locator('.tour-overlay button');
      
      try {
        if (await skipButton.isVisible({ timeout: 500 }).catch(() => false)) {
          await skipButton.first().click({ force: true });
          await page.waitForTimeout(300);
        } else if (await skipTourButton.isVisible({ timeout: 500 }).catch(() => false)) {
          await skipTourButton.click({ force: true });
          await page.waitForTimeout(300);
        }
      } catch (e) {
        // Tour not visible
      }
    }
    
    // Wait for tour to close
    await page.waitForTimeout(500);
    
    // Try clicking body to close tour if still present
    await page.evaluate(() => {
      const tour = document.querySelector('.tour-overlay');
      if (tour) tour.remove();
    });
    await page.waitForTimeout(300);
  });

  test('Quick Instructions modal should stay open when clicking input fields', async ({ page }) => {
    // Open ForgeAssist by clicking the floating button
    const floatingBtn = page.locator('.forge-assist-floating-btn');
    await floatingBtn.click();
    await page.waitForTimeout(500);
    
    // Wait for ForgeAssist modal to be visible
    await page.waitForSelector('.forge-assist-modal', { timeout: 5000 });
    
    // Find and click the Quick button
    const quickButton = page.locator('button:has-text("Quick")');
    await expect(quickButton).toBeVisible({ timeout: 3000 });
    await quickButton.click();
    await page.waitForTimeout(500);
    
    // The Quick Instructions panel should be visible
    const panelHeading = page.locator('h3:has-text("Quick Instructions")');
    await expect(panelHeading).toBeVisible({ timeout: 3000 });
    
    // Click on the label input
    const labelInput = page.locator('input[placeholder*="Label"]');
    await expect(labelInput).toBeVisible({ timeout: 3000 });
    await labelInput.click();
    await page.waitForTimeout(300);
    
    // Panel should STILL be visible (not closed) - the bug was that it would close
    await expect(panelHeading).toBeVisible();
    
    // Type in the label input
    await labelInput.fill('Test Instruction');
    await page.waitForTimeout(300);
    
    // Panel should STILL be visible after typing
    await expect(panelHeading).toBeVisible();
    
    // Click on the textarea
    const textArea = page.locator('textarea[placeholder*="instruction"]');
    await textArea.click();
    await page.waitForTimeout(300);
    
    // Panel should STILL be visible after clicking textarea
    await expect(panelHeading).toBeVisible();
    
    // Type in the textarea
    await textArea.fill('Follow copilot-instructions.md');
    await page.waitForTimeout(300);
    
    // Panel should STILL be visible after typing in textarea
    await expect(panelHeading).toBeVisible();
    
    // SUCCESS - panel stayed open during input interaction
    console.log('Quick Instructions panel stayed open - fix verified!');
  });
});
