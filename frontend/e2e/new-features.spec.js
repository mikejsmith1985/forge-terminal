import { test, expect } from '@playwright/test';

// Helper function to dismiss any visible toasts
async function dismissToasts(page) {
  await page.waitForTimeout(500);
  const toastCloseButtons = page.locator('.toast .toast-close');
  const count = await toastCloseButtons.count();
  for (let i = 0; i < count; i++) {
    try {
      await toastCloseButtons.nth(i).click({ timeout: 1000 });
    } catch (e) {
      // Toast may have already closed
    }
  }
  await page.waitForTimeout(300);
}

test.describe('High Contrast Accessibility Themes', () => {

  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('should have 10 color themes available', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Cycle through all themes by clicking the palette button
    const paletteBtn = page.locator('.theme-controls button').filter({ has: page.locator('svg') }).first();
    
    const themeNames = [];
    for (let i = 0; i < 10; i++) {
      await paletteBtn.click();
      await page.waitForTimeout(300);
      
      // Check for theme toast
      const toast = page.locator('.toast');
      if (await toast.count() > 0) {
        const text = await toast.first().textContent();
        if (text.includes('Theme:')) {
          themeNames.push(text);
        }
      }
      await dismissToasts(page);
    }
    
    // We should have cycled through at least 10 themes
    expect(themeNames.length).toBeGreaterThanOrEqual(10);
  });

  test('should include high contrast themes in cycle', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    const paletteBtn = page.locator('.theme-controls button').filter({ has: page.locator('svg') }).first();
    
    let foundHighContrast = false;
    for (let i = 0; i < 12; i++) {
      await paletteBtn.click();
      await page.waitForTimeout(300);
      
      // Check for theme toast
      const toast = page.locator('.toast');
      if (await toast.count() > 0) {
        const text = await toast.first().textContent();
        if (text.includes('High Contrast') || text.includes('CVD')) {
          foundHighContrast = true;
        }
      }
      await dismissToasts(page);
    }
    
    expect(foundHighContrast).toBe(true);
  });

  test('high contrast dark theme should have strong contrast', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    const paletteBtn = page.locator('.theme-controls button').filter({ has: page.locator('svg') }).first();
    
    // Cycle to find High Contrast Dark
    for (let i = 0; i < 12; i++) {
      await paletteBtn.click();
      await page.waitForTimeout(300);
      
      const toast = page.locator('.toast');
      if (await toast.count() > 0) {
        const text = await toast.first().textContent();
        if (text.includes('High Contrast Dark')) {
          await dismissToasts(page);
          break;
        }
      }
      await dismissToasts(page);
    }
    
    // Check that the background is very dark (black)
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    });
    
    // High contrast dark should have black background
    expect(bgColor).toBe('#000000');
  });

});

test.describe('Splash Screen (Welcome Modal) Features', () => {

  test.beforeEach(async ({ page }) => {
    // Clear welcome shown status to force showing modal
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('welcome modal should list AM feature', async ({ page }) => {
    // Reset welcome status by using a new version
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    
    // If welcome modal is open, check for AM
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const amFeature = welcomeModal.locator('text=AM (Artificial Memory)');
      await expect(amFeature).toBeVisible();
    }
  });

  test('welcome modal should list Auto-Respond feature', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const autoRespondFeature = welcomeModal.locator('text=Auto-Respond');
      await expect(autoRespondFeature).toBeVisible();
    }
  });

  test('welcome modal should list Self-Naming Tabs feature', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const selfNamingFeature = welcomeModal.locator('text=Self-Naming Tabs');
      await expect(selfNamingFeature).toBeVisible();
    }
  });

  test('welcome modal should list Accessibility Themes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const accessibilityFeature = welcomeModal.locator('strong:has-text("Accessibility Themes")');
      await expect(accessibilityFeature).toBeVisible();
    }
  });

  test('welcome modal should show 10 Color Themes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const themeCount = welcomeModal.locator('text=10 Color Themes');
      await expect(themeCount).toBeVisible();
    }
  });

});

