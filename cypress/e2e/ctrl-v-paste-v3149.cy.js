/// <reference types="cypress" />
/// <reference types="cypress-real-events" />

/**
 * Ctrl+V Native Paste Validation Test (v3.14.9)
 *
 * This test validates the ROBUST paste fix where:
 * 1. Ctrl+V returns true (lets event propagate)
 * 2. Browser triggers native paste event
 * 3. handlePaste listener catches it via e.clipboardData
 *
 * Tests both synthetic paste events AND real Ctrl+V key presses
 * per copilot-instructions.md requirements.
 */

describe('Ctrl+V Native Paste - v3.14.9 Fix', () => {
  beforeEach(() => {
    cy.visit('http://localhost:9999');
    cy.waitForTerminal(30000);
    cy.wait(2000);
  });

  describe('Synthetic Paste Events (tests handlePaste handler)', () => {
    it('should handle text paste via paste event', () => {
      const testText = `native-paste-test-${Date.now()}`;

      // Focus terminal
      cy.get('.xterm-helper-textarea').first().focus();
      cy.wait(500);

      // Dispatch synthetic paste event to test the handler
      cy.window().then((win) => {
        const textarea = win.document.querySelector('.xterm-helper-textarea');
        if (!textarea) throw new Error('Terminal textarea not found');

        const dt = new win.DataTransfer();
        dt.setData('text/plain', testText);

        const pasteEvent = new win.ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });

        // Dispatch to textarea (where native paste events fire)
        textarea.dispatchEvent(pasteEvent);
        cy.log('Synthetic paste event dispatched');
      });

      cy.wait(1500);

      // Verify text appears in terminal buffer
      cy.window().then((win) => {
        const buffer = win.term.buffer.active;
        let fullText = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
        cy.log('Text found in buffer:', fullText.includes(testText));
        expect(fullText).to.include(testText);
      });

      cy.screenshot('v3.14.9-text-paste-synthetic');
    });

    it('should handle image paste via paste event', () => {
      cy.get('.xterm-helper-textarea').first().focus();
      cy.wait(500);

      cy.window().then(async (win) => {
        const textarea = win.document.querySelector('.xterm-helper-textarea');
        if (!textarea) throw new Error('Terminal textarea not found');

        // Create test image
        const canvas = win.document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(0, 0, 200, 200);
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.fillText('v3.14.9 TEST', 45, 100);

        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            const dt = new win.DataTransfer();
            const file = new win.File([blob], 'test-v3149.png', { type: 'image/png' });
            dt.items.add(file);

            const pasteEvent = new win.ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
            });

            textarea.dispatchEvent(pasteEvent);
            cy.log('Image paste event dispatched');
            resolve();
          }, 'image/png');
        });
      });

      cy.wait(4000);

      // Verify "see file at" appears
      cy.window().then((win) => {
        const buffer = win.term.buffer.active;
        let fullText = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
        cy.log('Image path found:', fullText.includes('see file at'));
        expect(fullText).to.include('see file at');
      });

      cy.screenshot('v3.14.9-image-paste-synthetic');
    });
  });

  describe('Real Ctrl+V Key Press (tests full flow)', () => {
    it('should paste text via real Ctrl+V key press', () => {
      const testText = `realkey-paste-${Date.now()}`;

      // First, copy text to clipboard using navigator API
      cy.window().then(async (win) => {
        await win.navigator.clipboard.writeText(testText);
        cy.log('Text written to clipboard');
      });

      // Focus terminal
      cy.get('.xterm-helper-textarea').first().focus();
      cy.wait(500);

      // Press real Ctrl+V
      cy.realPress(['Control', 'V']);
      cy.log('Real Ctrl+V pressed');

      cy.wait(1500);

      // Verify text appears in terminal
      cy.window().then((win) => {
        const buffer = win.term.buffer.active;
        let fullText = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
        cy.log('Real Ctrl+V result - text found:', fullText.includes(testText));
        expect(fullText).to.include(testText);
      });

      cy.screenshot('v3.14.9-text-paste-real-ctrlv');
    });

    it('should paste image via real Ctrl+V key press', () => {
      // Write image to clipboard
      cy.window().then(async (win) => {
        const canvas = win.document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(0, 0, 200, 200);
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.fillText('REAL Ctrl+V', 50, 100);
        ctx.fillText(Date.now().toString(), 40, 130);

        return new Promise((resolve) => {
          canvas.toBlob(async (blob) => {
            const item = new win.ClipboardItem({ 'image/png': blob });
            await win.navigator.clipboard.write([item]);
            cy.log('Image written to clipboard');
            resolve();
          }, 'image/png');
        });
      });

      // Focus terminal
      cy.get('.xterm-helper-textarea').first().focus();
      cy.wait(500);

      // Press real Ctrl+V
      cy.realPress(['Control', 'V']);
      cy.log('Real Ctrl+V pressed for image');

      cy.wait(4000);

      // Verify "see file at" appears
      cy.window().then((win) => {
        const buffer = win.term.buffer.active;
        let fullText = '';
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
        cy.log('Real Ctrl+V image result:', fullText.includes('see file at'));
        expect(fullText).to.include('see file at');
      });

      cy.screenshot('v3.14.9-image-paste-real-ctrlv');
    });
  });

  describe('Reliability - 10 Consecutive Pastes', () => {
    it('should handle 10 consecutive text pastes without failure', () => {
      const results = [];

      Cypress._.times(10, (i) => {
        const iteration = i + 1;
        const testText = `iter-${iteration}-${Date.now()}`;

        // Write to clipboard
        cy.window().then(async (win) => {
          await win.navigator.clipboard.writeText(testText);
        });

        // Focus and paste
        cy.get('.xterm-helper-textarea').first().focus();
        cy.realPress(['Control', 'V']);
        cy.wait(1000);

        // Verify
        cy.window().then((win) => {
          const buffer = win.term.buffer.active;
          let fullText = '';
          for (let i = 0; i < buffer.length; i++) {
            const line = buffer.getLine(i);
            if (line) {
              fullText += line.translateToString(true) + '\n';
            }
          }
          const success = fullText.includes(`iter-${iteration}`);
          results.push({ iteration, success });
          cy.log(`Iteration ${iteration}: ${success ? 'PASS' : 'FAIL'}`);
        });

        // Press Enter to execute and clear
        cy.realPress('Enter');
        cy.wait(500);
      });

      // Final verification - require 100% success for robustness
      cy.wrap(null).then(() => {
        const passCount = results.filter((r) => r.success).length;
        cy.log(`Final results: ${passCount}/10 passed`);
        expect(passCount).to.equal(10);
      });

      cy.screenshot('v3.14.9-10x-reliability');
    });
  });
});
