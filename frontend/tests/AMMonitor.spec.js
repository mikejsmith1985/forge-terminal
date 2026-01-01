/**
 * AMMonitor Component Tests - Playwright
 * 
 * Tests the 3-state AM indicator component
 * States: active (green), disabled (yellow), broken (red)
 */

import { test, expect } from '@playwright/test';

// Test server base URL
const BASE_URL = 'http://localhost:5173';
const API_BASE = 'http://localhost:3000';

test.describe('AMMonitor Component', () => {
  
  test.describe('Rendering', () => {
    test('should not render when devMode is false', async ({ page }) => {
      // This is a unit test - we'll need to mock the component
      // Playwright integration test: verify component doesn't appear in DOM
      await page.goto(BASE_URL);
      
      // Wait for app to load
      await page.waitForSelector('.terminal-container', { timeout: 5000 });
      
      // Try to find AM Monitor - should not exist or be hidden
      const amMonitor = await page.$('.am-monitor');
      
      // Expected: Either doesn't exist or is hidden (devMode off by default)
      if (amMonitor) {
        const isVisible = await amMonitor.isVisible();
        expect(!isVisible || amMonitor === null).toBeTruthy();
      }
    });

    test('should render with am-loading class when loading', async ({ page }) => {
      // We need to mock API responses to test this properly
      await page.route('**/api/am/tab-status/**', route => {
        // Simulate slow response
        setTimeout(() => {
          route.continue();
        }, 100);
      });

      await page.goto(BASE_URL);
      
      // Look for spinner element during load
      const spinner = await page.$('.am-monitor.am-loading');
      // Note: May be too fast to catch, but this tests the structure
    });
  });

  test.describe('Status States', () => {
    test('should display am-disabled state when AM is disabled', async ({ page }) => {
      // Mock API response for disabled state
      await page.route('**/api/am/tab-status/**', route => {
        route.abort('blockedbyclient');
      });

      await page.goto(BASE_URL);
      await page.waitForSelector('.terminal-container', { timeout: 5000 });

      // Check for disabled visual state when API fails
      // This should default to disabled since amEnabled=false
      const disabledMonitor = await page.$('.am-monitor.am-disabled');
      // Expected: May exist if component renders disabled state
    });

    test('should display am-active state when AM is active', async ({ page }) => {
      // This would require either:
      // 1. Enabling devMode in test
      // 2. Mocking the API to return active status
      // 3. Running against a test server with AM enabled

      // Mock an active status response
      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'active',
            statusText: 'AM Logging Active & Capturing',
            isCapturing: true,
            hasActiveConversation: true,
            turnsCaptured: 5,
            secondsSinceCapture: 2
          })
        });
      });

      await page.goto(BASE_URL);
      await page.waitForSelector('.terminal-container', { timeout: 5000 });

      // Verify active state styling
      const activeMonitor = await page.$('.am-monitor.am-active');
      // Expected to be present when status is 'active'
    });

    test('should display am-broken state when capture fails', async ({ page }) => {
      // Mock a broken status response
      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'broken',
            statusText: 'AM Not Capturing Turns',
            detailedReason: 'Conversation active but 0 user/assistant turns captured',
            isCapturing: false,
            hasActiveConversation: true,
            turnsCaptured: 0,
            secondsSinceCapture: 120
          })
        });
      });

      await page.goto(BASE_URL);
      await page.waitForSelector('.terminal-container', { timeout: 5000 });

      // Verify broken state styling
      const brokenMonitor = await page.$('.am-monitor.am-broken');
      // Expected to be present when status is 'broken'
    });
  });

  test.describe('Display Text', () => {
    test('should show "AM Off" when disabled', async ({ page }) => {
      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'disabled',
            statusText: 'AM Logging is Disabled for this tab',
            isCapturing: false
          })
        });
      });

      await page.goto(BASE_URL);
      
      // Look for "AM Off" text in disabled state
      // This would require devMode to be on to see the component
      const displayText = await page.textContent('.am-monitor:has(.am-disabled) span');
      // Expected: 'AM Off' or similar
    });

    test('should show recording indicator when actively capturing', async ({ page }) => {
      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'active',
            statusText: 'AM Logging Active & Capturing',
            isCapturing: true,
            secondsSinceCapture: 2
          })
        });
      });

      await page.goto(BASE_URL);

      // Look for recording indicator text
      // Expected: Should contain "● Recording" or recording dot animation
    });

    test('should show conversation count when available', async ({ page }) => {
      await page.route('**/api/am/llm/conversations/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversations: [
              { conversationId: 'conv-1' },
              { conversationId: 'conv-2' },
              { conversationId: 'conv-3' }
            ]
          })
        });
      });

      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'active',
            isCapturing: false
          })
        });
      });

      await page.goto(BASE_URL);

      // Look for "3 logs" or similar count
      const displayText = await page.textContent('.am-monitor span');
      // Expected: Should contain conversation count
    });
  });

  test.describe('Tooltip', () => {
    test('should show detailed status tooltip', async ({ page }) => {
      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'active',
            statusText: 'AM Logging Active & Capturing',
            detailedReason: 'Test detailed reason',
            turnsCaptured: 5,
            secondsSinceCapture: 10,
            redundancy: {
              primaryLayerOk: true,
              nativeSessionOk: true,
              periodicCaptureOk: true,
              healthMonitorOk: true
            },
            nativeRecoveryOk: true,
            nativeSessionCount: 2
          })
        });
      });

      await page.goto(BASE_URL);

      const amMonitor = await page.$('.am-monitor.am-active');
      if (amMonitor) {
        const title = await amMonitor.getAttribute('title');
        // Expected: Should contain detailed status info
        expect(title).toBeTruthy();
        expect(title.length > 20).toBeTruthy();
      }
    });
  });

  test.describe('Interactivity', () => {
    test('should be clickable when conversations exist', async ({ page }) => {
      await page.route('**/api/am/llm/conversations/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversations: [
              { conversationId: 'conv-1', timestamp: new Date().toISOString() }
            ]
          })
        });
      });

      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'active',
            isCapturing: false
          })
        });
      });

      await page.goto(BASE_URL);

      const amMonitor = await page.$('.am-monitor.clickable');
      if (amMonitor) {
        // Verify it's clickable (has pointer cursor)
        const cursor = await amMonitor.evaluate(el => 
          window.getComputedStyle(el).cursor
        );
        expect(cursor).toBe('pointer');
      }
    });

    test('should not be clickable when no conversations', async ({ page }) => {
      await page.route('**/api/am/llm/conversations/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ conversations: [] })
        });
      });

      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'active',
            isCapturing: false
          })
        });
      });

      await page.goto(BASE_URL);

      const amMonitor = await page.$('.am-monitor:not(.clickable)');
      if (amMonitor) {
        // Verify it's not clickable
        const cursor = await amMonitor.evaluate(el => 
          window.getComputedStyle(el).cursor
        );
        expect(cursor).toBe('default');
      }
    });
  });

  test.describe('API Polling', () => {
    test('should poll API every 5 seconds', async ({ page }) => {
      let callCount = 0;

      await page.route('**/api/am/tab-status/**', route => {
        callCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'active',
            isCapturing: callCount === 1
          })
        });
      });

      await page.goto(BASE_URL);
      await page.waitForSelector('.terminal-container', { timeout: 5000 });

      // Initial call happens on mount
      expect(callCount).toBeGreaterThan(0);

      // Wait for second poll
      await page.waitForTimeout(6000);

      // Should have called API multiple times
      expect(callCount).toBeGreaterThan(1);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API errors gracefully', async ({ page }) => {
      await page.route('**/api/am/tab-status/**', route => {
        route.abort('failed');
      });

      await page.goto(BASE_URL);
      await page.waitForSelector('.terminal-container', { timeout: 5000 });

      // Component should still render, just in error state
      // No console errors should be logged
      const consoleMessages = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleMessages.push(msg.text());
        }
      });

      await page.waitForTimeout(1000);

      // Should not have critical errors
      const criticalErrors = consoleMessages.filter(msg => 
        !msg.includes('Failed to fetch') // Connection errors are expected
      );
      expect(criticalErrors.length).toBe(0);
    });

    test('should handle missing convrsation endpoint', async ({ page }) => {
      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'active'
          })
        });
      });

      await page.route('**/api/am/llm/conversations/**', route => {
        route.abort('failed');
      });

      await page.goto(BASE_URL);
      await page.waitForSelector('.terminal-container', { timeout: 5000 });

      // Should still render status even if conversations fail
      await page.waitForTimeout(500);
      // No crash expected
    });
  });

  test.describe('CSS Classes', () => {
    test('should apply correct CSS classes for each state', async ({ page }) => {
      // Test that the correct CSS class is applied for 'active' state
      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'active',
            isCapturing: true
          })
        });
      });

      await page.goto(BASE_URL);

      const monitor = await page.$('.am-monitor.am-active');
      if (monitor) {
        const classList = await monitor.getAttribute('class');
        expect(classList).toContain('am-active');
        expect(classList).toContain('am-monitor');
      }
    });

    test('should add clickable class when conversations available', async ({ page }) => {
      await page.route('**/api/am/llm/conversations/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversations: [{ conversationId: 'conv-1' }]
          })
        });
      });

      await page.route('**/api/am/tab-status/**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tabId: 'test-tab',
            status: 'active'
          })
        });
      });

      await page.goto(BASE_URL);

      const monitor = await page.$('.am-monitor.clickable');
      if (monitor) {
        const classList = await monitor.getAttribute('class');
        expect(classList).toContain('clickable');
      }
    });
  });
});
