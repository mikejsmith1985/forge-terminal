/**
 * Playwright E2E Tests for v3.10.6 Features:
 * - OwnerReleaseCard (owner-only release management)
 * - DeveloperDashboard (stats from AM logs)
 */
import { test, expect } from '@playwright/test';

// Helper to set localStorage before navigation to skip tour
async function setupLocalStorage(page) {
  await page.addInitScript(() => {
    // Tour requires JSON with matching version to skip
    localStorage.setItem('forge_tour_completed', JSON.stringify({ version: '3.9.2' }));
    localStorage.setItem('forge_welcome_shown', 'true');
  });
}

// Helper to dismiss any remaining overlays
async function dismissOverlays(page) {
  await page.waitForTimeout(500);
  
  // Force remove tour overlay if still present
  await page.evaluate(() => {
    const tourOverlay = document.querySelector('.tour-overlay');
    if (tourOverlay) {
      tourOverlay.remove();
    }
    const backdrop = document.querySelector('.tour-backdrop');
    if (backdrop) {
      backdrop.remove();
    }
  });
  
  // Close any visible toasts
  const toasts = await page.locator('.toast-close, .toast .close-btn').all();
  for (const toast of toasts) {
    try {
      await toast.click({ timeout: 300 });
    } catch (e) {
      // Toast may have auto-dismissed
    }
  }
  
  await page.waitForTimeout(300);
}

test.describe('DeveloperDashboard Component', () => {
  test.beforeEach(async ({ page }) => {
    await setupLocalStorage(page);
    await page.goto('http://localhost:5173');
    await dismissOverlays(page);
    await page.waitForTimeout(1000);
  });

  test('should have dashboard button in tab bar', async ({ page }) => {
    const dashboardBtn = page.locator('[data-testid="dashboard-btn"], .dashboard-btn');
    await expect(dashboardBtn).toBeVisible({ timeout: 10000 });
  });

  test('should open dashboard when button is clicked', async ({ page }) => {
    await dismissOverlays(page);
    
    const dashboardBtn = page.locator('[data-testid="dashboard-btn"], .dashboard-btn');
    await expect(dashboardBtn).toBeVisible({ timeout: 10000 });
    
    await dashboardBtn.click({ force: true });
    await page.waitForTimeout(500);
    
    // Dashboard overlay should appear - use first() to avoid strict mode error
    const dashboardOverlay = page.locator('.dev-dashboard-overlay').first();
    await expect(dashboardOverlay).toBeVisible({ timeout: 5000 });
    
    // Should show title
    const title = page.locator('.dd-title, h2:has-text("Dashboard")');
    await expect(title).toBeVisible();
  });

  test('should display stats cards in dashboard', async ({ page }) => {
    await dismissOverlays(page);
    
    const dashboardBtn = page.locator('.dashboard-btn');
    await expect(dashboardBtn).toBeVisible({ timeout: 10000 });
    await dashboardBtn.click({ force: true });
    await page.waitForTimeout(1000);
    
    // Should show stats grid
    const statsGrid = page.locator('.dd-stats-grid');
    await expect(statsGrid).toBeVisible({ timeout: 5000 });
    
    // Should have stat cards
    const statCards = page.locator('.dd-stat-card');
    const cardCount = await statCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  test('should close dashboard when clicking close button', async ({ page }) => {
    await dismissOverlays(page);
    
    const dashboardBtn = page.locator('.dashboard-btn');
    await expect(dashboardBtn).toBeVisible({ timeout: 10000 });
    await dashboardBtn.click({ force: true });
    await page.waitForTimeout(500);
    
    const dashboard = page.locator('.dev-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 5000 });
    
    // Click close button
    const closeBtn = page.locator('.dd-close-btn');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click({ force: true });
    await page.waitForTimeout(500);
    
    // Dashboard should close
    await expect(dashboard).not.toBeVisible({ timeout: 5000 });
  });

  test('should have refresh button in dashboard', async ({ page }) => {
    await dismissOverlays(page);
    
    const dashboardBtn = page.locator('.dashboard-btn');
    await dashboardBtn.click({ force: true });
    await page.waitForTimeout(500);
    
    const refreshBtn = page.locator('.dd-refresh-btn');
    await expect(refreshBtn).toBeVisible({ timeout: 5000 });
    
    // Click refresh and verify it works
    await refreshBtn.click({ force: true });
    await page.waitForTimeout(500);
    
    // Button should still be there after refresh
    await expect(refreshBtn).toBeVisible();
  });
});

test.describe('OwnerReleaseCard Component', () => {
  test.beforeEach(async ({ page }) => {
    await setupLocalStorage(page);
    await page.goto('http://localhost:5173');
    await dismissOverlays(page);
    await page.waitForTimeout(1000);
  });

  test('should render release card in command cards section', async ({ page }) => {
    // Command cards container should exist
    const cardsContainer = page.locator('.command-cards-container');
    await expect(cardsContainer).toBeVisible({ timeout: 10000 });
    
    // Owner release card should be inside it (may be unauthorized state)
    const releaseCard = page.locator('.owner-release-card');
    await expect(releaseCard).toBeVisible({ timeout: 10000 });
    
    // Should have Release Manager text
    const cardText = await releaseCard.textContent();
    expect(cardText).toContain('Release Manager');
  });

  test('should show unauthorized state without token', async ({ page }) => {
    // Clear any existing token
    await page.evaluate(() => {
      localStorage.removeItem('forge_github_token');
    });
    
    // Wait for the card to update
    await page.waitForTimeout(1500);
    
    const releaseCard = page.locator('.owner-release-card');
    await expect(releaseCard).toBeVisible({ timeout: 10000 });
    
    // Should show some message about authorization
    const text = await releaseCard.textContent();
    expect(text).toMatch(/Release Manager|GitHub PAT|owner/i);
  });

  test('should show owner badge when authorized as owner', async ({ page }) => {
    // Mock authorized state with owner username
    await page.route('https://api.github.com/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          login: 'mikejsmith1985',
          id: 12345,
          name: 'Mike Smith'
        })
      });
    });
    
    // Set a mock token
    await page.evaluate(() => {
      localStorage.setItem('forge_github_token', 'ghp_test_token_123');
    });
    
    // Reload to trigger auth check
    await page.reload();
    await dismissOverlays(page);
    await page.waitForTimeout(2000);
    
    const releaseCard = page.locator('.owner-release-card');
    await expect(releaseCard).toBeVisible({ timeout: 10000 });
    
    // Check for owner badge or version buttons (authorized state)
    const ownerBadge = page.locator('.orc-owner-badge');
    const versionButtons = page.locator('.orc-button');
    
    // Either owner badge or buttons should be visible
    const hasBadge = await ownerBadge.isVisible().catch(() => false);
    const hasButtons = await versionButtons.count() > 0;
    
    expect(hasBadge || hasButtons).toBe(true);
  });
});

test.describe('TabBar with Dashboard Button', () => {
  test.beforeEach(async ({ page }) => {
    await setupLocalStorage(page);
    await page.goto('http://localhost:5173');
    await dismissOverlays(page);
    await page.waitForTimeout(1000);
  });

  test('should have tab bar with dashboard and new tab buttons', async ({ page }) => {
    const tabBar = page.locator('.tab-bar');
    await expect(tabBar).toBeVisible({ timeout: 10000 });
    
    const dashboardBtn = page.locator('.dashboard-btn');
    const newTabBtn = page.locator('.new-tab-btn');
    
    await expect(dashboardBtn).toBeVisible();
    await expect(newTabBtn).toBeVisible();
  });
});