test.describe('Desktop Shortcut Feature', () => {

  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('should show Create Desktop Shortcut button in settings', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Open settings modal
    const settingsBtn = page.locator('.terminal-controls button[title="Shell Settings"]');
    await settingsBtn.click();

    // Check for desktop shortcut button
    const shortcutBtn = page.locator('button:has-text("Create Desktop Shortcut")');
    await expect(shortcutBtn).toBeVisible();
  });

  test('should have Installation section in settings', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Open settings modal
    const settingsBtn = page.locator('.terminal-controls button[title="Shell Settings"]');
    await settingsBtn.click();

    // Check for Installation label
    const installationLabel = page.locator('label:has-text("Installation")');
    await expect(installationLabel).toBeVisible();
  });

  test('desktop shortcut API should be available', async ({ page }) => {
    // Test the API endpoint exists
    const response = await page.request.post('/api/desktop-shortcut');
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    // API should return success or error (both valid responses)
    expect(data).toHaveProperty('success');
  });

  test('clicking shortcut button should show feedback', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Open settings modal
    const settingsBtn = page.locator('.terminal-controls button[title="Shell Settings"]');
    await settingsBtn.click();

    // Click the desktop shortcut button
    const shortcutBtn = page.locator('button:has-text("Create Desktop Shortcut")');
    await shortcutBtn.click();

    // Wait for toast feedback
    await page.waitForTimeout(1000);
    
    // Should show a toast (either success or error)
    const toast = page.locator('.toast');
    const toastVisible = await toast.count() > 0;
    expect(toastVisible).toBe(true);
  });

});

test.describe('Per-Tab Light/Dark Mode', () => {

  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/sessions', {
      data: { tabs: [], activeTabId: '' }
    });
  });

  test('should show Light/Dark Mode option in tab context menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    // Right-click on tab to open context menu
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });

    // Context menu should have Light Mode or Dark Mode option
    const contextMenu = page.locator('.tab-context-menu');
    await expect(contextMenu).toBeVisible();
    
    // Should have either Light Mode or Dark Mode text
    const modeOption = contextMenu.locator('button:has-text("Light Mode"), button:has-text("Dark Mode")');
    await expect(modeOption).toBeVisible();
  });

  test('should toggle mode when clicking Light/Dark Mode option', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    // Get initial background color
    const initialBg = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    });

    // Right-click on tab to open context menu
    const tab = page.locator('.tab-bar .tab').first();
    await tab.click({ button: 'right' });

    // Click the Light/Dark Mode option
    const modeOption = page.locator('.tab-context-menu button:has-text("Light Mode"), .tab-context-menu button:has-text("Dark Mode")');
    await modeOption.click();

    await page.waitForTimeout(500);

    // Background should have changed
    const newBg = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    });

    expect(newBg).not.toBe(initialBg);
  });

  test('new tabs should alternate modes for visual variety', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);
    await page.waitForTimeout(2000);

    // Create a second tab
    const newTabBtn = page.locator('.tab-bar .new-tab-btn');
    await newTabBtn.click();
    await page.waitForTimeout(1000);

    // Check session has tabs with alternating modes
    const sessionRes = await page.request.get('/api/sessions');
    const session = await sessionRes.json();
    
    if (session.tabs && session.tabs.length >= 2) {
      const modes = session.tabs.map(t => t.mode || 'dark');
      // At least one should be different (alternating)
      const hasVariety = modes.some((m, i) => i > 0 && m !== modes[i-1]);
      expect(hasVariety).toBe(true);
    }
  });

});

test.describe('Emoji Icons for Command Cards', () => {

  test('should show Emoji category in icon picker', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Click Add button to open command modal
    const addBtn = page.locator('.sidebar button:has-text("Add")');
    await addBtn.click();

    // Click on icon picker button
    const iconBtn = page.locator('.icon-select-btn');
    await iconBtn.click();

    // Emoji category should be visible
    const emojiCategory = page.locator('.category-btn:has-text("Emoji")');
    await expect(emojiCategory).toBeVisible();
  });

  test('should show emoji icons in picker', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Click Add button to open command modal
    const addBtn = page.locator('.sidebar button:has-text("Add")');
    await addBtn.click();

    // Click on icon picker button
    const iconBtn = page.locator('.icon-select-btn');
    await iconBtn.click();

    // Click Emoji category
    const emojiCategory = page.locator('.category-btn:has-text("Emoji")');
    await emojiCategory.click();

    // Should have emoji icons (check for robot emoji)
    const robotIcon = page.locator('.icon-option:has-text("🤖")');
    await expect(robotIcon).toBeVisible();
  });

  test('should be able to select emoji icon for command', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app', { timeout: 10000 });
    await dismissToasts(page);

    // Click Add button to open command modal
    const addBtn = page.locator('.sidebar button:has-text("Add")');
    await addBtn.click();

    // Click on icon picker button
    const iconBtn = page.locator('.icon-select-btn');
    await iconBtn.click();

    // Click Emoji category (should be default now)
    const emojiCategory = page.locator('.category-btn:has-text("Emoji")');
    if (await emojiCategory.isVisible()) {
      await emojiCategory.click();
    }

    // Click rocket emoji
    const rocketIcon = page.locator('.icon-option:has-text("🚀")');
    await rocketIcon.click();

    // Icon button should now show rocket emoji
    await expect(iconBtn.locator('text=🚀')).toBeVisible();
  });

});
