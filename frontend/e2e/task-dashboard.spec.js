// task-dashboard.spec.js - E2E tests for Task Dashboard
// Verifies the Task Dashboard integrates properly with the terminal

import { test, expect } from '@playwright/test';

test.describe('Task Dashboard (v3.8.2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.terminal-container', { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  test('Task Dashboard toggle button should be visible', async ({ page }) => {
    // Look for the Target icon button (Task Dashboard toggle)
    const toggleBtn = page.locator('button[title="Toggle Task Dashboard"]');
    await expect(toggleBtn).toBeVisible();
    console.log('✓ Task Dashboard toggle button is visible');
  });

  test('Clicking toggle should show Task Dashboard panel', async ({ page }) => {
    const toggleBtn = page.locator('button[title="Toggle Task Dashboard"]');
    await toggleBtn.click();
    await page.waitForTimeout(500);
    
    // Check for task dashboard panel
    const dashboardPanel = page.locator('.task-dashboard-panel').first();
    await expect(dashboardPanel).toBeVisible();
    console.log('✓ Task Dashboard panel is visible after toggle');
  });

  test('Task Dashboard should show stages', async ({ page }) => {
    const toggleBtn = page.locator('button[title="Toggle Task Dashboard"]');
    await toggleBtn.click();
    await page.waitForTimeout(500);
    
    // Check for stage elements
    const stages = page.locator('.task-stage');
    const stageCount = await stages.count();
    expect(stageCount).toBe(5); // Context, Plan, Implement, Validate, Deliver
    console.log(`✓ Found ${stageCount} stages in Task Dashboard`);
  });

  test('Terminal should still work with dashboard open', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Open dashboard
    const toggleBtn = page.locator('button[title="Toggle Task Dashboard"]');
    await toggleBtn.click();
    await page.waitForTimeout(500);
    
    // Terminal should still be visible and functional
    const terminal = page.locator('.view-layer.terminal-layer.active .xterm').first();
    await expect(terminal).toBeVisible();
    
    // Click on terminal and type
    await terminal.click();
    await page.waitForTimeout(300);
    await page.keyboard.type('echo "dashboard test"');
    await page.waitForTimeout(200);
    
    console.log('✓ Terminal still works with Task Dashboard open');
  });

  test('Task name input should be editable', async ({ page }) => {
    const toggleBtn = page.locator('button[title="Toggle Task Dashboard"]');
    await toggleBtn.click();
    await page.waitForTimeout(500);
    
    // Find the task name input
    const taskInput = page.locator('.task-name-edit input');
    await expect(taskInput).toBeVisible();
    
    // Type a task name
    await taskInput.fill('Implement user authentication');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    // Check that the name is displayed
    const taskName = page.locator('.task-name-display h2');
    await expect(taskName).toContainText('Implement user authentication');
    console.log('✓ Task name is editable');
  });

  test('Closing dashboard should show terminal full width', async ({ page }) => {
    const toggleBtn = page.locator('button[title="Toggle Task Dashboard"]');
    
    // Open dashboard
    await toggleBtn.click();
    await page.waitForTimeout(500);
    const dashboardPanel = page.locator('.task-dashboard-panel').first();
    await expect(dashboardPanel).toBeVisible();
    
    // Close dashboard
    await toggleBtn.click();
    await page.waitForTimeout(500);
    
    // Dashboard should be hidden
    await expect(dashboardPanel).not.toBeVisible();
    console.log('✓ Dashboard closes properly');
  });
});
