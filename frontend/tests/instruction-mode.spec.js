// TEST: Instruction Mode Button Visibility
// Tests that the Instructions button is visible and functional in Power Features

import { test, expect } from '@playwright/test';

test.describe('Instruction Mode Button', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8333');
    await page.waitForLoadState('networkidle');
  });

  test('Instructions button should be visible in Power Features header', async ({ page }) => {
    // Open Power Features with Ctrl+/
    await page.keyboard.press('Control+/');
    
    // Wait for modal to appear
    await page.waitForSelector('.forge-assist-modal', { timeout: 5000 });
    
    // Check if Instructions button exists in header
    const instructionsButton = page.locator('.forge-assist-header button', { hasText: 'Instructions' });
    
    // Verify button is visible
    await expect(instructionsButton).toBeVisible({ timeout: 5000 });
    
    // Take screenshot for evidence
    await page.screenshot({ path: 'test-results/instructions-button-visible.png', fullPage: true });
  });

  test('Instructions button should toggle ON/OFF state', async ({ page }) => {
    // Open Power Features
    await page.keyboard.press('Control+/');
    await page.waitForSelector('.forge-assist-modal');
    
    const instructionsButton = page.locator('.forge-assist-header button', { hasText: 'Instructions' });
    
    // Initial state should be OFF (gray background)
    const initialBg = await instructionsButton.evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(initialBg).toContain('rgb(51, 51, 51)'); // #333 gray
    
    // Click to turn ON
    await instructionsButton.click();
    await page.waitForTimeout(300); // Wait for transition
    
    // Should now show ON badge
    const onBadge = page.locator('.forge-assist-header button:has-text("Instructions") span:has-text("ON")');
    await expect(onBadge).toBeVisible();
    
    // Background should be purple
    const activeBg = await instructionsButton.evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(activeBg).toContain('rgb(139, 92, 246)'); // #8b5cf6 purple
    
    // Edit button should appear
    const editButton = page.locator('.forge-assist-header button', { hasText: 'Edit' });
    await expect(editButton).toBeVisible();
    
    // Screenshot evidence of ON state
    await page.screenshot({ path: 'test-results/instructions-button-on.png', fullPage: true });
  });

  test('Edit button should open instructions modal', async ({ page }) => {
    // Open Power Features and enable Instructions
    await page.keyboard.press('Control+/');
    await page.waitForSelector('.forge-assist-modal');
    
    const instructionsButton = page.locator('.forge-assist-header button', { hasText: 'Instructions' });
    await instructionsButton.click();
    
    // Click Edit button
    const editButton = page.locator('.forge-assist-header button', { hasText: 'Edit' });
    await editButton.click();
    
    // Instructions editor modal should appear
    const editorModal = page.locator('div:has-text("Custom Instructions")').first();
    await expect(editorModal).toBeVisible({ timeout: 5000 });
    
    // Textarea should be present
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    
    // Screenshot of editor modal
    await page.screenshot({ path: 'test-results/instructions-editor-modal.png', fullPage: true });
  });
});
