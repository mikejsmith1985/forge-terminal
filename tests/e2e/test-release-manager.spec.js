import { test, expect } from '@playwright/test';

test.describe('Release Manager Card', () => {
  test('should display release manager card and generate command', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:8333');
    
    // Wait for command cards to load
    await page.waitForSelector('.command-cards-container');
    
    // Check if Release Manager card is present
    // It might be in the "System Cards" section
    const card = page.locator('.release-manager-card');
    await expect(card).toBeVisible();
    
    // Check version display
    await expect(card.locator('.current-version')).toBeVisible();
    await expect(card.locator('.next-version')).toBeVisible();
    
    // Click "Show Command"
    await card.locator('button:has-text("Show Command")').click();
    
    // Check if command is generated
    const commandText = card.locator('.rm-command-text');
    await expect(commandText).toBeVisible();
    const text = await commandText.innerText();
    expect(text).toContain('git checkout main');
    expect(text).toContain('gh release create');
    
    // Click "Release" button
    // We can't easily verify the terminal execution without hooking into the websocket or terminal output
    // But we can verify the button is clickable and not disabled
    const releaseBtn = card.locator('.rm-execute-button');
    await expect(releaseBtn).toBeEnabled();
  });
});
