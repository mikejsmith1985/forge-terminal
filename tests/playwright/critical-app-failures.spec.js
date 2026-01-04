/**
 * Critical App Failure Tests
 * Tests for v3.11.4+ regression issues:
 * 1. Debug panel click breaks app
 * 2. Command cards fail to load
 * 3. Random terminal refresh/reload
 */

const { test, expect } = require('@playwright/test');

test.describe('Critical App Failures - v3.11.4+', () => {
  test.beforeEach(async ({ page }) => {
    // Enable console logging to catch errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`[Browser Error] ${msg.text()}`);
      }
    });

    // Catch unhandled errors
    page.on('pageerror', error => {
      console.error(`[Page Error] ${error.message}`);
    });

    // Start the app
    await page.goto('http://localhost:3000');
    
    // Wait for app to be ready
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
  });

  test('ISSUE 1: Debug panel click should not break app', async ({ page }) => {
    // Enable dev mode first (required to see Debug tab)
    await page.keyboard.press('Control+Shift+D');
    await page.waitForTimeout(500);

    // Verify dev mode is active
    const devModeIndicator = await page.locator('[title*="Dev Mode"]').count();
    if (devModeIndicator === 0) {
      console.log('Dev mode not active, trying alternative activation');
      // Try opening settings and enabling dev mode
      await page.keyboard.press('Control+,');
      await page.waitForTimeout(500);
      const devModeToggle = page.locator('text=Developer Mode').first();
      if (await devModeToggle.isVisible()) {
        await devModeToggle.click();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // Find the Debug tab button
    const debugButton = page.locator('button:has-text("Debug")').first();
    await expect(debugButton).toBeVisible({ timeout: 5000 });

    // Record app state before clicking
    const terminalVisibleBefore = await page.locator('.terminal-container').isVisible();
    expect(terminalVisibleBefore).toBe(true);

    // Click the Debug tab
    await debugButton.click();
    await page.waitForTimeout(1000);

    // CRITICAL: App should not crash or freeze
    // 1. Terminal should still be visible
    const terminalVisibleAfter = await page.locator('.terminal-container').isVisible();
    expect(terminalVisibleAfter).toBe(true);

    // 2. Debug panel should be visible
    const debugPanel = page.locator('.debug-card, .debug-card-header');
    await expect(debugPanel.first()).toBeVisible({ timeout: 3000 });

    // 3. No JavaScript errors should be thrown
    const errors = [];
    page.on('pageerror', error => errors.push(error));
    await page.waitForTimeout(2000);
    expect(errors.length).toBe(0);

    // 4. App should remain responsive
    await page.locator('button:has-text("Cards")').click();
    await page.waitForTimeout(500);
    const cardsVisible = await page.locator('.command-cards-container').isVisible();
    expect(cardsVisible).toBe(true);

    // 5. Can switch back to debug without issues
    await debugButton.click();
    await page.waitForTimeout(500);
    const debugPanelAgain = await page.locator('.debug-card, .debug-card-header').first();
    await expect(debugPanelAgain).toBeVisible();
  });

  test('ISSUE 2: Command cards should load successfully', async ({ page }) => {
    // Wait for command cards container
    await page.waitForSelector('.command-cards-container', { timeout: 10000 });

    // Check for loading state
    const loadingIndicator = page.locator('.command-cards-loading');
    if (await loadingIndicator.isVisible()) {
      console.log('Cards are loading...');
      // Wait for loading to complete (max 10 seconds)
      await loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 });
    }

    // Check for error state
    const errorIndicator = page.locator('.command-cards-error');
    const hasError = await errorIndicator.isVisible();
    
    if (hasError) {
      const errorText = await errorIndicator.textContent();
      console.error(`Command cards error: ${errorText}`);
      
      // Try the retry button if available
      const retryButton = page.locator('button:has-text("Retry")');
      if (await retryButton.isVisible()) {
        await retryButton.click();
        await page.waitForTimeout(2000);
      }
    }

    // CRITICAL: Cards should load without error
    await expect(errorIndicator).not.toBeVisible();

    // Verify cards container is functional
    const cardsContainer = page.locator('.command-cards-container');
    await expect(cardsContainer).toBeVisible();

    // Check if we have either user cards or empty state
    const hasCards = await page.locator('.sortable-command-card, .owner-release-card').count() > 0;
    const hasEmptyState = await page.locator('.command-cards-empty').isVisible();
    
    expect(hasCards || hasEmptyState).toBe(true);

    // Verify Add button is functional
    const addButton = page.locator('button:has-text("Add")').first();
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeEnabled();

    // Click Add button to verify modal opens
    await addButton.click();
    await page.waitForTimeout(500);
    const modal = page.locator('.modal, [role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 2000 });
  });

  test('ISSUE 3: Terminal should not randomly refresh/reload', async ({ page }) => {
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal-container', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Track WebSocket reconnection attempts
    let reconnectAttempts = 0;
    let refreshDetected = false;
    
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Reconnecting') || text.includes('reconnect')) {
        reconnectAttempts++;
        console.log(`[Reconnect Detected] ${text}`);
      }
      if (text.includes('refresh') || text.includes('reload')) {
        refreshDetected = true;
        console.log(`[Refresh Detected] ${text}`);
      }
    });

    // Type something in the terminal
    await page.locator('.terminal').click();
    await page.keyboard.type('echo "stability test"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Monitor for 30 seconds for unexpected refreshes
    const startTime = Date.now();
    const monitorDuration = 30000; // 30 seconds

    while (Date.now() - startTime < monitorDuration) {
      await page.waitForTimeout(1000);
      
      // Check if terminal is still visible and responsive
      const terminalVisible = await page.locator('.terminal-container').isVisible();
      expect(terminalVisible).toBe(true);

      // Check for reconnection indicators
      const reconnectingMsg = page.locator('text=/Reconnecting/i');
      const hasReconnectMsg = await reconnectingMsg.isVisible();
      
      if (hasReconnectMsg) {
        console.error('Unexpected reconnection detected!');
        const msgText = await reconnectingMsg.textContent();
        console.error(`Message: ${msgText}`);
      }
    }

    // CRITICAL: No unexpected reconnections should occur during normal operation
    expect(reconnectAttempts).toBe(0);
    expect(refreshDetected).toBe(false);

    // Verify terminal is still functional after monitoring
    await page.keyboard.type('echo "still working"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const terminalStillWorking = await page.locator('.terminal-container').isVisible();
    expect(terminalStillWorking).toBe(true);
  });

  test('ISSUE 4: State preservation during view switches', async ({ page }) => {
    // Enable dev mode
    await page.keyboard.press('Control+Shift+D');
    await page.waitForTimeout(500);

    // Switch between views multiple times
    const views = ['Cards', 'Files', 'Debug', 'Cards', 'Files', 'Debug'];
    
    for (const view of views) {
      const button = page.locator(`button:has-text("${view}")`).first();
      
      if (await button.isVisible()) {
        console.log(`Switching to ${view} view...`);
        await button.click();
        await page.waitForTimeout(500);

        // Verify terminal is still visible
        const terminalVisible = await page.locator('.terminal-container').isVisible();
        expect(terminalVisible).toBe(true);

        // Verify no errors occurred
        const errorOverlay = page.locator('.error-boundary, text=/Error/i').first();
        const hasError = await errorOverlay.isVisible().catch(() => false);
        expect(hasError).toBe(false);
      }
    }

    // After all switches, app should still be functional
    await page.keyboard.type('echo "final test"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const finalCheck = await page.locator('.terminal-container').isVisible();
    expect(finalCheck).toBe(true);
  });

  test('ISSUE 5: WebSocket stability under load', async ({ page }) => {
    // Track WebSocket events
    const wsEvents = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('WebSocket') || text.includes('ws:')) {
        wsEvents.push({ type: 'console', text, timestamp: Date.now() });
      }
    });

    // Generate load by rapid command execution
    for (let i = 0; i < 20; i++) {
      await page.keyboard.type(`echo "test ${i}"`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
    }

    // Wait for processing
    await page.waitForTimeout(3000);

    // Check for WebSocket errors or disconnections
    const wsErrors = wsEvents.filter(e => 
      e.text.includes('error') || 
      e.text.includes('closed') || 
      e.text.includes('disconnect')
    );

    console.log(`WebSocket events: ${wsEvents.length}, Errors: ${wsErrors.length}`);
    
    // CRITICAL: No WebSocket errors should occur during normal load
    expect(wsErrors.length).toBe(0);

    // Terminal should still be responsive
    await page.keyboard.type('echo "after load"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const terminalResponsive = await page.locator('.terminal-container').isVisible();
    expect(terminalResponsive).toBe(true);
  });
});

