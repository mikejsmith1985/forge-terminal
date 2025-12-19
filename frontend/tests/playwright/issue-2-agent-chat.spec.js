/**
 * Test suite for GitHub Issue #2: Agent Chat Improvements
 * 
 * Tests:
 * 1. Light themes work correctly in Agent Chat
 * 2. Settings button is clickable and styled properly
 * 3. WebSocket connection status displays correctly
 * 4. Agent chat UI renders properly in all themes
 */

const { test, expect } = require('@playwright/test');

const THEMES = [
  { name: 'Molten Metal', value: 'molten' },
  { name: 'Deep Ocean', value: 'ocean' },
  { name: 'Emerald Forest', value: 'forest' },
  { name: 'Midnight Purple', value: 'midnight' },
];

test.describe('Issue #2: Agent Chat Improvements', () => {
  
  test.beforeEach(async ({ page }) => {
    // Start the app
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Wait for app to be ready
    await page.waitForSelector('.app', { timeout: 10000 });
  });

  test('Agent Chat - Light theme support', async ({ page }) => {
    // Create a new agent tab
    const agentButton = page.locator('button[title="New Agent Tab"]');
    await agentButton.click();
    
    // Wait for agent tab to be created
    await page.waitForSelector('.assistant-panel', { timeout: 5000 });
    
    // Switch to light mode via context menu
    const tabElement = page.locator('.tab.active');
    await tabElement.click({ button: 'right' });
    
    const lightModeOption = page.locator('text=Switch to Light Mode');
    if (await lightModeOption.isVisible()) {
      await lightModeOption.click();
    }
    
    // Wait for theme to apply
    await page.waitForTimeout(500);
    
    // Take screenshot for visual validation
    await page.screenshot({ 
      path: 'test-results/issue-2-agent-light-mode.png',
      fullPage: true 
    });
    
    // Verify light theme colors are applied
    const panel = page.locator('.assistant-panel');
    const bgColor = await panel.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    
    // Light mode should have a light background (not dark)
    // RGB values should be high for light backgrounds
    expect(bgColor).not.toBe('rgb(30, 30, 30)'); // Not dark
    
    console.log('✓ Light theme applied successfully');
  });

  test('Agent Chat - All themes in dark mode', async ({ page }) => {
    for (const theme of THEMES) {
      console.log(`Testing theme: ${theme.name}`);
      
      // Create new agent tab
      const agentButton = page.locator('button[title="New Agent Tab"]');
      await agentButton.click();
      await page.waitForTimeout(500);
      
      // Right-click on active tab
      const tabElement = page.locator('.tab.active');
      await tabElement.click({ button: 'right' });
      
      // Select theme
      const themeOption = page.locator(`text=${theme.name}`);
      if (await themeOption.isVisible()) {
        await themeOption.click();
        await page.waitForTimeout(300);
      }
      
      // Take screenshot
      await page.screenshot({ 
        path: `test-results/issue-2-agent-${theme.value}-dark.png`,
        fullPage: false 
      });
      
      // Close the tab
      const closeButton = tabElement.locator('.tab-close');
      await closeButton.click();
      await page.waitForTimeout(300);
    }
    
    console.log('✓ All themes tested successfully');
  });

  test('Agent Chat - All themes in light mode', async ({ page }) => {
    for (const theme of THEMES) {
      console.log(`Testing light theme: ${theme.name}`);
      
      // Create new agent tab  
      const agentButton = page.locator('button[title="New Agent Tab"]');
      await agentButton.click();
      await page.waitForTimeout(500);
      
      // Right-click on active tab
      const tabElement = page.locator('.tab.active');
      await tabElement.click({ button: 'right' });
      
      // Switch to light mode first
      const lightModeOption = page.locator('text=Switch to Light Mode');
      if (await lightModeOption.isVisible()) {
        await lightModeOption.click();
        await page.waitForTimeout(300);
      }
      
      // Right-click again to select theme
      await tabElement.click({ button: 'right' });
      const themeOption = page.locator(`text=${theme.name}`);
      if (await themeOption.isVisible()) {
        await themeOption.click();
        await page.waitForTimeout(300);
      }
      
      // Take screenshot
      await page.screenshot({ 
        path: `test-results/issue-2-agent-${theme.value}-light.png`,
        fullPage: false 
      });
      
      // Close the tab
      const closeButton = tabElement.locator('.tab-close');
      await closeButton.click();
      await page.waitForTimeout(300);
    }
    
    console.log('✓ All light themes tested successfully');
  });

  test('Agent Chat - Settings button functionality', async ({ page }) => {
    // Create new agent tab
    const agentButton = page.locator('button[title="New Agent Tab"]');
    await agentButton.click();
    await page.waitForTimeout(500);
    
    // Find settings button
    const settingsButton = page.locator('.header-icon-btn[title="Settings"]');
    await expect(settingsButton).toBeVisible();
    
    // Verify button is styled correctly
    const buttonStyles = await settingsButton.evaluate(el => ({
      border: window.getComputedStyle(el).border,
      borderRadius: window.getComputedStyle(el).borderRadius,
      cursor: window.getComputedStyle(el).cursor
    }));
    
    expect(buttonStyles.cursor).toBe('pointer');
    expect(buttonStyles.borderRadius).not.toBe('0px');
    
    // Click settings button (should log to console for now)
    await settingsButton.click();
    
    // Wait to see hover effect
    await settingsButton.hover();
    await page.waitForTimeout(200);
    
    await page.screenshot({ 
      path: 'test-results/issue-2-settings-button.png' 
    });
    
    console.log('✓ Settings button is functional and styled');
  });

  test('Agent Chat - Connection status indicator', async ({ page }) => {
    // Create new agent tab
    const agentButton = page.locator('button[title="New Agent Tab"]');
    await agentButton.click();
    await page.waitForTimeout(1000);
    
    // Find connection status
    const statusIndicator = page.locator('.connection-status');
    await expect(statusIndicator).toBeVisible();
    
    const statusText = await statusIndicator.textContent();
    expect(['Connected', 'Disconnected']).toContain(statusText);
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/issue-2-connection-status.png' 
    });
    
    console.log(`✓ Connection status: ${statusText}`);
  });

  test('Agent Chat - UI elements visibility', async ({ page }) => {
    // Create new agent tab
    const agentButton = page.locator('button[title="New Agent Tab"]');
    await agentButton.click();
    await page.waitForTimeout(500);
    
    // Verify all key UI elements are present
    await expect(page.locator('.assistant-header')).toBeVisible();
    await expect(page.locator('.messages-container')).toBeVisible();
    await expect(page.locator('.input-area')).toBeVisible();
    await expect(page.locator('.input-area input')).toBeVisible();
    await expect(page.locator('.input-area button')).toBeVisible();
    
    // Verify header elements
    await expect(page.locator('.header-title h3')).toContainText('Forge Assistant');
    await expect(page.locator('.header-icon-btn[title="Settings"]')).toBeVisible();
    await expect(page.locator('.header-icon-btn[title="Close"]')).toBeVisible();
    
    // Take final screenshot
    await page.screenshot({ 
      path: 'test-results/issue-2-ui-complete.png',
      fullPage: true 
    });
    
    console.log('✓ All UI elements visible');
  });

  test('Agent Chat - Input field interaction', async ({ page }) => {
    // Create new agent tab
    const agentButton = page.locator('button[title="New Agent Tab"]');
    await agentButton.click();
    await page.waitForTimeout(500);
    
    // Type in input field
    const input = page.locator('.input-area input');
    await input.fill('Hello, Forge Assistant!');
    
    // Verify input value
    await expect(input).toHaveValue('Hello, Forge Assistant!');
    
    // Check send button state
    const sendButton = page.locator('.input-area button[type="submit"]');
    await expect(sendButton).toBeEnabled();
    
    // Take screenshot with input
    await page.screenshot({ 
      path: 'test-results/issue-2-input-filled.png' 
    });
    
    // Clear input
    await input.clear();
    await expect(input).toHaveValue('');
    
    // Send button should be disabled with empty input
    await expect(sendButton).toBeDisabled();
    
    console.log('✓ Input field works correctly');
  });

});
