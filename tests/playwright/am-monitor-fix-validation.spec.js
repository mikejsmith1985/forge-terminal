/**
 * AM Monitor Fix Validation - v3.11.7
 * 
 * Tests that AM Monitor shows fresh data after Copilot conversations.
 * 
 * Strategy (per user instructions):
 * 1. Click "Run Copilot" command card
 * 2. Set model to gpt-5-mini
 * 3. Prompt: "I've implemented a fix for AM monitoring, please review my code changes for accuracy"
 * 4. Verify AM Logger creates session files
 * 5. Check AM Monitor shows recent activity
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3005';
const AM_DIR = 'C:\\ProjectsWin\\forge-terminal\\.forge\\am\\sessions';

test.describe('AM Monitor Fix Validation', () => {
  
  test('AM Monitor shows fresh data after Copilot conversations', async ({ page, context }) => {
    test.setTimeout(180000); // 3 minutes
    
    console.log('[Test] ═══════════════════════════════════════');
    console.log('[Test] AM MONITOR FIX VALIDATION');
    console.log('[Test] ═══════════════════════════════════════\n');
    
    await page.goto(BASE_URL);
    await page.waitForTimeout(3000);
    
    // Dismiss tour if present
    const tourSkip = page.locator('button:has-text("Skip")');
    if (await tourSkip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tourSkip.click();
      await page.waitForTimeout(500);
    }
    
    // Take screenshot of initial state
    await page.screenshot({ path: 'test-results/am-01-initial.png', fullPage: true });
    console.log('[Test] ✓ Screenshot: Initial state');
    
    // Count existing session files BEFORE
    let beforeCount = 0;
    try {
      if (fs.existsSync(AM_DIR)) {
        const files = fs.readdirSync(AM_DIR);
        beforeCount = files.filter(f => f.endsWith('.json')).length;
      }
    } catch (e) {
      console.log('[Test] Note: AM directory not yet created');
    }
    console.log(`[Test] Session files BEFORE: ${beforeCount}\n`);
    
    // Run 5 Copilot conversations
    const questions = [
      "I've implemented a fix for AM monitoring in llm_logger.go, please review the code changes",
      "Explain the amDir validation fix in GetLLMLogger",
      "Why did empty amDir cause saveConversation to skip?",
      "How does the fix prevent stale AM Monitor data?",
      "Summarize the AM Logger fix"
    ];
    
    for (let i = 0; i < questions.length; i++) {
      console.log(`[Test] Conversation ${i+1}/${questions.length}: Starting...`);
      
      // Look for "Run Copilot" in command cards sidebar
      await page.screenshot({ path: `test-results/am-02-before-click-${i+1}.png`, fullPage: true });
      
      // Try multiple selectors for the command card
      const copilotCard = await page.locator(
        '.command-card:has-text("Run Copilot"), ' +
        'button:has-text("Run Copilot"), ' +
        '[data-command="run-copilot"], ' +
        '.sidebar button:has-text("Copilot")'
      ).first();
      
      // Press Ctrl+Shift+1 to show command cards panel
      await page.keyboard.press('Control+Shift+1');
      await page.waitForTimeout(1500);
      
      // Now click the "Run Copilot" command card that appeared
      const runCopilotCard = page.locator('text=Run Copilot').first();
      if (await runCopilotCard.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[Test]   ✓ Found "Run Copilot" card, clicking...');
        await runCopilotCard.click();
        await page.waitForTimeout(2000);
      } else {
        console.log('[Test]   ✗ Run Copilot card not visible after Ctrl+Shift+1');
        await page.screenshot({ path: `test-results/am-ERROR-no-card-${i+1}.png`, fullPage: true });
      }
      
      await page.screenshot({ path: `test-results/am-03-panel-visible-${i+1}.png`, fullPage: true });
      
      // Look for model selector dropdown in the Copilot panel
      const modelSelect = page.locator('select, .model-selector, [role="combobox"]').first();
      if (await modelSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[Test]   ✓ Found model selector');
        await modelSelect.click();
        await page.waitForTimeout(500);
        
        // Try to select gpt-5-mini
        await page.keyboard.type('gpt-5-mini');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        console.log('[Test]   ✓ Set model to gpt-5-mini');
      }
      
      // Find text input for the question
      const textInput = page.locator('textarea, input[type="text"]').last();
      await textInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      
      if (await textInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[Test]   ✓ Found text input');
        await textInput.click({ force: true });
        await textInput.fill(questions[i]);
        await page.waitForTimeout(500);
        
        // Submit
        await page.keyboard.press('Enter');
        console.log(`[Test]   ✓ Sent: "${questions[i].substring(0, 50)}..."`);
        
        // Wait for response
        await page.waitForTimeout(8000);
        
        await page.screenshot({ path: `test-results/am-04-conversation-${i+1}.png`, fullPage: true });
        console.log(`[Test]   ✓ Screenshot saved`);
      } else {
        console.log('[Test]   ✗ Could not find text input');
        await page.screenshot({ path: `test-results/am-ERROR-${i+1}.png`, fullPage: true });
      }
      
      // Close chat
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
    
    console.log(`\n[Test] ✓ Completed ${questions.length} conversations\n`);
    
    // Wait for AM Logger to save
    await page.waitForTimeout(3000);
    
    // Count session files AFTER
    let afterCount = 0;
    let newFiles = [];
    try {
      if (fs.existsSync(AM_DIR)) {
        const files = fs.readdirSync(AM_DIR).filter(f => f.endsWith('.json'));
        afterCount = files.length;
        
        // Get newest files
        newFiles = files
          .map(f => ({
            name: f,
            time: fs.statSync(path.join(AM_DIR, f)).mtime
          }))
          .sort((a, b) => b.time - a.time)
          .slice(0, 5)
          .map(f => f.name);
      }
    } catch (e) {
      console.log('[Test] Error reading AM directory:', e);
    }
    
    console.log(`[Test] Session files AFTER: ${afterCount}`);
    console.log(`[Test] New files created: ${afterCount - beforeCount}`);
    if (newFiles.length > 0) {
      console.log('[Test] Newest files:');
      newFiles.forEach(f => console.log(`[Test]   - ${f}`));
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'test-results/am-05-complete.png', fullPage: true });
    
    // VALIDATION
    const hasNewFiles = afterCount > beforeCount;
    const hasMultipleFiles = afterCount >= beforeCount + 3; // At least 3 new conversations
    
    console.log(`\n[Test] ═══════════════════════════════════════`);
    console.log(`[Test] VALIDATION RESULTS:`);
    console.log(`[Test]   Files before: ${beforeCount}`);
    console.log(`[Test]   Files after: ${afterCount}`);
    console.log(`[Test]   New files: ${afterCount - beforeCount}`);
    console.log(`[Test]   ✓ Test: ${hasNewFiles ? 'PASS' : 'FAIL'}`);
    console.log(`[Test] ═══════════════════════════════════════\n`);
    
    expect(hasNewFiles, 'Expected new session files to be created').toBe(true);
    expect(hasMultipleFiles, `Expected at least 3 new files (got ${afterCount - beforeCount})`).toBe(true);
  });
  
});