test.describe('Root Cause Analysis Tests', () => {
  test('Analyze Debug panel initialization', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('.terminal-container', { timeout: 10000 });

    // Enable dev mode
    await page.keyboard.press('Control+Shift+D');
    await page.waitForTimeout(500);

    // Capture network requests
    const requests = [];
    page.on('request', req => requests.push(req.url()));

    // Click debug panel
    const debugButton = page.locator('button:has-text("Debug")').first();
    if (await debugButton.isVisible()) {
      await debugButton.click();
      await page.waitForTimeout(2000);

      console.log('Network requests during debug panel load:', requests.length);
      
      // Check if debug panel made unexpected API calls
      const apiCalls = requests.filter(url => url.includes('/api/'));
      console.log('API calls:', apiCalls);
    }
  });

  test('Analyze command cards loading sequence', async ({ page }) => {
    const loadingEvents = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('command') || text.includes('card') || text.includes('loading')) {
        loadingEvents.push({ text, timestamp: Date.now() });
      }
    });

    await page.goto('http://localhost:3000');
    
    // Monitor loading sequence
    await page.waitForTimeout(5000);
    
    console.log('Loading events:', loadingEvents);
    
    // Check if loading completed
    const cardsContainer = page.locator('.command-cards-container');
    const isVisible = await cardsContainer.isVisible();
    console.log('Cards container visible:', isVisible);
    
    // Check for error state
    const errorState = await page.locator('.command-cards-error').isVisible();
    console.log('Error state:', errorState);
    
    if (errorState) {
      const errorText = await page.locator('.command-cards-error').textContent();
      console.error('Command cards error:', errorText);
    }
  });
});
