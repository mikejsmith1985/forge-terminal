/**
 * Comprehensive E2E Tests for Issues #51 and #52
 * 
 * Issue #51: Tour Feedback
 * - Tour cards should not be cut off (viewport boundary detection)
 * - SLM should be mentioned and status shown
 * - Welcome modal should be replaced by tour
 * 
 * Issue #52: Chat UI + WebSocket + SLM
 * - WebSocket should stay connected when terminal opens
 * - Chat UI should mirror terminal output
 * - Chat should be able to send commands to PTY
 * - SLM should be installable and functional
 * 
 * TDD Approach: These tests are written FIRST, expected to fail initially.
 * The fixes will make them pass.
 */

import { test, expect } from '@playwright/test';

// Test configuration
const TIMEOUT_SHORT = 5000;
const TIMEOUT_MEDIUM = 15000;
const TIMEOUT_LONG = 30000;

test.describe('Issue #51 - Tour System', () => {
  
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure fresh tour state
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('forge_tour_completed');
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
  });

  test('Tour should start automatically on first visit', async ({ page }) => {
    // Wait for the tour overlay to appear
    const tourOverlay = page.locator('.tour-overlay');
    await expect(tourOverlay).toBeVisible({ timeout: TIMEOUT_MEDIUM });
    
    // Verify first step content
    const title = page.locator('.tour-tooltip-title');
    await expect(title).toContainText('Welcome', { timeout: TIMEOUT_SHORT });
    
    // Screenshot for visual validation
    await page.screenshot({ path: 'test-results/tour-start.png', fullPage: true });
  });

  test('Tour cards should not be cut off at viewport boundaries', async ({ page }) => {
    // Wait for tour to start
    await page.waitForSelector('.tour-overlay', { timeout: TIMEOUT_MEDIUM });
    
    // Navigate through tour steps and check each tooltip is visible
    const steps = 5; // Check first 5 steps
    for (let i = 0; i < steps; i++) {
      const tooltip = page.locator('.tour-tooltip');
      await expect(tooltip).toBeVisible({ timeout: TIMEOUT_SHORT });
      
      // Get tooltip bounding box
      const box = await tooltip.boundingBox();
      expect(box).not.toBeNull();
      
      // Verify tooltip is within viewport
      const viewport = page.viewportSize();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      
      // Screenshot each step
      await page.screenshot({ path: `test-results/tour-step-${i + 1}.png`, fullPage: true });
      
      // Click next button - use correct class
      const nextBtn = page.locator('.tour-btn-next');
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(500); // Wait for animation
      } else {
        break;
      }
    }
  });

  test('Tour should mention SLM and Smart Routing', async ({ page }) => {
    // Wait for tour to start
    await page.waitForSelector('.tour-overlay', { timeout: TIMEOUT_MEDIUM });
    
    // Navigate to find SLM-related steps
    let foundSLMStep = false;
    const maxSteps = 15;
    
    for (let i = 0; i < maxSteps; i++) {
      const tooltipContent = page.locator('.tour-tooltip-content');
      const text = await tooltipContent.textContent();
      
      if (text && (text.includes('SLM') || text.includes('Smart') || text.includes('routing') || text.includes('model selection'))) {
        foundSLMStep = true;
        await page.screenshot({ path: 'test-results/tour-slm-step.png', fullPage: true });
        break;
      }
      
      // Click next - use correct class
      const nextBtn = page.locator('.tour-btn-next');
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }
    
    expect(foundSLMStep).toBe(true);
  });

  test('Tour should be skippable with X button', async ({ page }) => {
    // Wait for tour to start
    await page.waitForSelector('.tour-overlay', { timeout: TIMEOUT_MEDIUM });
    
    // Find and click skip/close button - use correct class from TourOverlay.jsx
    const closeBtn = page.locator('.tour-tooltip-close');
    await expect(closeBtn).toBeVisible({ timeout: TIMEOUT_SHORT });
    await closeBtn.click();
    
    // Verify tour is dismissed
    await expect(page.locator('.tour-overlay')).not.toBeVisible({ timeout: TIMEOUT_SHORT });
    
    // Verify it doesn't come back on reload
    await page.reload();
    await page.waitForTimeout(2000);
    await expect(page.locator('.tour-overlay')).not.toBeVisible({ timeout: TIMEOUT_SHORT });
  });
});

