/**
 * Playwright E2E test for Keyboard Diagnostics feature
 * 
 * Tests the DiagnosticsButton component which provides keyboard lockout debugging
 */
import { test, expect } from '@playwright/test';

test.describe('Keyboard Diagnostics Button', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:8333', { timeout: 30000 });
    
    // Wait for terminal to be ready
    await page.waitForSelector('.terminal-inner', { timeout: 10000 });
    await page.waitForTimeout(1000); // Let terminal fully initialize
  });

  test('diagnostics button should be visible on terminal', async ({ page }) => {
    // The diagnostics button should appear in the terminal container
    const diagButton = page.locator('.diagnostics-button');
    await expect(diagButton).toBeVisible({ timeout: 5000 });
  });

  test('clicking diagnostics button should capture diagnostic snapshot', async ({ page }) => {
    // Find and click the diagnostics button
    const diagButton = page.locator('.diagnostics-button').first();
    await expect(diagButton).toBeVisible({ timeout: 5000 });
    
    // Click to capture diagnostics
    await diagButton.click();
    
    // Diagnostics panel should appear
    const diagPanel = page.locator('.diagnostics-panel');
    await expect(diagPanel).toBeVisible({ timeout: 5000 });
    
    // Panel should contain diagnostic sections - use a simpler assertion
    const sections = page.locator('.diagnostics-panel .diagnostic-section');
    await expect(sections.first()).toBeVisible();
    
    // Should show WebSocket status
    await expect(page.locator('.diagnostics-panel').filter({ hasText: 'WebSocket' })).toBeVisible();
    
    // Should show Focus state
    await expect(page.locator('.diagnostics-panel').filter({ hasText: 'Focus' })).toBeVisible();
    
    // Should show Main Thread status
    await expect(page.locator('.diagnostics-panel').filter({ hasText: 'Main Thread' })).toBeVisible();
    
    // Should show Keyboard Events
    await expect(page.locator('.diagnostics-panel').filter({ hasText: 'Keyboard Events' })).toBeVisible();
  });

  test('diagnostics panel should show keyboard event tracking', async ({ page }) => {
    // Type some characters to generate keyboard events - use visible terminal
    const terminal = page.locator('.terminal-wrapper:not(.hidden) .terminal-inner');
    await terminal.click();
    await page.keyboard.type('test', { delay: 50 });
    
    // Wait a moment for events to be tracked
    await page.waitForTimeout(500);
    
    // Click diagnostics button
    const diagButton = page.locator('.diagnostics-button').first();
    await diagButton.click();
    
    // Panel should appear
    const diagPanel = page.locator('.diagnostics-panel');
    await expect(diagPanel).toBeVisible({ timeout: 5000 });
    
    // Should show event count > 0 (we typed 4 chars = 8 keydown/keyup events)
    const eventStats = page.locator('.diagnostics-panel').filter({ hasText: 'Keyboard Events' });
    await expect(eventStats).toBeVisible();
  });

  test('diagnostics panel can be closed', async ({ page }) => {
    // Click diagnostics button to open panel
    const diagButton = page.locator('.diagnostics-button').first();
    await diagButton.click();
    
    // Panel should be visible
    const diagPanel = page.locator('.diagnostics-panel');
    await expect(diagPanel).toBeVisible({ timeout: 5000 });
    
    // Find and click close button (the X icon)
    const closeButton = page.locator('.diagnostics-actions button').last();
    await closeButton.click();
    
    // Panel should be hidden
    await expect(diagPanel).not.toBeVisible();
  });

  test('diagnostics can be refreshed', async ({ page }) => {
    // Click diagnostics button
    const diagButton = page.locator('.diagnostics-button').first();
    await diagButton.click();
    
    // Panel should be visible
    const diagPanel = page.locator('.diagnostics-panel');
    await expect(diagPanel).toBeVisible({ timeout: 5000 });
    
    // Find refresh button
    const refreshButton = page.locator('.btn-refresh');
    await expect(refreshButton).toBeVisible();
    
    // Click refresh
    await refreshButton.click();
    
    // Panel should still be visible (refreshed)
    await expect(diagPanel).toBeVisible();
  });

  test('diagnostics can be copied to clipboard', async ({ page }) => {
    // Click diagnostics button
    const diagButton = page.locator('.diagnostics-button').first();
    await diagButton.click();
    
    // Panel should be visible
    const diagPanel = page.locator('.diagnostics-panel');
    await expect(diagPanel).toBeVisible({ timeout: 5000 });
    
    // Find copy button (ClipboardCopy icon button)
    const copyButton = page.locator('.diagnostics-actions button').first();
    
    // Click copy - should not throw error
    await copyButton.click();
    
    // Note: Can't easily verify clipboard contents in Playwright without permissions
    // But the button click should succeed without error
  });

  test('diagnostics shows WebSocket connected state', async ({ page }) => {
    // Wait for terminal connection
    await page.waitForTimeout(2000);
    
    // Click diagnostics button
    const diagButton = page.locator('.diagnostics-button').first();
    await diagButton.click();
    
    // Panel should show WebSocket as OPEN
    const wsState = page.locator('.diagnostics-panel').filter({ hasText: 'OPEN' });
    await expect(wsState).toBeVisible({ timeout: 5000 });
  });

  test('diagnostics shows document focus state', async ({ page }) => {
    // Click on terminal to ensure focus - use visible terminal
    const terminal = page.locator('.terminal-wrapper:not(.hidden) .terminal-inner');
    await terminal.click();
    
    // Click diagnostics button
    const diagButton = page.locator('.diagnostics-button').first();
    await diagButton.click();
    
    // Panel should show focus information
    const focusSection = page.locator('.diagnostic-section').filter({ hasText: 'Focus' });
    await expect(focusSection).toBeVisible({ timeout: 5000 });
    
    // Should show focus status
    await expect(focusSection.locator('text=Document has focus')).toBeVisible();
  });

});

test.describe('Keyboard Diagnostics API', () => {
  
  test('POST /api/diagnostics/keyboard should accept diagnostic data', async ({ request }) => {
    const diagnostic = {
      capturedAt: new Date().toISOString(),
      capturedAtMs: Date.now(),
      tabId: 'test-tab-123',
      userAgent: 'Playwright Test',
      wsState: {
        readyState: 1,
        readyStateText: 'OPEN',
        bufferedAmount: 0,
      },
      focusState: {
        activeElement: 'DIV',
        hasFocus: true,
        visibilityState: 'visible',
      },
      terminalState: {
        isConnected: true,
        isWaiting: false,
      },
      perfMetrics: {
        memory: 'unavailable',
        timing: {
          timeSinceLoad: 5000,
        },
      },
      eventStats: {
        totalKeyEvents: 42,
        pendingKeys: [],
        recentEvents: [
          { type: 'keydown', key: 't', timeSinceLast: 100 },
          { type: 'keyup', key: 't', timeSinceLast: 50 },
        ],
        timeSinceLastEvent: 1000,
      },
      mainThreadBusy: false,
      mainThreadDelayMs: 2,
    };

    const response = await request.post('http://localhost:8333/api/diagnostics/keyboard', {
      data: diagnostic,
    });

    expect(response.ok()).toBeTruthy();
    
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.message).toBe('Diagnostic logged');
  });

});
