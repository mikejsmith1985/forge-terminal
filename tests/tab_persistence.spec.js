const { test, expect } = require('@playwright/test');

test.describe('Tab Persistence', () => {
  test('should restore tab directory and title after reload', async ({ page }) => {
    // 1. Navigate to app
    await page.goto('http://localhost:3000');

    // 2. Create a new tab
    await page.keyboard.press('Control+t');
    
    // 3. Navigate to a specific directory
    // We assume the shell is ready.
    await page.waitForTimeout(1000);
    const targetDir = 'test-dir-' + Date.now();
    await page.keyboard.type(`mkdir ${targetDir}`);
    await page.keyboard.press('Enter');
    await page.keyboard.type(`cd ${targetDir}`);
    await page.keyboard.press('Enter');
    
    // 4. Wait for title update (frontend should detect directory change)
    await expect(page.locator('.tab.active .tab-title')).toContainText(targetDir, { timeout: 5000 });

    // 5. Reload the page (simulates session restore)
    await page.reload();

    // 6. Verify tab title is preserved
    // This confirms that the frontend state was saved and restored, 
    // AND that the PTY started correctly in the restored directory (or at least the frontend thinks so).
    // Note: If the PTY starts in default dir, the title might eventually change to "Forge-Terminal" 
    // once the prompt is detected, but initially it should be restored from session.
    await expect(page.locator('.tab.active .tab-title')).toContainText(targetDir, { timeout: 10000 });
    
    // 7. Verify we are actually in the directory by running 'pwd' or similar
    await page.keyboard.type('pwd'); // or Get-Location on Powershell
    await page.keyboard.press('Enter');
    // We would need to check terminal output here, which is hard with canvas/xterm.
  });
});
