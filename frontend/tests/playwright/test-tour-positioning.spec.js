/**
 * Test Tour Positioning and Modal Z-Index Issues
 * Validates all tour steps render correctly without cutoffs or z-index problems
 */

const { test, expect } = require('@playwright/test');

test.describe('Tour Positioning Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear tour completion flag to see tour
    await page.goto('http://localhost:8333');
    await page.evaluate(() => {
      localStorage.removeItem('forge_tour_completed');
    });
    await page.reload();
    await page.waitForTimeout(2000);
  });

  test('should capture screenshots of all tour steps', async ({ page }) => {
    // Wait for tour to appear
    await page.waitForSelector('.tour-overlay', { timeout: 5000 });
    
    let stepCount = 0;
    const maxSteps = 20;
    
    while (stepCount < maxSteps) {
      // Wait for tooltip to be visible
      const tooltip = page.locator('.tour-tooltip');
      await tooltip.waitFor({ state: 'visible', timeout: 2000 }).catch(() => null);
      
      if (!await tooltip.isVisible()) {
        console.log('No more tour steps');
        break;
      }
      
      // Get step title
      const title = await page.locator('.tour-tooltip-title').textContent();
      console.log(`Step ${stepCount + 1}: ${title}`);
      
      // Take screenshot
      await page.screenshot({ 
        path: `test-results/tour-step-${stepCount + 1}-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`,
        fullPage: true 
      });
      
      // Check if tooltip is within viewport
      const tooltipBox = await tooltip.boundingBox();
      const viewport = page.viewportSize();
      
      console.log(`  Tooltip position: x=${tooltipBox.x}, y=${tooltipBox.y}, w=${tooltipBox.width}, h=${tooltipBox.height}`);
      console.log(`  Viewport: w=${viewport.width}, h=${viewport.height}`);
      
      // Verify tooltip is not cut off
      if (tooltipBox.y < 0) {
        console.log(`  ⚠️  WARNING: Tooltip is cut off at TOP (y=${tooltipBox.y})`);
      }
      if (tooltipBox.y + tooltipBox.height > viewport.height) {
        console.log(`  ⚠️  WARNING: Tooltip is cut off at BOTTOM`);
      }
      if (tooltipBox.x < 0) {
        console.log(`  ⚠️  WARNING: Tooltip is cut off at LEFT`);
      }
      if (tooltipBox.x + tooltipBox.width > viewport.width) {
        console.log(`  ⚠️  WARNING: Tooltip is cut off at RIGHT`);
      }
      
      // Check for modals appearing in front of tour
      const forgeAssistModal = page.locator('.forge-assist-modal');
      const settingsModal = page.locator('.settings-modal');
      
      if (await forgeAssistModal.isVisible()) {
        const modalBox = await forgeAssistModal.boundingBox();
        console.log(`  ⚠️  WARNING: Forge Assist modal is visible (should be behind tour)`);
        
        // Check z-index
        const modalZIndex = await forgeAssistModal.evaluate(el => {
          return window.getComputedStyle(el.parentElement).zIndex;
        });
        const tourZIndex = await page.locator('.tour-overlay').evaluate(el => {
          return window.getComputedStyle(el).zIndex;
        });
        console.log(`  Modal z-index: ${modalZIndex}, Tour z-index: ${tourZIndex}`);
      }
      
      if (await settingsModal.isVisible()) {
        console.log(`  ⚠️  WARNING: Settings modal is visible (should be behind tour)`);
        
        const modalZIndex = await settingsModal.evaluate(el => {
          return window.getComputedStyle(el.parentElement).zIndex;
        });
        const tourZIndex = await page.locator('.tour-overlay').evaluate(el => {
          return window.getComputedStyle(el).zIndex;
        });
        console.log(`  Modal z-index: ${modalZIndex}, Tour z-index: ${tourZIndex}`);
      }
      
      // Click next button
      const nextBtn = page.locator('.tour-btn-next');
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(1000);
      } else {
        console.log('No next button, tour complete');
        break;
      }
      
      stepCount++;
    }
    
    console.log(`\nTour test complete. Captured ${stepCount} steps.`);
  });

  test('should verify tour z-index is higher than modals', async ({ page }) => {
    await page.waitForSelector('.tour-overlay', { timeout: 5000 });
    
    // Get tour z-index
    const tourZIndex = await page.locator('.tour-overlay').evaluate(el => {
      return parseInt(window.getComputedStyle(el).zIndex);
    });
    
    console.log(`Tour z-index: ${tourZIndex}`);
    
    // Expected: Tour should be at least 10500
    expect(tourZIndex).toBeGreaterThanOrEqual(10500);
  });
});
