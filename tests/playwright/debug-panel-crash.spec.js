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
    
    // Navigate to Forge Terminal - use 'load' instead of 'networkidle' for WebSocket apps
    await page.goto('http://localhost:3005', { waitUntil: 'load', timeout: 15000 });
    
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

  test('Backspace key should work without freeze', async ({ page }) => {
    // Focus terminal
    const terminal = page.locator('.xterm').first();
    await terminal.click();
    await page.waitForTimeout(500);

    // Type some text
    await page.keyboard.type('echo hello world', { delay: 50 });
    await page.waitForTimeout(300);

    // Screenshot before backspace
    await page.screenshot({ 
      path: 'test-results/04-before-backspace.png', 
      fullPage: true 
    });

    // Press backspace multiple times
    const startTime = Date.now();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(50);
    }
    const elapsed = Date.now() - startTime;

    // Screenshot after backspace
    await page.screenshot({ 
      path: 'test-results/05-after-backspace.png', 
      fullPage: true 
    });

    // Check for freeze - should complete in reasonable time
    // 10 backspaces with 50ms delay = 500ms + overhead, should be < 2000ms
    expect(elapsed).toBeLessThan(2000);
    
    console.log(`Backspace test completed in ${elapsed}ms`);
  });
});