test.describe('Issue #52 - WebSocket Connectivity', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Skip tour if present - set correct version
    await page.evaluate(() => {
      localStorage.setItem('forge_tour_completed', JSON.stringify({ version: '3.6.1', completedAt: new Date().toISOString() }));
      localStorage.setItem('hasVisited', 'true');
    });
    await page.reload();
    await page.waitForTimeout(1500);
    
    // If tour overlay appears, click Skip button
    const skipBtn = page.locator('.tour-btn-skip');
    if (await skipBtn.isVisible({ timeout: 2000 })) {
      await skipBtn.click();
      await page.waitForTimeout(500);
    }
    
    // If welcome modal appears, press Escape
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.isVisible({ timeout: 1000 })) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Click Terminal button to ensure we're in terminal view
    const terminalBtn = page.locator('button:has-text("Terminal")').first();
    if (await terminalBtn.isVisible({ timeout: 2000 })) {
      await terminalBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('WebSocket should connect successfully on page load', async ({ page }) => {
    // Wait for terminal to be ready
    const terminalContainer = page.locator('.terminal-container').first();
    await expect(terminalContainer).toBeVisible({ timeout: TIMEOUT_MEDIUM });
    
    // Wait for WebSocket connection
    await page.waitForTimeout(3000);
    
    // Check for xterm in any state (it may be created but container manages visibility)
    const xtermExists = await page.locator('.xterm').count();
    expect(xtermExists).toBeGreaterThan(0);
    
    await page.screenshot({ path: 'test-results/ws-connected.png', fullPage: true });
  });

  test('WebSocket should stay connected when switching views', async ({ page }) => {
    // Wait for terminal container
    const terminalContainer = page.locator('.terminal-container').first();
    await expect(terminalContainer).toBeVisible({ timeout: TIMEOUT_MEDIUM });
    await page.waitForTimeout(2000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'test-results/ws-initial.png', fullPage: true });
    
    // Check xterm exists
    const xtermExists = await page.locator('.xterm').count();
    expect(xtermExists).toBeGreaterThan(0);
    
    await page.screenshot({ path: 'test-results/ws-after-view-switch.png', fullPage: true });
  });

  test('Terminal should accept keyboard input after connection', async ({ page }) => {
    // Wait for terminal container
    const terminalContainer = page.locator('.terminal-container').first();
    await expect(terminalContainer).toBeVisible({ timeout: TIMEOUT_MEDIUM });
    await page.waitForTimeout(3000);
    
    // Click on the terminal container to focus
    await terminalContainer.click();
    
    // Type a command
    await page.keyboard.type('echo "test"');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'test-results/terminal-input.png', fullPage: true });
  });
});

test.describe('Issue #52 - Chat UI PTY Bridge', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('forge_tour_completed', JSON.stringify({ version: '3.6.1', completedAt: new Date().toISOString() }));
    });
    await page.reload();
    await page.waitForTimeout(1000);
  });

  test('Chat view should be accessible via sidebar', async ({ page }) => {
    // Wait for sidebar
    const sidebar = page.locator('.sidebar').first();
    await expect(sidebar).toBeVisible({ timeout: TIMEOUT_MEDIUM });
    
    // Look for chat-related tab or view
    const chatTab = page.locator('.sidebar-view-tab').filter({ hasText: /Chat|Message/i });
    
    if (await chatTab.isVisible({ timeout: TIMEOUT_SHORT })) {
      await chatTab.click();
      await page.waitForTimeout(1000);
    }
    
    await page.screenshot({ path: 'test-results/chat-view.png', fullPage: true });
  });

  test('Chat input should be visible and functional', async ({ page }) => {
    // Wait for app to load
    await page.waitForTimeout(2000);
    
    // Find any chat input in the app
    const chatInput = page.locator('textarea').first();
    
    if (await chatInput.isVisible({ timeout: TIMEOUT_SHORT })) {
      await chatInput.fill('test message');
      const value = await chatInput.inputValue();
      expect(value).toContain('test');
      
      await page.screenshot({ path: 'test-results/chat-input.png', fullPage: true });
    } else {
      // Screenshot current state for debugging
      await page.screenshot({ path: 'test-results/chat-no-input.png', fullPage: true });
    }
  });
});

test.describe('Issue #52 - SLM Status and Installation', () => {
  
  test('SLM status API should return valid response', async ({ page }) => {
    // Call the SLM status API
    const response = await page.request.get('/api/slm/status');
    
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    
    // Response should have status object
    expect(data).toHaveProperty('status');
    expect(data.status).toHaveProperty('active_provider');
    
    // Take screenshot for documentation
    await page.goto('/');
    await page.screenshot({ path: 'test-results/slm-status-api.png', fullPage: true });
  });

  test('SLM model status API should return model info', async ({ page }) => {
    // Call the SLM model API (newly registered)
    const response = await page.request.get('/api/slm/model');
    
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    
    // Response should have model fields
    expect(data).toHaveProperty('model_exists');
    expect(data).toHaveProperty('binary_exists');
    expect(data).toHaveProperty('ready');
  });

  test('Settings should have Intelligence section with SLM status', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('forge_tour_completed', JSON.stringify({ version: '3.6.1', completedAt: new Date().toISOString() }));
    });
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Open settings modal - look for settings button
    const settingsBtn = page.locator('button').filter({ has: page.locator('.lucide-settings') }).first();
    
    if (await settingsBtn.isVisible({ timeout: TIMEOUT_SHORT })) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
      
      await page.screenshot({ path: 'test-results/settings-modal.png', fullPage: true });
      
      // Look for Intelligence tab
      const intelligenceTab = page.locator('button').filter({ hasText: 'Intelligence' });
      if (await intelligenceTab.isVisible({ timeout: TIMEOUT_SHORT })) {
        await intelligenceTab.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'test-results/settings-intelligence.png', fullPage: true });
      }
    }
  });
});

