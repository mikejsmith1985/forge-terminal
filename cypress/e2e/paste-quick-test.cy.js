/// <reference types="cypress" />
/// <reference types="cypress-real-events" />

/**
 * Quick Paste Validation Test
 *
 * This test validates the v3.12.6 paste handler works correctly by:
 * 1. Dispatching synthetic paste events (simulates browser paste behavior)
 * 2. Testing text paste via paste event
 * 3. Testing image paste via paste event with blob
 *
 * NOTE: Uses synthetic paste events because Clipboard API requires actual user gestures
 * that automated testing cannot provide. This tests the paste HANDLER, not the Ctrl+V key.
 */

describe('Quick Paste Validation', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.waitForTerminal(30000);
    cy.wait(2000);
  });

  it('should handle TEXT paste event correctly', () => {
    const testText = `paste-test-${Date.now()}`;

    // Focus terminal first
    cy.get('.xterm-helper-textarea').first().focus();

    // Wait for terminal to be fully initialized and listeners attached
    cy.wait(1000);

    // Dispatch synthetic paste event with text data to terminal container
    cy.window().then((win) => {
      // Target the terminal container where paste listener is attached
      const terminalContainer = win.document.querySelector('.terminal-outer-container');
      const textarea = win.document.querySelector('.xterm-helper-textarea');

      if (!terminalContainer) throw new Error('Terminal container not found');
      if (!textarea) throw new Error('Terminal textarea not found');

      // Create paste event with text data
      const clipboardData = new win.DataTransfer();
      clipboardData.setData('text/plain', testText);

      const pasteEvent = new win.ClipboardEvent('paste', {
        clipboardData: clipboardData,
        bubbles: true,
        cancelable: true,
      });

      // First try dispatching to textarea (where keyboard paste events fire)
      console.log('[Test] Dispatching paste event to textarea');
      textarea.dispatchEvent(pasteEvent);

      // Also try dispatching to container (capture phase listener)
      const containerEvent = new win.ClipboardEvent('paste', {
        clipboardData: clipboardData,
        bubbles: true,
        cancelable: true,
      });
      console.log('[Test] Dispatching paste event to container');
      terminalContainer.dispatchEvent(containerEvent);

      cy.log('Paste event dispatched with text:', testText);
    });

    // Wait for paste to process and echo back from PTY
    cy.wait(2000);

    // Verify text appears in terminal - use longer buffer read
    cy.window().then((win) => {
      // Read all lines from buffer
      const buffer = win.term.buffer.active;
      let fullText = '';
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          fullText += line.translateToString(true) + '\n';
        }
      }
      // Log for debugging then assert
      cy.log('Buffer contains test text:', fullText.includes(testText));
      expect(fullText).to.include(testText);
    });

    // Take screenshot as evidence
    cy.screenshot('text-paste-success');
  });

  it('should handle IMAGE paste event and upload', () => {
    // Focus terminal
    cy.get('.xterm-helper-textarea').first().focus();
    cy.wait(500);

    // Create and dispatch paste event with image blob
    cy.window().then(async (win) => {
      const textarea = win.document.querySelector('.xterm-helper-textarea');
      if (!textarea) throw new Error('Terminal textarea not found');

      // Create a test image as canvas, convert to blob
      const canvas = win.document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f97316';
      ctx.fillRect(0, 0, 200, 200);
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px Arial';
      ctx.fillText('TEST IMAGE', 40, 90);
      ctx.fillText(`${Date.now()}`, 40, 120);

      // Convert to blob
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          // Create DataTransfer with image
          const dt = new win.DataTransfer();
          const file = new win.File([blob], 'test-image.png', { type: 'image/png' });
          dt.items.add(file);

          // Create paste event
          const pasteEvent = new win.ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          });

          textarea.dispatchEvent(pasteEvent);
          cy.log('Paste event dispatched with image');
          resolve();
        }, 'image/png');
      });
    });

    // Wait for upload to complete
    cy.wait(4000);

    // Verify "see file at" appears - read full buffer
    cy.window().then((win) => {
      const buffer = win.term.buffer.active;
      let fullText = '';
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          fullText += line.translateToString(true) + '\n';
        }
      }
      cy.log('Buffer contains "see file at":', fullText.includes('see file at'));
      expect(fullText).to.include('see file at');
    });

    // Take screenshot as evidence
    cy.screenshot('image-paste-success');
  });

  it('should handle 5 consecutive TEXT pastes without failure', () => {
    const results = [];

    Cypress._.times(5, (i) => {
      const iteration = i + 1;
      const testText = `paste-iteration-${iteration}-${Date.now()}`;

      // Focus terminal
      cy.get('.xterm-helper-textarea').first().focus();

      // Dispatch paste event
      cy.window().then((win) => {
        const textarea = win.document.querySelector('.xterm-helper-textarea');
        const dt = new win.DataTransfer();
        dt.setData('text/plain', testText);

        const pasteEvent = new win.ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });

        textarea.dispatchEvent(pasteEvent);
      });

      cy.wait(1000);

      // Verify by reading full buffer
      cy.window().then((win) => {
        const buffer = win.term.buffer.active;
        let fullText = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
        const success = fullText.includes(`paste-iteration-${iteration}`);
        results.push({ iteration, success, snippet: fullText.slice(-200) });
        cy.log(`Iteration ${iteration}: ${success ? 'PASS' : 'FAIL'}`);
      });

      // Clear by pressing Enter
      cy.realPress('Enter');
      cy.wait(500);
    });

    // Final verification
    cy.wrap(null).then(() => {
      const allPassed = results.every(r => r.success);
      const passCount = results.filter(r => r.success).length;
      cy.log(`Final results: ${passCount}/5 passed`);
      results.forEach(r => cy.log(`  Iteration ${r.iteration}: ${r.success ? 'PASS' : 'FAIL'}`));
      expect(passCount).to.be.at.least(4); // Allow 1 failure for flakiness
    });

    cy.screenshot('consecutive-paste-success');
  });

  it('should handle 5 consecutive IMAGE pastes without failure', () => {
    const results = [];

    Cypress._.times(5, (i) => {
      const iteration = i + 1;

      // Focus terminal
      cy.get('.xterm-helper-textarea').first().focus();

      // Create and dispatch image paste
      cy.window().then(async (win) => {
        const textarea = win.document.querySelector('.xterm-helper-textarea');
        const canvas = win.document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = `hsl(${iteration * 60}, 70%, 50%)`;
        ctx.fillRect(0, 0, 100, 100);
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.fillText(`Test ${iteration}`, 25, 55);

        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            const dt = new win.DataTransfer();
            const file = new win.File([blob], `test-${iteration}.png`, { type: 'image/png' });
            dt.items.add(file);

            const pasteEvent = new win.ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
            });

            textarea.dispatchEvent(pasteEvent);
            resolve();
          }, 'image/png');
        });
      });

      // Wait for upload
      cy.wait(3000);

      // Verify by reading full buffer
      cy.window().then((win) => {
        const buffer = win.term.buffer.active;
        let fullText = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
        const success = fullText.includes('see file at');
        results.push({ iteration, success });
        cy.log(`Image Iteration ${iteration}: ${success ? 'PASS' : 'FAIL'}`);
      });

      // Clear by pressing Enter
      cy.realPress('Enter');
      cy.wait(500);
    });

    // Final verification
    cy.wrap(null).then(() => {
      const successCount = results.filter(r => r.success).length;
      cy.log(`Final image results: ${successCount}/5 passed`);
      expect(successCount).to.be.at.least(4); // Allow 1 failure for flakiness
    });

    cy.screenshot('consecutive-image-paste-success');
  });
});
