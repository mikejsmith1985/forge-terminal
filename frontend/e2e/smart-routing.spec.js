import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Use environment variable or default to 8333
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8333';

/**
 * Smart Routing Integration Tests
 * 
 * Tests the complete workflow of intelligent model selection:
 * 1. Pattern classification from user prompt
 * 2. Historical effectiveness data lookup
 * 3. Recommendation panel UI display
 * 4. Model switch + execution in one action
 * 5. Success tracking and logging
 */

test.describe('Smart Routing System', () => {
  
  test.beforeEach(async ({ page, baseURL }) => {
    // Start Forge Terminal
    await page.goto(baseURL || 'http://localhost:8333');
    
    // Dismiss tour if present - try multiple possible selectors
    try {
      const skipButton = page.getByRole('button', { name: /skip/i });
      await skipButton.click({ timeout: 5000 });
      await page.waitForTimeout(500); // Brief wait for modal to close
    } catch (e) {
      // Tour might not be present, continue
    }
    
    // Wait for terminal to be ready (tour should be dismissed by now)
    await page.waitForSelector('.xterm-viewport, [class*="terminal"]', { timeout: 15000 });
  });

  test('classifies task patterns correctly', async ({ page }) => {
    // Test pattern classification endpoint
    const patterns = [
      { 
        prompt: 'Design a smart routing system with DB and UI',
        expected: 'architecture',
        complexity: 9
      },
      {
        prompt: 'Refactor routing logic across @internal/llm/cfo @internal/slm @frontend/src/App.jsx',
        expected: 'multi-file-refactor',
        complexity: 8
      },
      {
        prompt: 'Fix the tour dismissal bug in localStorage',
        expected: 'bugfix',
        complexity: 5
      },
      {
        prompt: 'Write Playwright tests for the routing panel',
        expected: 'testing',
        complexity: 4
      },
      {
        prompt: 'Update README with routing documentation',
        expected: 'documentation',
        complexity: 2
      }
    ];

    for (const testCase of patterns) {
      // Call classification endpoint
      const response = await page.request.post(`${BASE_URL}/api/routing/classify`, {
        data: { 
          prompt: testCase.prompt,
          mentionedFiles: testCase.prompt.match(/@[\w\/\.\-]+/g) || []
        }
      });
      
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      
      // Verify classification
      expect(result.pattern).toBe(testCase.expected);
      expect(result.complexity).toBeGreaterThanOrEqual(testCase.complexity - 1);
      expect(result.complexity).toBeLessThanOrEqual(testCase.complexity + 1);
    }
  });

  test('displays recommendation panel in Task Dashboard', async ({ page }) => {
    // Navigate to Task Dashboard (HT mode)
    await page.getByTestId('tab-ht').click();
    await page.waitForLoadState('networkidle');
    
    // Enter a prompt that triggers routing recommendation
    const taskInput = page.getByTestId('ht-task-input');
    await taskInput.fill('Refactor routing logic across 7 files');
    
    // Should trigger pattern classification
    await page.waitForTimeout(500);
    
    // Recommendation panel should appear
    const recommendationPanel = page.getByTestId('smart-routing-panel');
    await expect(recommendationPanel).toBeVisible();
    
    // Verify panel contents
    await expect(page.getByTestId('detected-pattern')).toContainText('multi-file-refactor');
    await expect(page.getByTestId('recommended-model')).toBeVisible();
    await expect(page.getByTestId('model-reasoning')).toBeVisible();
    await expect(page.getByTestId('cost-comparison')).toBeVisible();
    await expect(page.getByTestId('expected-prompts')).toBeVisible();
  });

  test('shows historical effectiveness data when available', async ({ page }) => {
    // Seed effectiveness log with test data
    const testLog = [
      { pattern: 'multi-file-refactor', model: 'claude-opus-4.5', prompts: 2, success: true, timestamp: new Date().toISOString() },
      { pattern: 'multi-file-refactor', model: 'claude-opus-4.5', prompts: 3, success: true, timestamp: new Date().toISOString() },
      { pattern: 'multi-file-refactor', model: 'claude-sonnet-4.5', prompts: 5, success: true, timestamp: new Date().toISOString() },
      { pattern: 'multi-file-refactor', model: 'claude-sonnet-4.5', prompts: 4, success: true, timestamp: new Date().toISOString() }
    ];
    
    // Write test data
    const logPath = path.join(__dirname, '../../dev-data/effectiveness-log.jsonl');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, testLog.map(l => JSON.stringify(l)).join('\n') + '\n');
    
    // Navigate to Task Dashboard
    await page.getByTestId('tab-ht').click();
    await page.waitForLoadState('networkidle');
    
    // Enter prompt
    await page.getByTestId('ht-task-input').fill('Refactor routing across multiple files');
    await page.waitForTimeout(500);
    
    // Check recommendation shows historical data
    const panel = page.getByTestId('smart-routing-panel');
    await expect(panel).toBeVisible();
    
    // Should show Opus as recommended (avg 2.5 prompts vs Sonnet's 4.5)
    await expect(page.getByTestId('recommended-model')).toContainText('opus');
    await expect(page.getByTestId('historical-data')).toContainText('Based on 4 similar tasks');
    await expect(page.getByTestId('model-comparison-opus')).toContainText('avg 2.5 prompts');
    await expect(page.getByTestId('model-comparison-sonnet')).toContainText('avg 4.5 prompts');
  });

  test('executes model switch and prompt submission in one action', async ({ page }) => {
    // Navigate to Task Dashboard
    await page.getByTestId('tab-ht').click();
    await page.waitForLoadState('networkidle');
    
    // Enter prompt
    await page.getByTestId('ht-task-input').fill('Refactor routing logic across 7 files');
    await page.waitForTimeout(500);
    
    // Recommendation panel appears
    const panel = page.getByTestId('smart-routing-panel');
    await expect(panel).toBeVisible();
    
    // Click "Use Recommended Model" button
    const useModelButton = page.getByTestId('use-recommended-model-button');
    await expect(useModelButton).toBeEnabled();
    await useModelButton.click();
    
    // Should switch model and submit prompt automatically
    await page.waitForLoadState('networkidle');
    
    // Verify model was switched (check current model indicator)
    const currentModel = await page.getByTestId('current-model-indicator').textContent();
    expect(currentModel).toContain('opus'); // or whatever was recommended
    
    // Verify prompt was submitted (conversation should have started)
    await expect(page.getByTestId('conversation-messages')).toBeVisible();
    
    // Should have at least one message (the prompt we sent)
    const messages = page.getByTestId('conversation-message');
    await expect(messages).toHaveCount(1, { timeout: 10000 });
  });

  test('logs effectiveness data after task completion', async ({ page }) => {
    // Navigate to Task Dashboard
    await page.getByTestId('tab-ht').click();
    await page.waitForLoadState('networkidle');
    
    // Simulate completing a task
    await page.getByTestId('ht-task-input').fill('Fix a simple bug');
    await page.getByTestId('use-recommended-model-button').click();
    await page.waitForLoadState('networkidle');
    
    // Mark task as complete (simulate test passing)
    await page.getByTestId('mark-task-complete-button').click();
    
    // Should log to effectiveness database
    const response = await page.request.get(`${BASE_URL}/api/routing/effectiveness-log`);
    expect(response.ok()).toBeTruthy();
    
    const logs = await response.json();
    expect(logs.length).toBeGreaterThan(0);
    
    // Most recent log should match our task
    const latestLog = logs[logs.length - 1];
    expect(latestLog.pattern).toBe('bugfix');
    expect(latestLog.success).toBe(true);
    expect(latestLog.prompts).toBeGreaterThan(0);
    expect(latestLog.model).toBeTruthy();
  });

  test('handles case when no historical data exists', async ({ page }) => {
    // Clear effectiveness log
    const logPath = path.join(__dirname, '../../dev-data/effectiveness-log.jsonl');
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
    
    // Navigate to Task Dashboard
    await page.getByTestId('tab-ht').click();
    await page.waitForLoadState('networkidle');
    
    // Enter prompt
    await page.getByTestId('ht-task-input').fill('Implement a new feature');
    await page.waitForTimeout(500);
    
    // Recommendation panel should still appear
    const panel = page.getByTestId('smart-routing-panel');
    await expect(panel).toBeVisible();
    
    // Should show default recommendation with no historical data message
    await expect(page.getByTestId('no-historical-data')).toBeVisible();
    await expect(page.getByTestId('no-historical-data')).toContainText('No historical data yet');
    
    // Should still recommend a model based on pattern complexity
    await expect(page.getByTestId('recommended-model')).toBeVisible();
    await expect(page.getByTestId('model-reasoning')).toContainText('Based on task complexity');
  });

  test('allows user to reject recommendation and keep current model', async ({ page }) => {
    // Navigate to Task Dashboard
    await page.getByTestId('tab-ht').click();
    await page.waitForLoadState('networkidle');
    
    // Enter prompt
    await page.getByTestId('ht-task-input').fill('Refactor complex logic');
    await page.waitForTimeout(500);
    
    // Recommendation panel appears
    await expect(page.getByTestId('smart-routing-panel')).toBeVisible();
    
    // Click "Keep Current Model" button
    const keepCurrentButton = page.getByTestId('keep-current-model-button');
    await expect(keepCurrentButton).toBeVisible();
    await keepCurrentButton.click();
    
    // Panel should close
    await expect(page.getByTestId('smart-routing-panel')).not.toBeVisible();
    
    // Model should NOT have changed
    const currentModel = await page.getByTestId('current-model-indicator').textContent();
    const initialModel = 'sonnet'; // assuming default
    expect(currentModel).toContain(initialModel);
  });

  test('shows cost comparison correctly', async ({ page }) => {
    // Navigate to Task Dashboard
    await page.getByTestId('tab-ht').click();
    await page.waitForLoadState('networkidle');
    
    // Enter prompt that would recommend Opus
    await page.getByTestId('ht-task-input').fill('Design complex architecture across 10 files');
    await page.waitForTimeout(500);
    
    // Check cost comparison
    const panel = page.getByTestId('smart-routing-panel');
    await expect(panel).toBeVisible();
    
    const costComparison = page.getByTestId('cost-comparison');
    await expect(costComparison).toBeVisible();
    
    // Should show credit difference
    await expect(costComparison).toContainText('credit');
    
    // Should explain the tradeoff
    await expect(page.getByTestId('cost-reasoning')).toContainText('prompts');
  });

  test('pattern classifier handles edge cases', async ({ page }) => {
    const edgeCases = [
      { prompt: '', expected: 'unknown' },
      { prompt: 'hello', expected: 'unknown' },
      { prompt: 'test test test test test', expected: 'testing' },
      { prompt: 'fix refactor implement document', expected: 'multi-file-refactor' } // multiple keywords
    ];

    for (const testCase of edgeCases) {
      const response = await page.request.post(`${BASE_URL}/api/routing/classify`, {
        data: { prompt: testCase.prompt, mentionedFiles: [] }
      });
      
      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      expect(result.pattern).toBeTruthy();
    }
  });

  test('effectiveness log persists across sessions', async ({ page }) => {
    const logPath = path.join(__dirname, '../../dev-data/effectiveness-log.jsonl');
    
    // Create initial log entry
    const initialEntry = {
      pattern: 'testing',
      model: 'claude-sonnet-4.5',
      prompts: 1,
      success: true,
      timestamp: new Date().toISOString()
    };
    
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(initialEntry) + '\n');
    
    // Reload page (new session)
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Add another entry
    await page.getByTestId('tab-ht').click();
    await page.getByTestId('ht-task-input').fill('Write more tests');
    await page.getByTestId('use-recommended-model-button').click();
    await page.getByTestId('mark-task-complete-button').click();
    
    // Read log file
    const logContents = fs.readFileSync(logPath, 'utf-8');
    const lines = logContents.trim().split('\n');
    
    // Should have 2 entries
    expect(lines.length).toBe(2);
    
    // Both should be valid JSON
    lines.forEach(line => {
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });

});
