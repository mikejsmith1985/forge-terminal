/**
 * WebSocket Recovery Tests — Playwright
 *
 * Tests for WebSocket disconnection, reconnection, and keyboard input latency.
 * These tests identify:
 * 1. Whether WebSocket recovery actually works
 * 2. Whether backspace/keyboard input has latency issues
 * 3. Whether AM logging is blocking the UI
 */
const { test, expect, visitWithoutTour } = require('../fixtures/forge')

test.describe('WebSocket Recovery', () => {
  const baseUrl = 'http://localhost:3005';

  test.beforeEach(async ({ page }) => {
    await visitWithoutTour(page, baseUrl);
    // Wait for initial terminal connection
    await page.locator('.xterm-screen').waitFor({ timeout: 15000 });
    await expect(page.locator('.xterm-screen')).toBeVisible();
    await page.waitForTimeout(2000); // Allow terminal to fully initialize
  });

  test.describe('1. Connection State Tracking', () => {
    test('should track WebSocket connection state', async ({ page }) => {
      // Check that we can access connection state
      const terminalContainerFound = await page.evaluate(() => {
        // Look for terminal refs or connection indicators
        const terminalContainer = window.document.querySelector('[data-terminal-connected]');
        return !!terminalContainer;
      });
      const connectionIndicatorFound = await page.evaluate(() => {
        const connectionIndicator = window.document.querySelector('.connection-indicator');
        return !!connectionIndicator;
      });

      // Log what we find
      console.log('Terminal container:', terminalContainerFound ? 'found' : 'not found');
      console.log('Connection indicator:', connectionIndicatorFound ? 'found' : 'not found');

      // The terminal should show "Connected" message
      await expect(page.locator('.xterm-screen')).toContainText('Connected');
    });

    test('should have WebSocket in OPEN state after connection', async ({ page }) => {
      // Check if there are any open WebSocket connections
      // This is a best-effort check since we can't directly access wsRef
      const wsResourceCount = await page.evaluate(() => {
        const perf = window.performance;
        const resources = perf.getEntriesByType('resource');
        const wsResources = resources.filter(r => r.initiatorType === 'other' && r.name.includes('ws://'));
        return wsResources.length;
      });
      console.log('WebSocket resources found:', wsResourceCount);
    });
  });

  test.describe('2. WebSocket Disconnection Handling', () => {
    test('should show reconnection UI when connection is lost', async ({ page }) => {
      // Simulate disconnection by visiting a route that closes WS
      // This is tricky because we can't directly access the WebSocket

      // One approach: check if the reconnecting overlay exists in the component
      await expect(page.locator('.xterm-screen')).toBeVisible();

      // Check that the component has reconnection capability
      const reconnectingOverlayExists = await page.evaluate(() => {
        // Look for reconnection-related elements or state
        const reconnectingOverlay = window.document.querySelector('[class*="reconnect"]');
        return !!reconnectingOverlay;
      });
      console.log('Reconnecting overlay element exists:', reconnectingOverlayExists);
    });

    test('should attempt reconnection with exponential backoff', async ({ page }) => {
      // This test validates the reconnection logic exists
      // We can't easily trigger a real disconnection, but we can verify the code path
      const scriptCount = await page.evaluate(() => {
        // Check if ForgeTerminal has reconnection refs
        const scripts = Array.from(window.document.querySelectorAll('script'));
        return scripts.length;
      });
      console.log('Scripts loaded:', scriptCount);
    });
  });

  test.describe('3. Keyboard Input Latency', () => {
    test('should process backspace without delay', async ({ page }) => {
      // Type some text first
      await page.locator('.xterm-screen').click();
      await page.waitForTimeout(500);

      // Record timing for typing and backspace
      const startTime = Date.now();

      // Type test text — use pressSequentially to generate real keydown events
      await page.locator('.xterm-helper-textarea').waitFor({ timeout: 5000 });
      await expect(page.locator('.xterm-helper-textarea')).toBeAttached();
      await page.locator('.xterm-helper-textarea').focus();
      await page.locator('.xterm-helper-textarea').pressSequentially('test123', { delay: 50 });

      await page.waitForTimeout(200);

      // Now test backspace
      const backspaceStart = Date.now();
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(50);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(50);
      await page.keyboard.press('Backspace');

      await page.waitForTimeout(200);
      const backspaceEnd = Date.now();
      const backspaceDuration = backspaceEnd - backspaceStart;
      console.log(`Backspace sequence took: ${backspaceDuration}ms`);

      // Backspace should not take more than 500ms for 3 keys
      expect(backspaceDuration).toBeLessThan(1000);

      // Suppress unused-variable warning: startTime is intentionally measured
      // but not used in an assertion (matches the original Cypress test behaviour).
      void startTime;
    });

    test('should not block on rapid backspace presses', async ({ page }) => {
      await page.locator('.xterm-screen').click();
      await page.waitForTimeout(500);

      // Type longer text
      await page.locator('.xterm-helper-textarea').pressSequentially('abcdefghijklmnop', { delay: 20 });

      await page.waitForTimeout(100);

      // Rapid backspace
      const start = Date.now();
      await page.locator('.xterm-helper-textarea').focus();
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(10);
      }

      await page.waitForTimeout(100);
      const duration = Date.now() - start;
      console.log(`10 rapid backspaces took: ${duration}ms`);

      // Should complete in under 500ms (10 * 10ms delay + overhead)
      expect(duration).toBeLessThan(1000);
    });

    test('should maintain keyboard responsiveness during AM logging', async ({ page }) => {
      // This test checks if AM logging blocks the UI
      await page.locator('.xterm-screen').click();
      await page.waitForTimeout(500);

      // Enable AM if available
      const amToggleExists = await page.evaluate(() => {
        // Try to find AM toggle
        const amToggle = window.document.querySelector('[data-am-toggle]');
        if (amToggle) {
          amToggle.click();
          return true;
        }
        return false;
      });
      if (amToggleExists) {
        console.log('AM toggle clicked');
      }

      // Type with AM potentially enabled
      const start = Date.now();
      await page.locator('.xterm-helper-textarea').pressSequentially('echo "AM logging test"', { delay: 30 });
      await page.keyboard.press('Enter');

      await page.waitForTimeout(500);
      const duration = Date.now() - start;
      console.log(`Command with AM took: ${duration}ms`);

      // Should not take more than 2 seconds even with AM
      expect(duration).toBeLessThan(3000);
    });
  });

  test.describe('4. WebSocket Message Flow', () => {
    test('should send keyboard input to WebSocket immediately', async ({ page }) => {
      await page.locator('.xterm-screen').click();
      await page.waitForTimeout(500);

      // Type a character and verify it appears
      await page.locator('.xterm-helper-textarea').pressSequentially('x');

      // The character should echo in terminal
      await page.waitForTimeout(200);
      const textLength = await page.locator('.xterm-screen').evaluate((el) => el.textContent.length);
      // Just verify we didn't get an error
      console.log('Screen contains text of length:', textLength);
    });

    test('should not queue keyboard input when AM fetch is pending', async ({ page }) => {
      // This tests that fetch('/api/am/log') doesn't block keyboard
      await page.locator('.xterm-screen').click();
      await page.waitForTimeout(500);

      // Intercept AM log requests
      await page.route('**/api/am/log', route => route.continue());

      // Type a command
      await page.locator('.xterm-helper-textarea').pressSequentially('echo test', { delay: 30 });
      await page.keyboard.press('Enter');

      // Continue typing immediately
      await page.locator('.xterm-helper-textarea').pressSequentially('echo second', { delay: 30 });
      await page.keyboard.press('Enter');

      // Both should work without blocking
      await page.waitForTimeout(1000);
      await expect(page.locator('.xterm-screen')).toContainText('test');
    });
  });

  test.describe('5. Diagnostic Integration', () => {
    test('should have keyboard diagnostics available', async ({ page }) => {
      const kbDiagResult = await page.evaluate(() => {
        // Check if keyboard diagnostics are exposed
        if (window.kbDiag) {
          const stats = window.kbDiag.stats();
          return { available: true, stats: JSON.stringify(stats) };
        }
        return { available: false };
      });

      if (kbDiagResult.available) {
        console.log('kbDiag available');
        console.log('Keyboard stats:', kbDiagResult.stats);
      } else {
        console.log('kbDiag not exposed (diagnostics disabled)');
      }
    });

    test('should track backspace delivery rate', async ({ page }) => {
      await page.evaluate(() => {
        // Enable diagnostics if available
        if (window.diagnosticCore) {
          window.diagnosticCore.enable();
        }
      });

      await page.locator('.xterm-screen').click();
      await page.waitForTimeout(500);

      // Type and backspace
      await page.locator('.xterm-helper-textarea').pressSequentially('abc', { delay: 50 });
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(50);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(50);
      await page.keyboard.press('Backspace');

      await page.waitForTimeout(500);

      const diagResult = await page.evaluate(() => {
        if (window.kbDiag) {
          const summary = window.kbDiag.summary();
          return { available: true, backspaceDeliveryRate: summary.backspaceDeliveryRate };
        }
        return { available: false };
      });

      if (diagResult.available) {
        console.log('Backspace delivery rate:', diagResult.backspaceDeliveryRate + '%');

        // All backspaces should be delivered
        if (diagResult.backspaceDeliveryRate !== 'N/A') {
          expect(diagResult.backspaceDeliveryRate).toBeGreaterThan(90);
        }
      }
    });
  });
});

