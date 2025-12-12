/**
 * Test: /diagnose command implementation
 * 
 * Validates that the diagnostic command:
 * 1. Executes when /diagnose is typed
 * 2. Returns diagnostic report with all sections
 * 3. Tests keyboard, focus, overlays, and terminal state
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

// Helper to start Forge Terminal
async function startForgeTerminal() {
  const { spawn } = require('child_process');
  const forgePath = path.join(__dirname, '..', '..', '..', 'forge');
  
  return new Promise((resolve, reject) => {
    const forge = spawn(forgePath, [], {
      env: { ...process.env, FORGE_PORT: '3456' },
      detached: true
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        forge.kill();
        reject(new Error('Forge Terminal failed to start within 10 seconds'));
      }
    }, 10000);

    forge.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Server starting') || output.includes('localhost:3456')) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          // Wait a bit more for server to be fully ready
          setTimeout(() => resolve(forge), 2000);
        }
      }
    });

    forge.stderr.on('data', (data) => {
      console.log('[Forge stderr]:', data.toString());
    });

    forge.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

test.describe('/diagnose command', () => {
  let forgeProcess;

  test.beforeAll(async () => {
    console.log('[Test] Starting Forge Terminal...');
    forgeProcess = await startForgeTerminal();
    console.log('[Test] Forge Terminal started');
  });

  test.afterAll(async () => {
    if (forgeProcess) {
      console.log('[Test] Stopping Forge Terminal...');
      process.kill(-forgeProcess.pid); // Kill process group
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  test('should execute /diagnose command and return report', async ({ page }) => {
    // Navigate to Forge Terminal
    await page.goto('http://localhost:3456', { waitUntil: 'networkidle' });
    console.log('[Test] Navigated to Forge Terminal');

    // Wait for terminal to be ready
    await page.waitForSelector('.xterm', { timeout: 10000 });
    await page.waitForTimeout(2000); // Extra time for terminal initialization
    console.log('[Test] Terminal ready');

    // Focus the terminal
    await page.click('.xterm');
    await page.waitForTimeout(500);

    // Type /diagnose command
    console.log('[Test] Typing /diagnose command');
    await page.keyboard.type('/diagnose all');
    await page.waitForTimeout(500);

    // Press Enter to execute
    await page.keyboard.press('Enter');
    console.log('[Test] Command executed');

    // Wait for diagnostic report to appear
    await page.waitForTimeout(2000);

    // Get terminal output
    const terminalText = await page.evaluate(() => {
      const xterm = document.querySelector('.xterm');
      return xterm ? xterm.textContent : '';
    });

    console.log('[Test] Terminal output length:', terminalText.length);
    console.log('[Test] Terminal output preview:', terminalText.substring(0, 500));

    // Verify diagnostic report sections
    expect(terminalText).toContain('Forge Diagnostic Report');
    expect(terminalText).toContain('[Keyboard Test]');
    expect(terminalText).toContain('[Focus Test]');
    expect(terminalText).toContain('[Overlay Test]');
    expect(terminalText).toContain('[Terminal Mount Test]');
    expect(terminalText).toContain('End of Report');

    // Verify JSON structure
    expect(terminalText).toMatch(/textareaCount.*:\s*\d+/);
    expect(terminalText).toMatch(/spaceEventSeen|wasPrevented/);

    console.log('[Test] ✓ /diagnose command executed successfully');
  });

  test('should execute /diagnose keyboard subcommand', async ({ page }) => {
    await page.goto('http://localhost:3456', { waitUntil: 'networkidle' });
    await page.waitForSelector('.xterm', { timeout: 10000 });
    await page.waitForTimeout(2000);

    await page.click('.xterm');
    await page.waitForTimeout(500);

    console.log('[Test] Typing /diagnose keyboard');
    await page.keyboard.type('/diagnose keyboard');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    const terminalText = await page.evaluate(() => {
      const xterm = document.querySelector('.xterm');
      return xterm ? xterm.textContent : '';
    });

    // Should contain only keyboard test
    expect(terminalText).toContain('[Keyboard Test]');
    expect(terminalText).toContain('spaceEventSeen');
    expect(terminalText).toContain('wasPrevented');
    
    // Should NOT contain other tests
    expect(terminalText).not.toContain('[Overlay Test]');

    console.log('[Test] ✓ /diagnose keyboard subcommand works');
  });

  test('should handle unknown slash commands', async ({ page }) => {
    await page.goto('http://localhost:3456', { waitUntil: 'networkidle' });
    await page.waitForSelector('.xterm', { timeout: 10000 });
    await page.waitForTimeout(2000);

    await page.click('.xterm');
    await page.waitForTimeout(500);

    console.log('[Test] Typing unknown command /unknown');
    await page.keyboard.type('/unknown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const terminalText = await page.evaluate(() => {
      const xterm = document.querySelector('.xterm');
      return xterm ? xterm.textContent : '';
    });

    // Should show error message
    expect(terminalText).toMatch(/Unknown command.*\/unknown/);
    expect(terminalText).toContain('Try /diagnose');

    console.log('[Test] ✓ Unknown command handling works');
  });

  test('should not interfere with normal terminal commands', async ({ page }) => {
    await page.goto('http://localhost:3456', { waitUntil: 'networkidle' });
    await page.waitForSelector('.xterm', { timeout: 10000 });
    await page.waitForTimeout(2000);

    await page.click('.xterm');
    await page.waitForTimeout(500);

    // Type a normal command (not starting with /)
    console.log('[Test] Typing normal command: echo hello');
    await page.keyboard.type('echo hello');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const terminalText = await page.evaluate(() => {
      const xterm = document.querySelector('.xterm');
      return xterm ? xterm.textContent : '';
    });

    // Should execute normally and echo back
    expect(terminalText).toContain('echo hello');
    expect(terminalText).toContain('hello');

    console.log('[Test] ✓ Normal commands work without interference');
  });
});