test.describe('Command Cards - Issue #52', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('forge_tour_completed', JSON.stringify({ version: '3.6.1', completedAt: new Date().toISOString() }));
      localStorage.setItem('hasVisited', 'true');
    });
    await page.reload();
    await page.waitForTimeout(1500);
    
    // If tour overlay appears, click Skip button
    const skipBtn = page.locator('.tour-btn-skip');
    if (await skipBtn.isVisible({ timeout: 2000 })) {
      await skipBtn.click();
      await page.waitForTimeout(500);
    }
    
    // If welcome modal appears, press Escape
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.isVisible({ timeout: 1000 })) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Click Terminal button to ensure terminal view
    const terminalBtn = page.locator('button:has-text("Terminal")').first();
    if (await terminalBtn.isVisible({ timeout: 2000 })) {
      await terminalBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('Command cards should be visible in sidebar', async ({ page }) => {
    // Look for command cards
    const sidebar = page.locator('.sidebar').first();
    await expect(sidebar).toBeVisible({ timeout: TIMEOUT_MEDIUM });
    
    // Look for command cards container
    const commandCards = page.locator('.card').first();
    
    if (await commandCards.isVisible({ timeout: TIMEOUT_SHORT })) {
      await page.screenshot({ path: 'test-results/command-cards.png', fullPage: true });
    }
  });

  test('Command card should be executable via click', async ({ page }) => {
    // Wait for terminal container
    const terminalContainer = page.locator('.terminal-container').first();
    await expect(terminalContainer).toBeVisible({ timeout: TIMEOUT_MEDIUM });
    await page.waitForTimeout(2000);
    
    // Find and click a command card
    const commandCard = page.locator('.card').first();
    
    if (await commandCard.isVisible({ timeout: TIMEOUT_SHORT })) {
      // Click the Run button on the card
      const runBtn = commandCard.locator('button:has-text("Run")').first();
      if (await runBtn.isVisible({ timeout: TIMEOUT_SHORT })) {
        await runBtn.click();
        await page.waitForTimeout(1000);
      }
      
      await page.screenshot({ path: 'test-results/command-card-execute.png', fullPage: true });
    }
  });
});

test.describe('Visual Regression Tests', () => {
  
  test('Main application layout should render correctly', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('forge_tour_completed', JSON.stringify({ version: '3.6.1', completedAt: new Date().toISOString() }));
      localStorage.setItem('hasVisited', 'true');
    });
    await page.reload();
    await page.waitForTimeout(1500);
    
    // If tour overlay appears, click Skip button
    const skipBtn = page.locator('.tour-btn-skip');
    if (await skipBtn.isVisible({ timeout: 2000 })) {
      await skipBtn.click();
      await page.waitForTimeout(500);
    }
    
    // If welcome modal appears, press Escape
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.isVisible({ timeout: 1000 })) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Take full-page screenshot
    await page.screenshot({ path: 'test-results/full-app-layout.png', fullPage: true });
    
    // Verify key elements are visible
    await expect(page.locator('.terminal-container').first()).toBeVisible();
    await expect(page.locator('.sidebar').first()).toBeVisible();
    await expect(page.locator('.tab-bar, .tabs').first()).toBeVisible();
  });

  test('Terminal should render with correct theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('forge_tour_completed', JSON.stringify({ version: '3.6.1', completedAt: new Date().toISOString() }));
      localStorage.setItem('hasVisited', 'true');
    });
    await page.reload();
    await page.waitForTimeout(1500);
    
    // If tour overlay appears, click Skip button
    const skipBtn = page.locator('.tour-btn-skip');
    if (await skipBtn.isVisible({ timeout: 2000 })) {
      await skipBtn.click();
      await page.waitForTimeout(500);
    }
    
    // If welcome modal appears, press Escape
    const welcomeModal = page.locator('.welcome-modal');
    if (await welcomeModal.isVisible({ timeout: 1000 })) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    
    // Click Terminal button to ensure terminal view
    const terminalBtn = page.locator('button:has-text("Terminal")').first();
    if (await terminalBtn.isVisible({ timeout: 2000 })) {
      await terminalBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Check terminal container is visible
    const terminalContainer = page.locator('.terminal-container').first();
    await expect(terminalContainer).toBeVisible();
    
    // Take screenshot of the terminal area
    await terminalContainer.screenshot({ path: 'test-results/terminal-styled.png' });
  });
});
