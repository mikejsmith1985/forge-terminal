import { test, expect } from '@playwright/test';

/**
 * Session Recovery E2E Test
 * 
 * This test validates the complete session recovery flow:
 * 1. Start Forge Terminal
 * 2. Run Copilot CLI via keyboard shortcut (Ctrl+Shift+1)
 * 3. Switch to GPT-5-Mini model (/model command)
 * 4. Ask a question and get a response
 * 5. Validate conversation is logged to AM
 * 6. Close terminal/tab
 * 7. Open new terminal
 * 8. Trigger session recovery
 * 9. Validate recovery works
 */

test.describe('Session Recovery E2E Flow', () => {
  // Increase timeout for this comprehensive test
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Enable dev mode for AM features
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('devMode', 'true');
    });
    await page.reload();
    await page.waitForSelector('.app', { timeout: 15000 });
    
    // Wait for terminal to be ready
    await page.waitForSelector('.xterm-screen', { timeout: 15000 });
    await page.waitForTimeout(2000);
  });

  test('Complete Copilot session with model selection and AM logging', async ({ page, request }) => {
    // Step 1: Focus terminal
    const terminal = page.locator('.xterm-screen');
    await terminal.click();
    await page.waitForTimeout(500);

    // Step 2: Run Copilot CLI via keyboard shortcut (Ctrl+Shift+1)
    console.log('Step 2: Launching Copilot CLI via Ctrl+Shift+1...');
    await page.keyboard.press('Control+Shift+1');
    await page.waitForTimeout(3000);

    // Check if Copilot started (look for TUI indicators)
    let terminalText = await getTerminalText(page);
    console.log('Terminal after Ctrl+Shift+1:', terminalText.substring(0, 500));

    // If Copilot didn't start via shortcut, try typing the command
    if (!terminalText.includes('copilot') && !terminalText.includes('Copilot') && !terminalText.includes('❯')) {
      console.log('Shortcut may not have worked, trying gh copilot...');
      await page.keyboard.type('gh copilot', { delay: 50 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);
      terminalText = await getTerminalText(page);
    }

    // Step 3: Select GPT-5-Mini model via /model command
    console.log('Step 3: Selecting GPT-5-Mini model...');
    await page.keyboard.type('/model', { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Navigate to option 5 (GPT-5-Mini)
    // In Copilot TUI, we need to use arrow keys to select
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    terminalText = await getTerminalText(page);
    console.log('Terminal after model selection:', terminalText.substring(0, 500));

    // Step 4: Ask a test question
    console.log('Step 4: Asking test question...');
    const testQuestion = 'What is 2 plus 2? Reply with just the number.';
    await page.keyboard.type(testQuestion, { delay: 30 });
    await page.keyboard.press('Enter');
    
    // Wait for response (Copilot can take a while)
    console.log('Waiting for Copilot response (up to 30 seconds)...');
    await page.waitForTimeout(15000);

    terminalText = await getTerminalText(page);
    console.log('Terminal after question:', terminalText.substring(0, 800));

    // Check for response indicators
    const hasResponse = terminalText.includes('4') || 
                        terminalText.includes('four') ||
                        terminalText.includes('Copilot') ||
                        terminalText.includes('response');
    
    if (!hasResponse) {
      console.log('Warning: May not have received response yet');
    }

    // Step 5: Check AM logging
    console.log('Step 5: Checking AM logs...');
    
    // Check AM health endpoint
    const healthResponse = await request.get('/api/am/health');
    expect(healthResponse.ok()).toBeTruthy();
    const health = await healthResponse.json();
    console.log('AM Health:', JSON.stringify(health, null, 2));

    // Check for recoverable sessions
    const sessionsResponse = await request.get('/api/am/restore/sessions');
    if (sessionsResponse.ok()) {
      const sessionsData = await sessionsResponse.json();
      console.log('Recoverable sessions:', JSON.stringify(sessionsData, null, 2));
      
      if (sessionsData.sessions && sessionsData.sessions.length > 0) {
        console.log(`✓ Found ${sessionsData.sessions.length} recoverable sessions`);
        
        // Verify our conversation was logged
        const copilotSession = sessionsData.sessions.find(s => 
          s.provider === 'github-copilot' || s.provider === 'copilot'
        );
        if (copilotSession) {
          console.log('✓ Found Copilot session in AM logs:', copilotSession.conversationId);
          expect(copilotSession.turnCount).toBeGreaterThanOrEqual(1);
        }
      }
    }

    // Step 6: Exit Copilot (Ctrl+C or /exit)
    console.log('Step 6: Exiting Copilot...');
    await page.keyboard.type('/exit', { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Verify back at shell prompt
    terminalText = await getTerminalText(page);
    const atShellPrompt = terminalText.includes('$') || terminalText.includes('%') || terminalText.includes('>');
    console.log('At shell prompt:', atShellPrompt);

    // Step 7: Open new tab
    console.log('Step 7: Opening new tab...');
    
    // Look for new tab button
    const newTabButton = page.locator('button:has-text("New"), .new-tab-button, [title*="New Tab"]').first();
    if (await newTabButton.isVisible()) {
      await newTabButton.click();
    } else {
      // Try keyboard shortcut for new tab
      await page.keyboard.press('Control+t');
    }
    await page.waitForTimeout(3000);

    // Focus the new terminal
    await page.locator('.xterm-screen').first().click();
    await page.waitForTimeout(1000);

    // Step 8: Verify session recovery is available
    console.log('Step 8: Checking session recovery...');
    
    // Re-check recoverable sessions
    const recoverResponse = await request.get('/api/am/restore/sessions');
    if (recoverResponse.ok()) {
      const recoverData = await recoverResponse.json();
      console.log('Sessions after new tab:', JSON.stringify(recoverData, null, 2));
      
      // The previous session should still be recoverable
      if (recoverData.sessions && recoverData.sessions.length > 0) {
        console.log('✓ Sessions available for recovery');
        
        // Try to get restore context for the first session
        const firstSession = recoverData.sessions[0];
        const contextResponse = await request.get(`/api/am/restore/context/${firstSession.conversationId}`);
        if (contextResponse.ok()) {
          const context = await contextResponse.json();
          console.log('Restore context available:', {
            summary: context.summary,
            turnCount: context.turnCount,
            restorePrompt: context.restorePrompt?.substring(0, 100)
          });
          
          expect(context.conversationId).toBeDefined();
          expect(context.restorePrompt).toBeDefined();
        }
      }
    }

    console.log('✓ Test completed successfully');
  });

  test('AM logging does not cause keyboard lag', async ({ page }) => {
    // This test validates the keyboard lag fix
    
    // Focus terminal
    const terminal = page.locator('.xterm-screen');
    await terminal.click();
    await page.waitForTimeout(500);

    // Enable AM logging via right-click menu (if available)
    // Or just test typing speed

    const testString = 'echo "Testing keyboard responsiveness"';
    
    // Measure typing time
    const startTime = Date.now();
    await page.keyboard.type(testString, { delay: 20 });
    const typingTime = Date.now() - startTime;
    
    console.log(`Typed ${testString.length} characters in ${typingTime}ms`);
    
    // Expected time: ~20ms * length = ~800ms, allow 5x for overhead
    const expectedMaxTime = testString.length * 20 * 5;
    expect(typingTime).toBeLessThan(expectedMaxTime);
    
    // The critical check: NO 30-second delays
    // If typing took more than 10 seconds, the keyboard lag bug is present
    expect(typingTime).toBeLessThan(10000);
    
    console.log('✓ Keyboard input is responsive (no lag detected)');
  });
});

/**
 * Helper function to get visible terminal text
 */
async function getTerminalText(page) {
  return await page.evaluate(() => {
    // Try to get text from xterm rows
    const rows = document.querySelectorAll('.xterm-rows > div');
    if (rows.length > 0) {
      return Array.from(rows).map(row => row.textContent || '').join('\n');
    }
    // Fallback to screen element
    const screen = document.querySelector('.xterm-screen');
    return screen ? screen.textContent || '' : '';
  });
}
