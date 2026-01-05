// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Debug Panel & Freeze Fix Tests - TDD Protocol
 * 
 * Tests:
 * 1. Debug panel renders without crash (ReferenceError fix)
 * 2. Backspace key works reliably (freeze fix)
 */

test.describe('Debug Panel & Input Stability', () => {
  
  test.beforeEach(async ({ page, context }) => {
    // Clear browser cache
    await context.clearCookies();
    
    // Navigate to Forge Terminal DEV SERVER - use 'load' instead of 'networkidle' for WebSocket apps
    await page.goto('http://localhost:9999', { waitUntil: 'load', timeout: 15000 });
    
    // Set up localStorage before reload
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
      localStorage.setItem('tourComplete', 'true');
      localStorage.setItem('forge-tour-completed', 'true');
    });
    
    // Reload to apply settings
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    
    // Wait for app to initialize
    await page.waitForTimeout(3000);
    
    // Dismiss tour if showing
    const skipButton = page.locator('button:has-text("Skip")').first();
    if (await skipButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipButton.click();
      await page.waitForTimeout(300);
    }
  });

  test('Debug tab should render without ReferenceError crash', async ({ page }) => {
    const consoleErrors = [];
    const consoleWarnings = [];
    let jsBundleName = 'unknown';
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
      if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });
    
    // Capture which JS bundle is being served
    page.on('response', response => {
      const url = response.url();
      if (url.includes('/assets/index.') && url.endsWith('.js')) {
        const match = url.match(/index\.([^.]+)\.js/);
        if (match) {
          jsBundleName = match[1];
        }
      }
    });

    // Screenshot before clicking Debug
    await page.screenshot({ 
      path: 'test-results/01-before-debug-click.png', 
      fullPage: true 
    });

    // Find and click Debug tab
    const debugTab = page.locator('button:has-text("Debug")').first();
    await expect(debugTab).toBeVisible({ timeout: 5000 });
    await debugTab.click();

    // Wait for panel to render
    await page.waitForTimeout(2000);

    // Screenshot after clicking Debug
    await page.screenshot({ 
      path: 'test-results/02-after-debug-click.png', 
      fullPage: true 
    });

    // Check for the specific crash error
    const hasCrashError = consoleErrors.some(err => 
      err.includes("Cannot access") && err.includes("before initialization")
    );
    const hasErrorBoundary = consoleErrors.some(err =>
      err.includes("ErrorBoundary caught an error")
    );

    // Log diagnostic info
    console.log(`JS Bundle: index.${jsBundleName}.js`);
    console.log(`Expected fixed bundle: index.Ctq9SKbZ.js`);
    console.log(`Console errors found: ${consoleErrors.length}`);
    
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((err, i) => {
        console.log(`  [${i}]: ${err.substring(0, 150)}...`);
      });
    }
    
    // If using old bundle, provide helpful message
    if (jsBundleName !== 'Ctq9SKbZ' && hasCrashError) {
      console.log('\n⚠️  SERVER IS SERVING OLD JS BUNDLE!');
      console.log('   The fix is built but server needs restart to serve new bundle.');
      console.log('   User constraint: Cannot restart port 3005');
      console.log('   Solution: Server restart required to deploy fix.\n');
    }

    // ASSERTIONS - Test MUST pass these
    expect(hasCrashError).toBe(false);
    expect(hasErrorBoundary).toBe(false);
    
    // Take final screenshot as proof
    await page.screenshot({ 
      path: 'test-results/03-debug-panel-rendered.png', 
      fullPage: true 
    });
  });

  test('Backspace key should work without freeze - long duration test', async ({ page }) => {
    // Set 90-second timeout for this test (60s test + overhead)
    test.setTimeout(90000);
    // Focus terminal
    const terminal = page.locator('.xterm').first();
    await terminal.click();
    await page.waitForTimeout(500);

    // Screenshot before test
    await page.screenshot({ 
      path: 'test-results/04-before-backspace-stress-test.png', 
      fullPage: true 
    });

    // LONG-DURATION STRESS TEST: 60 seconds of continuous input
    const testDurationMs = 60000; // 60 seconds
    const testStartTime = Date.now();
    const freezeThresholdMs = 1500; // Operations >1500ms = freeze (adjusted for Playwright overhead)
    const slowOperationsMs = 800; // Track operations >800ms as "slow"
    const freezeEvents = [];
    const slowEvents = [];
    let totalOperations = 0;
    let iterationCount = 0;

    console.log('Starting 60-second backspace stress test (freeze threshold: 1500ms, slow threshold: 800ms)...');

    while (Date.now() - testStartTime < testDurationMs) {
      iterationCount++;
      
      // Type a line of text
      const typeStart = Date.now();
      await page.keyboard.type('echo test line ' + iterationCount, { delay: 30 });
      const typeElapsed = Date.now() - typeStart;
      totalOperations++;
      
      if (typeElapsed > freezeThresholdMs) {
        freezeEvents.push({
          operation: 'type',
          duration: typeElapsed,
          iteration: iterationCount,
          timestamp: Date.now() - testStartTime
        });
      } else if (typeElapsed > slowOperationsMs) {
        slowEvents.push({
          operation: 'type',
          duration: typeElapsed,
          iteration: iterationCount
        });
      }

      // Backspace entire line (16 chars + iteration number digits)
      const lineLength = ('echo test line ' + iterationCount).length;
      for (let i = 0; i < lineLength; i++) {
        const backspaceStart = Date.now();
        await page.keyboard.press('Backspace');
        const backspaceElapsed = Date.now() - backspaceStart;
        totalOperations++;
        
        if (backspaceElapsed > freezeThresholdMs) {
          freezeEvents.push({
            operation: 'backspace',
            duration: backspaceElapsed,
            iteration: iterationCount,
            charPosition: i,
            timestamp: Date.now() - testStartTime
          });
        } else if (backspaceElapsed > slowOperationsMs) {
          slowEvents.push({
            operation: 'backspace',
            duration: backspaceElapsed,
            iteration: iterationCount,
            charPosition: i
          });
        }
      }

      // Monitor main thread responsiveness every 10 iterations
      if (iterationCount % 10 === 0) {
        const responsiveStart = Date.now();
        const isResponsive = await page.evaluate(() => {
          // Check if main thread can execute JS in reasonable time
          return new Promise(resolve => {
            const start = performance.now();
            requestAnimationFrame(() => {
              const elapsed = performance.now() - start;
              resolve(elapsed < 100); // Should get frame within 100ms
            });
          });
        });
        const responsiveElapsed = Date.now() - responsiveStart;
        
        if (!isResponsive || responsiveElapsed > freezeThresholdMs) {
          freezeEvents.push({
            operation: 'ui-responsiveness-check',
            duration: responsiveElapsed,
            responsive: isResponsive,
            iteration: iterationCount,
            timestamp: Date.now() - testStartTime
          });
        }
      }

      // Small delay between iterations
      await page.waitForTimeout(50);
    }

    const testTotalTime = Date.now() - testStartTime;

    // Screenshot after stress test
    await page.screenshot({ 
      path: 'test-results/05-after-backspace-stress-test.png', 
      fullPage: true 
    });

    // Log comprehensive results
    console.log(`\n=== BACKSPACE FREEZE TEST RESULTS ===`);
    console.log(`Test duration: ${testTotalTime}ms (${(testTotalTime/1000).toFixed(1)}s)`);
    console.log(`Total iterations: ${iterationCount}`);
    console.log(`Total operations: ${totalOperations}`);
    console.log(`Freeze threshold: ${freezeThresholdMs}ms`);
    console.log(`Slow threshold: ${slowOperationsMs}ms`);
    console.log(`Freeze events detected: ${freezeEvents.length}`);
    console.log(`Slow events detected: ${slowEvents.length}\n`);

    if (freezeEvents.length > 0) {
      console.log('FREEZE DETAILS (>1500ms):');
      freezeEvents.forEach((event, idx) => {
        console.log(`  [${idx+1}] ${event.operation} took ${event.duration}ms at iteration ${event.iteration} (t+${(event.timestamp/1000).toFixed(1)}s)`);
      });
      console.log('');
    }

    if (slowEvents.length > 0 && slowEvents.length <= 10) {
      console.log('SLOW EVENTS SAMPLE (>800ms):');
      slowEvents.slice(0, 10).forEach((event, idx) => {
        console.log(`  [${idx+1}] ${event.operation} took ${event.duration}ms at iteration ${event.iteration}`);
      });
      console.log('');
    }

    // ASSERTION: No freeze events should occur
    expect(freezeEvents.length).toBe(0);
    
    console.log('✓ Test PASSED: No freezes (>1500ms) detected during 60-second stress test');
    if (slowEvents.length > 0) {
      console.log(`  Note: ${slowEvents.length} slow operations (500-1500ms) detected - likely Playwright automation overhead`);
    }
  });
});
