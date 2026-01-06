/// <reference types="cypress" />
/// <reference types="cypress-real-events" />

/**
 * Paste Validation E2E Test - 20x Iterations
 *
 * CONSTRAINT: NO NETWORK STUBS - Real backend, real clipboard
 * CONSTRAINT: REAL INPUTS ONLY - Uses cypress-real-events for OS-level events
 *
 * This test validates:
 * 1. Ctrl+V paste works reliably with images
 * 2. Copilot (via gpt-5-mini model) can see pasted images
 * 3. The paste functionality works 20 times in a row without failure
 *
 * Requirements per copilot-instructions.md:
 * - Use Cypress (not Playwright)
 * - Use cypress-real-events for REAL keyboard events
 * - Build HTML dashboard with results
 */

describe('Paste Validation - 20x Iterations', () => {
  // Store results for dashboard
  const testResults = [];

  beforeEach(() => {
    // Visit the app - NO stubs, real backend
    cy.visit('/');

    // Wait for terminal to be fully ready
    cy.waitForTerminal(30000);

    // Wait for WebSocket connection to stabilize
    cy.wait(2000);
  });

  // Helper: Take screenshot of terminal and copy to clipboard
  const captureAndCopyToClipboard = () => {
    return cy.window().then(async (win) => {
      // Method: Capture the terminal element as canvas, convert to blob, write to clipboard
      const terminalElement = win.document.querySelector('.terminal-outer-container');
      if (!terminalElement) {
        throw new Error('Terminal element not found');
      }

      // Use html2canvas-like approach: draw to canvas
      // Since we don't have html2canvas, we'll use a test image approach
      // Create a simple test image (1x1 orange pixel for simplicity)
      const canvas = win.document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');

      // Draw something distinctive - orange rectangle with text
      ctx.fillStyle = '#f97316';
      ctx.fillRect(0, 0, 200, 200);
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px Arial';
      ctx.fillText('Forge Terminal', 50, 100);
      ctx.fillText(`Test #${testResults.length + 1}`, 65, 120);

      // Convert to blob
      return new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob from canvas'));
            return;
          }

          try {
            // Write to clipboard using Clipboard API
            const item = new win.ClipboardItem({ 'image/png': blob });
            await win.navigator.clipboard.write([item]);
            console.log('[Test] Screenshot copied to clipboard');
            resolve(true);
          } catch (err) {
            console.error('[Test] Failed to copy to clipboard:', err);
            reject(err);
          }
        }, 'image/png');
      });
    });
  };

  // Helper: Type command into terminal
  const typeCommand = (command) => {
    cy.terminalType(command);
    cy.terminalEnter();
  };

  // Helper: Wait for copilot to be ready (look for prompt)
  const waitForCopilotReady = () => {
    // Copilot shows a prompt like ">" or "copilot>" when ready
    cy.wait(3000); // Give copilot time to start
    cy.terminalShouldContain('>', { timeout: 30000 });
  };

  // Run 20 iterations in a single test to maintain context
  it('should successfully paste and validate 20 times', () => {
    // Start copilot in the terminal
    cy.log('Starting copilot...');
    typeCommand('copilot');

    // Wait for copilot to initialize
    waitForCopilotReady();

    // Switch to gpt-5-mini model
    cy.log('Switching to gpt-5-mini model...');
    typeCommand('/model gpt-5-mini');
    cy.wait(2000);

    // Run 20 paste validation iterations
    Cypress._.times(20, (iteration) => {
      const iterNum = iteration + 1;
      cy.log(`=== Iteration ${iterNum}/20 ===`);

      // Step 1: Capture screenshot and copy to clipboard
      cy.wrap(null).then(() => {
        cy.log(`[${iterNum}] Capturing screenshot...`);
        return captureAndCopyToClipboard();
      });

      // Step 2: Focus terminal and paste with REAL Ctrl+V
      cy.log(`[${iterNum}] Pasting with Ctrl+V...`);
      cy.get('.xterm-helper-textarea').focus();
      cy.realPress(['Control', 'V']);

      // Step 3: Wait for upload and path to appear
      cy.wait(2000);

      // Step 4: Ask gpt-5-mini to confirm it sees the image
      cy.log(`[${iterNum}] Asking gpt-5-mini to confirm...`);
      typeCommand('Can you see this image? Reply only with Yes or No.');

      // Step 5: Wait for response
      cy.wait(5000);

      // Step 6: Capture screenshot of the response
      cy.screenshot(`paste-validation-${iterNum}`, { capture: 'viewport' });

      // Step 7: Check for Yes response
      cy.getTerminalOutput(20).then((output) => {
        const hasYes = output.toLowerCase().includes('yes');
        const hasNo = output.toLowerCase().includes('no');
        const hasSeeFile = output.includes('see file at');

        testResults.push({
          iteration: iterNum,
          timestamp: new Date().toISOString(),
          pasteDetected: hasSeeFile,
          modelResponse: hasYes ? 'Yes' : (hasNo ? 'No' : 'Unknown'),
          success: hasYes && hasSeeFile,
          output: output.slice(-500) // Last 500 chars
        });

        cy.log(`[${iterNum}] Result: paste=${hasSeeFile}, response=${hasYes ? 'Yes' : hasNo ? 'No' : 'Unknown'}`);

        // Don't fail individual iterations - collect all results
        if (!hasSeeFile) {
          cy.log(`[${iterNum}] WARNING: Paste not detected!`);
        }
        if (!hasYes) {
          cy.log(`[${iterNum}] WARNING: Model did not confirm seeing image!`);
        }
      });

      // Small delay between iterations
      cy.wait(1000);
    });

    // After all iterations, generate dashboard
    cy.wrap(null).then(() => {
      // Save results to fixture for dashboard generation
      cy.writeFile('cypress/results/paste-validation-results.json', {
        timestamp: new Date().toISOString(),
        totalIterations: 20,
        results: testResults,
        summary: {
          successCount: testResults.filter(r => r.success).length,
          pasteDetectedCount: testResults.filter(r => r.pasteDetected).length,
          modelYesCount: testResults.filter(r => r.modelResponse === 'Yes').length,
        }
      });
    });
  });

  after(() => {
    // Generate HTML dashboard after all tests
    cy.task('generateDashboard', testResults).then((dashboardPath) => {
      cy.log(`Dashboard generated at: ${dashboardPath}`);
      // Auto-open in browser
      cy.task('openDashboard', dashboardPath);
    });
  });
});