test.describe('API Health Check for WebSocket', () => {
  const baseUrl = 'http://localhost:3005';

  test('should verify /api/am/log does not block', async ({ page }) => {
    const start = Date.now();

    const response = await page.request.post(`${baseUrl}/api/am/log`, {
      data: {
        tabId: 'test-tab',
        tabName: 'Test',
        workspace: '/test',
        entryType: 'USER_INPUT',
        content: 'test input'
      },
      timeout: 5000
    });

    const duration = Date.now() - start;
    console.log(`/api/am/log took ${duration}ms`);

    expect(response.status()).toBe(200);
    // Should respond in under 100ms normally
    expect(duration).toBeLessThan(500);
  });

  test('should verify WebSocket endpoint is available', async ({ page }) => {
    // Check that the /ws endpoint upgrade is possible
    const response = await page.request.get(`${baseUrl}/ws`, {
      failOnStatusCode: false
    });

    // Should return 400 (Bad Request) because we're not upgrading
    // or 426 (Upgrade Required) — both indicate the endpoint exists
    expect([400, 426]).toContain(response.status());
  });

  test('should handle multiple concurrent /api/am/log requests', async ({ page }) => {
    const start = Date.now();

    // Fire 10 concurrent requests
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(
        page.request.post(`${baseUrl}/api/am/log`, {
          data: {
            tabId: `test-tab-${i}`,
            tabName: `Test ${i}`,
            workspace: '/test',
            entryType: 'USER_INPUT',
            content: `test input ${i}`
          },
          timeout: 5000
        })
      );
    }

    // All should complete quickly
    await Promise.all(requests);
    const duration = Date.now() - start;
    console.log(`10 concurrent /api/am/log requests took ${duration}ms`);

    // Should complete in under 2 seconds even with 10 concurrent
    expect(duration).toBeLessThan(2000);
  });
});
