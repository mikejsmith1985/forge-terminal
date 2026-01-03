/**
 * Playwright E2E Tests: Smart Routing Integration
 * 
 * Tests the Intelligence tab, Smart Routing (SLM) engine,
 * and validates the feasibility of connecting task dashboard
 * with terminal session conversation context.
 * 
 * NOTE: Intelligence tab tests require full backend (localhost:8333).
 * Task dashboard tests work with static HTML.
 */
import { test, expect } from '@playwright/test';

// Setup localStorage to skip tour
async function setupLocalStorage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('forge_tour_completed', JSON.stringify({ version: '3.9.2' }));
    localStorage.setItem('forge_welcome_shown', 'true');
  });
}

// Dismiss overlays helper
async function dismissOverlays(page) {
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.querySelectorAll('.tour-overlay, .tour-backdrop').forEach(el => el.remove());
  });
  await page.waitForTimeout(300);
}

// Skip Intelligence tests when backend not available
test.describe('Intelligence Tab - Smart Routing', () => {
  // These tests require full backend - skip for now
  test.skip('should open settings modal and navigate to Intelligence tab', async ({ page }) => {
    // Requires backend at localhost:8333
  });
});

test.describe('Task Dashboard - Current State Analysis', () => {
  test('should load task-dashboard.html correctly', async ({ page }) => {
    await page.goto('file:///C:/ProjectsWin/Forge-Terminal/task-dashboard.html');
    await page.waitForTimeout(1000);

    // Dashboard should have header
    const header = page.locator('h1');
    await expect(header).toBeVisible({ timeout: 5000 });
    const headerText = await header.textContent();
    expect(headerText).toContain('Forge Terminal');

    // Should show version badge
    const badge = page.locator('.version-badge');
    await expect(badge).toBeVisible();

    // Should have grid layout with cards
    const cards = page.locator('.card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(4);
  });

  test('should render Mermaid diagram', async ({ page }) => {
    await page.goto('file:///C:/ProjectsWin/Forge-Terminal/task-dashboard.html');
    await page.waitForTimeout(2000); // Wait for Mermaid to render

    // Mermaid container should exist
    const mermaidDiv = page.locator('.mermaid');
    await expect(mermaidDiv).toBeVisible({ timeout: 5000 });

    // After Mermaid renders, it creates SVG elements
    const svg = page.locator('.mermaid svg');
    await expect(svg).toBeVisible({ timeout: 5000 });
  });

  test('should display files changed section', async ({ page }) => {
    await page.goto('file:///C:/ProjectsWin/Forge-Terminal/task-dashboard.html');
    await page.waitForTimeout(1000);

    // Should have files changed section
    const filesChanged = page.locator('.files-changed');
    await expect(filesChanged).toBeVisible();

    // Should have file path entries
    const filePaths = page.locator('.file-path');
    const fileCount = await filePaths.count();
    expect(fileCount).toBeGreaterThan(0);
  });

  test('should display implementation summary', async ({ page }) => {
    await page.goto('file:///C:/ProjectsWin/Forge-Terminal/task-dashboard.html');
    await page.waitForTimeout(1000);

    // Should have summary grid
    const summaryGrid = page.locator('.summary-grid');
    await expect(summaryGrid).toBeVisible();

    // Should have summary items
    const summaryItems = page.locator('.summary-item');
    const itemCount = await summaryItems.count();
    expect(itemCount).toBeGreaterThanOrEqual(4);
  });
});

test.describe('Developer Dashboard - Integration Points', () => {
  test.beforeEach(async ({ page }) => {
    await setupLocalStorage(page);
    await page.goto('http://localhost:5173');
    await dismissOverlays(page);
    await page.waitForTimeout(1000);
  });

  test('should open developer dashboard from tab bar', async ({ page }) => {
    const dashboardBtn = page.locator('.dashboard-btn');
    await expect(dashboardBtn).toBeVisible({ timeout: 10000 });
    await dashboardBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Dashboard should open
    const dashboard = page.locator('.dev-dashboard-overlay').first();
    await expect(dashboard).toBeVisible({ timeout: 5000 });
  });

  test('should display stats that could integrate with task workflow', async ({ page }) => {
    const dashboardBtn = page.locator('.dashboard-btn');
    await dashboardBtn.click({ force: true });
    await page.waitForTimeout(1000);

    // Should have stats grid
    const statsGrid = page.locator('.dd-stats-grid');
    await expect(statsGrid).toBeVisible({ timeout: 5000 });

    // Stats cards should exist (prompts, turns, etc)
    const statCards = page.locator('.dd-stat-card');
    const cardCount = await statCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });
});