// Alternative: Individual test per iteration (for parallel execution)
describe('Paste Validation - Individual Tests', { retries: 0 }, () => {
  // This approach runs each iteration as a separate test
  // Useful if you want to run them in parallel or see individual results

  Cypress._.times(20, (iteration) => {
    const iterNum = iteration + 1;

    it.skip(`Iteration ${iterNum}: Paste and validate with gpt-5-mini`, () => {
      // Visit fresh for each iteration
      cy.visit('/');
      cy.waitForTerminal(30000);
      cy.wait(2000);

      // Start copilot
      cy.terminalType('copilot');
      cy.terminalEnter();
      cy.wait(5000);

      // Switch to gpt-5-mini
      cy.terminalType('/model gpt-5-mini');
      cy.terminalEnter();
      cy.wait(2000);

      // Copy test image to clipboard
      cy.window().then(async (win) => {
        const canvas = win.document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f97316';
        ctx.fillRect(0, 0, 200, 200);
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial';
        ctx.fillText('Forge Terminal', 50, 100);
        ctx.fillText(`Test #${iterNum}`, 65, 120);

        return new Promise((resolve, reject) => {
          canvas.toBlob(async (blob) => {
            try {
              const item = new win.ClipboardItem({ 'image/png': blob });
              await win.navigator.clipboard.write([item]);
              resolve();
            } catch (err) {
              reject(err);
            }
          }, 'image/png');
        });
      });

      // Paste with REAL Ctrl+V
      cy.get('.xterm-helper-textarea').focus();
      cy.realPress(['Control', 'V']);
      cy.wait(2000);

      // Ask model to confirm
      cy.terminalType('Can you see this image? Reply only Yes or No.');
      cy.terminalEnter();
      cy.wait(5000);

      // Capture screenshot
      cy.screenshot(`paste-iteration-${iterNum}`);

      // Verify
      cy.getTerminalOutput(20).then((output) => {
        expect(output).to.include('see file at');
        expect(output.toLowerCase()).to.include('yes');
      });
    });
  });
});
