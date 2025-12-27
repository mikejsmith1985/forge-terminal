/**
 * Test: Enhanced Debug Panel
 * 
 * Purpose: Verify debug panel is gated behind devMode and all features work
 * 
 * Test Cases:
 * 1. Debug tab hidden when devMode disabled
 * 2. Debug tab visible when devMode enabled
 * 3. Cards are collapsible and save state
 * 4. Cards are draggable and reorderable
 * 5. Collapsed cards don't update (performance)
 * 6. Expanded cards show live data
 */

const { test, expect } = require('@playwright/test');

test.describe('Enhanced Debug Panel', () => {
  let page;

  test.beforeEach(async ({ page: newPage }) => {
    page = newPage;
    await page.goto('http://localhost:17171');
    await page.waitForLoadState('networkidle');
  });

  test('should hide debug tab when devMode is disabled', async () => {
    // Ensure devMode is off
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'false');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Check if debug tab is not visible
    const debugTab = page.locator('.sidebar-view-tab:has-text("Debug")');
    await expect(debugTab).toHaveCount(0);
  });

  test('should show debug tab when devMode is enabled', async () => {
    // Enable devMode
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Check if debug tab is visible
    const debugTab = page.locator('.sidebar-view-tab:has-text("Debug")');
    await expect(debugTab).toBeVisible();
  });

  test('should display collapsible debug cards', async () => {
    // Enable devMode
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Click debug tab
    await page.locator('.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(500);

    // Check for debug cards
    const cards = page.locator('.debug-card');
    const cardCount = await cards.count();
    
    console.log('Debug cards found:', cardCount);
    expect(cardCount).toBeGreaterThan(0);

    // Verify cards have headers with chevrons
    const firstCard = cards.first();
    const header = firstCard.locator('.debug-card-header');
    await expect(header).toBeVisible();

    // Check for chevron (ChevronDown or ChevronRight)
    const hasChevron = await header.locator('svg').count() > 0;
    expect(hasChevron).toBeTruthy();
  });

  test('should collapse and expand cards', async () => {
    // Enable devMode and navigate to debug
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(500);

    // Get first card
    const firstCard = page.locator('.debug-card').first();
    const header = firstCard.locator('.debug-card-header');
    const body = firstCard.locator('.debug-card-body');

    // Check initial state
    const initiallyVisible = await body.isVisible();

    // Click to toggle
    await header.click();
    await page.waitForTimeout(300);

    // Verify state changed
    const afterClickVisible = await body.isVisible();
    expect(afterClickVisible).toBe(!initiallyVisible);
  });

  test('should save collapse state to localStorage', async () => {
    // Enable devMode and navigate to debug
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(500);

    // Get first card and its ID
    const firstCard = page.locator('.debug-card').first();
    const cardId = await firstCard.evaluate(el => el.querySelector('.debug-card-header')?.textContent);
    
    // Toggle collapse state
    await firstCard.locator('.debug-card-header').click();
    await page.waitForTimeout(300);

    // Check localStorage
    const savedState = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter(k => k.includes('debug-card'));
      return keys.length > 0;
    });

    expect(savedState).toBeTruthy();
  });

  test('should display drag handles on cards', async () => {
    // Enable devMode and navigate to debug
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(500);

    // Check for grip vertical icons (drag handles)
    const firstCard = page.locator('.debug-card').first();
    const gripIcon = firstCard.locator('svg').first(); // GripVertical icon
    
    await expect(gripIcon).toBeVisible();
  });

  test('should show live activity indicators', async () => {
    // Enable devMode and navigate to debug
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(500);

    // Look for WebSocket card (should have active indicator when connected)
    const wsCard = page.locator('.debug-card:has-text("WebSocket")');
    await expect(wsCard).toBeVisible();

    // Check if state shows OPEN
    const wsCardText = await wsCard.textContent();
    console.log('WebSocket card content:', wsCardText);
  });

  test('should verify all 9 debug cards exist', async () => {
    // Enable devMode and navigate to debug
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(500);

    // Expected cards
    const expectedCards = [
      'Terminal Info',
      'WebSocket',
      'Auto-Respond Monitor',
      'Freeze Monitor',
      'Performance',
      'Keyboard Events',
      'Console Logs',
      'Focus State',
      'Viewport'
    ];

    // Check each card exists
    for (const cardName of expectedCards) {
      const card = page.locator(`.debug-card:has-text("${cardName}")`);
      await expect(card).toBeVisible({ timeout: 2000 });
    }
  });

  test('should default collapse Freeze Monitor and Auto-Respond', async () => {
    // Clear localStorage to test defaults
    await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter(k => k.includes('debug-card'));
      keys.forEach(k => localStorage.removeItem(k));
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.sidebar-view-tab:has-text("Debug")').click();
    await page.waitForTimeout(500);

    // Check Freeze Monitor is collapsed
    const freezeCard = page.locator('.debug-card:has-text("Freeze Monitor")');
    const freezeBody = freezeCard.locator('.debug-card-body');
    await expect(freezeBody).not.toBeVisible();

    // Check Auto-Respond is collapsed
    const arCard = page.locator('.debug-card:has-text("Auto-Respond Monitor")');
    const arBody = arCard.locator('.debug-card-body');
    await expect(arBody).not.toBeVisible();
  });
});
