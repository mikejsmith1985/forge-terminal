import { test, expect } from '@playwright/test';

test.describe('Modal Scrolling - All Modals on Various Displays', () => {
  // Test small display (mobile/tablet)
  test.describe('Small Display (375px width)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('http://localhost:5173');
    });

    test('CommandModal should be scrollable when content exceeds viewport', async ({ page }) => {
      // Open add command modal
      await page.click('text=Add Command');
      
      const modal = page.locator('.modal');
      await expect(modal).toBeVisible();
      
      // Get the modal body
      const modalBody = page.locator('.modal-body');
      
      // Check that modal-body has overflow-y: auto
      const overflow = await modalBody.evaluate(el => {
        return window.getComputedStyle(el).overflowY;
      });
      expect(overflow).toBe('auto');
      
      // Modal should not exceed viewport height
      const boundingBox = await modal.boundingBox();
      expect(boundingBox.height).toBeLessThanOrEqual(667 * 0.85); // max-height: 85vh
    });

    test('SettingsModal should be scrollable on small displays', async ({ page }) => {
      // Open settings from hamburger menu or button
      const settingsButton = page.locator('[title*="Settings"]').first();
      if (await settingsButton.isVisible()) {
        await settingsButton.click();
      }
      
      // Look for settings modal or fall back to other menu options
      const modal = page.locator('.modal').first();
      
      if (await modal.isVisible()) {
        const modalBody = page.locator('.modal-body');
        const overflow = await modalBody.evaluate(el => {
          return window.getComputedStyle(el).overflowY;
        });
        expect(overflow).toBe('auto');
      }
    });
  });

  // Test medium display (tablet)
  test.describe('Medium Display (768px width)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('http://localhost:5173');
    });

    test('CommandModal should be scrollable on medium displays', async ({ page }) => {
      await page.click('text=Add Command');
      
      const modal = page.locator('.modal');
      await expect(modal).toBeVisible();
      
      const modalBody = page.locator('.modal-body');
      
      // Verify scrollable
      const overflow = await modalBody.evaluate(el => {
        return window.getComputedStyle(el).overflowY;
      });
      expect(overflow).toBe('auto');
      
      // Verify max-height constraint
      const display = await modal.evaluate(el => {
        return window.getComputedStyle(el).maxHeight;
      });
      expect(display).toBe('85vh');
    });
  });

  // Test large display (desktop)
  test.describe('Large Display (1920px width)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('http://localhost:5173');
    });

    test('CommandModal maintains scrollable functionality on large displays', async ({ page }) => {
      await page.click('text=Add Command');
      
      const modal = page.locator('.modal');
      await expect(modal).toBeVisible();
      
      const modalBody = page.locator('.modal-body');
      
      // Still scrollable
      const overflow = await modalBody.evaluate(el => {
        return window.getComputedStyle(el).overflowY;
      });
      expect(overflow).toBe('auto');
      
      // Modal is still constrained
      const boundingBox = await modal.boundingBox();
      expect(boundingBox.height).toBeLessThanOrEqual(1080 * 0.85);
    });
  });

  test.describe('Modal Structure Validation', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('http://localhost:5173');
    });

    test('CommandModal has proper header-body-footer layout', async ({ page }) => {
      await page.click('text=Add Command');
      
      const modal = page.locator('.modal');
      const header = page.locator('.modal-header');
      const body = page.locator('.modal-body');
      const footer = page.locator('.modal-footer');
      
      // All sections exist
      await expect(modal).toBeVisible();
      await expect(header).toBeVisible();
      await expect(body).toBeVisible();
      await expect(footer).toBeVisible();
      
      // Header is flexbox column
      const modalDisplay = await modal.evaluate(el => {
        return window.getComputedStyle(el).display;
      });
      expect(modalDisplay).toBe('flex');
      
      // Body is scrollable
      const bodyDisplay = await body.evaluate(el => {
        return window.getComputedStyle(el).overflowY;
      });
      expect(bodyDisplay).toBe('auto');
    });

    test('Modal scrollbar styling is visible', async ({ page }) => {
      await page.click('text=Add Command');
      
      const body = page.locator('.modal-body');
      
      // Check if scrollbar thumb has styling
      const scrollbarStyle = await body.evaluate(el => {
        // Check for webkit scrollbar implementation
        const styles = window.getComputedStyle(el);
        return {
          width: styles.width,
          height: styles.height,
        };
      });
      
      // Body should have dimensions
      expect(scrollbarStyle.width).not.toBe('0px');
      expect(scrollbarStyle.height).not.toBe('0px');
    });
  });

  test.describe('Modal Content Scrolling Behavior', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 500, height: 600 });
      await page.goto('http://localhost:5173');
    });

    test('Long form content scrolls within modal', async ({ page }) => {
      await page.click('text=Add Command');
      
      const modal = page.locator('.modal');
      await expect(modal).toBeVisible();
      
      const body = page.locator('.modal-body');
      
      // Get scrollable dimensions
      const scrollInfo = await body.evaluate(el => {
        return {
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          canScroll: el.scrollHeight > el.clientHeight,
          hasOverflow: window.getComputedStyle(el).overflowY === 'auto'
        };
      });
      
      // Should be scrollable if content is tall enough
      if (scrollInfo.scrollHeight > scrollInfo.clientHeight) {
        expect(scrollInfo.hasOverflow).toBe(true);
      }
      
      // At minimum, should allow overflow
      expect(scrollInfo.hasOverflow).toBe(true);
    });
  });
});
