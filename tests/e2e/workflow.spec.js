// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Workflow System', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:8080');
    // Wait for app to load
    await page.waitForSelector('.app', { timeout: 10000 });
  });

  test('should show Workflows tab in sidebar', async ({ page }) => {
    // Look for the Workflows tab button
    const workflowsTab = page.locator('button.sidebar-view-tab', { hasText: 'Flows' });
    await expect(workflowsTab).toBeVisible();
  });

  test('should switch to Workflows tab and show empty state', async ({ page }) => {
    // Click the Workflows tab
    const workflowsTab = page.locator('button.sidebar-view-tab', { hasText: 'Flows' });
    await workflowsTab.click();
    
    // Should show empty state or workflow list
    const workflowsContainer = page.locator('.workflow-cards-container');
    await expect(workflowsContainer).toBeVisible({ timeout: 5000 });
  });

  test('should open workflow canvas when clicking New Workflow', async ({ page }) => {
    // Click the Workflows tab
    const workflowsTab = page.locator('button.sidebar-view-tab', { hasText: 'Flows' });
    await workflowsTab.click();
    
    // Wait for workflows section to load
    await page.waitForTimeout(500);
    
    // Click New Workflow button (either the large one in empty state or smaller one)
    const newWorkflowBtn = page.locator('.btn-new-workflow').first();
    await newWorkflowBtn.click();
    
    // Workflow canvas should now be visible
    const workflowCanvas = page.locator('.workflow-canvas-fullscreen');
    await expect(workflowCanvas).toBeVisible({ timeout: 5000 });
  });

  test('should be able to add nodes to workflow canvas', async ({ page }) => {
    // Open workflow canvas
    const workflowsTab = page.locator('button.sidebar-view-tab', { hasText: 'Flows' });
    await workflowsTab.click();
    await page.waitForTimeout(500);
    
    const newWorkflowBtn = page.locator('.btn-new-workflow').first();
    await newWorkflowBtn.click();
    
    // Wait for canvas to appear
    await page.waitForSelector('.workflow-canvas-fullscreen');
    
    // Click Add Start node button
    const startBtn = page.locator('.workflow-canvas-toolbar button', { hasText: 'Start' });
    await startBtn.click();
    
    // There should now be at least one node in the canvas
    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(1, { timeout: 3000 });
    
    // Add a command node
    const commandBtn = page.locator('.workflow-canvas-toolbar button', { hasText: 'Command' });
    await commandBtn.click();
    
    // Should have 2 nodes now
    await expect(nodes).toHaveCount(2, { timeout: 3000 });
  });

  test('should save workflow and show it in list', async ({ page }) => {
    // Open workflow canvas
    const workflowsTab = page.locator('button.sidebar-view-tab', { hasText: 'Flows' });
    await workflowsTab.click();
    await page.waitForTimeout(500);
    
    const newWorkflowBtn = page.locator('.btn-new-workflow').first();
    await newWorkflowBtn.click();
    
    // Wait for canvas
    await page.waitForSelector('.workflow-canvas-fullscreen');
    
    // Enter workflow name
    const nameInput = page.locator('.workflow-name-input');
    await nameInput.fill('Test Workflow');
    
    // Add a start node
    const startBtn = page.locator('.workflow-canvas-toolbar button', { hasText: 'Start' });
    await startBtn.click();
    
    // Save the workflow
    const saveBtn = page.locator('.workflow-canvas-header-right button', { hasText: 'Save' });
    await saveBtn.click();
    
    // Canvas should close
    await expect(page.locator('.workflow-canvas-fullscreen')).not.toBeVisible({ timeout: 5000 });
    
    // Workflow should appear in the list
    const workflowCard = page.locator('.workflow-card', { hasText: 'Test Workflow' });
    await expect(workflowCard).toBeVisible({ timeout: 5000 });
  });

  test('should open workflow editor when clicking Edit', async ({ page }) => {
    // First create a workflow
    const workflowsTab = page.locator('button.sidebar-view-tab', { hasText: 'Flows' });
    await workflowsTab.click();
    await page.waitForTimeout(500);
    
    const newWorkflowBtn = page.locator('.btn-new-workflow').first();
    await newWorkflowBtn.click();
    
    await page.waitForSelector('.workflow-canvas-fullscreen');
    
    const nameInput = page.locator('.workflow-name-input');
    await nameInput.fill('Edit Test Workflow');
    
    const startBtn = page.locator('.workflow-canvas-toolbar button', { hasText: 'Start' });
    await startBtn.click();
    
    const saveBtn = page.locator('.workflow-canvas-header-right button', { hasText: 'Save' });
    await saveBtn.click();
    
    await expect(page.locator('.workflow-canvas-fullscreen')).not.toBeVisible({ timeout: 5000 });
    
    // Now click edit on the workflow card
    const workflowCard = page.locator('.workflow-card', { hasText: 'Edit Test Workflow' });
    const editBtn = workflowCard.locator('button', { hasText: 'Edit' }).or(workflowCard.locator('[title="Edit workflow"]'));
    await editBtn.click();
    
    // Canvas should open again with the workflow data
    const workflowCanvas = page.locator('.workflow-canvas-fullscreen');
    await expect(workflowCanvas).toBeVisible({ timeout: 5000 });
    
    // Name should be populated
    const editNameInput = page.locator('.workflow-name-input');
    await expect(editNameInput).toHaveValue('Edit Test Workflow');
  });

  test('should open workflow executor when clicking Run', async ({ page }) => {
    // First create a workflow with nodes
    const workflowsTab = page.locator('button.sidebar-view-tab', { hasText: 'Flows' });
    await workflowsTab.click();
    await page.waitForTimeout(500);
    
    const newWorkflowBtn = page.locator('.btn-new-workflow').first();
    await newWorkflowBtn.click();
    
    await page.waitForSelector('.workflow-canvas-fullscreen');
    
    const nameInput = page.locator('.workflow-name-input');
    await nameInput.fill('Run Test Workflow');
    
    // Add start node
    const startBtn = page.locator('.workflow-canvas-toolbar button', { hasText: 'Start' });
    await startBtn.click();
    
    // Add end node
    const endBtn = page.locator('.workflow-canvas-toolbar button', { hasText: 'End' });
    await endBtn.click();
    
    const saveBtn = page.locator('.workflow-canvas-header-right button', { hasText: 'Save' });
    await saveBtn.click();
    
    await expect(page.locator('.workflow-canvas-fullscreen')).not.toBeVisible({ timeout: 5000 });
    
    // Click run on the workflow
    const workflowCard = page.locator('.workflow-card', { hasText: 'Run Test Workflow' });
    const runBtn = workflowCard.locator('button', { hasText: 'Run' }).or(workflowCard.locator('[title="Run workflow"]'));
    await runBtn.click();
    
    // Executor should open
    const executor = page.locator('.workflow-executor-overlay');
    await expect(executor).toBeVisible({ timeout: 5000 });
  });
});
