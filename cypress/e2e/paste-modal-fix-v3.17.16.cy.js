/// <reference types="cypress" />
/// <reference types="cypress-real-events" />

/**
 * Ctrl+V Paste Fix v3.17.16 - Modal Interference Bug
 *
 * Problem: FeedbackModal's document-level paste listener was intercepting
 * ALL paste events when modal was open, preventing terminal paste.
 *
 * Fix: Modal now checks if paste target is inside modal before handling.
 *
 * Tests:
 * 1. Ctrl+V in terminal works normally (baseline)
 * 2. Ctrl+V in terminal still works when modal is open (the fix)
 * 3. Ctrl+V in active tab doesn't paste to other tabs (multi-tab routing)
 */

describe('Paste Modal Fix v3.17.16', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.waitForTerminal(30000);
    cy.wait(2000);
  });

  it('should paste to terminal normally (baseline)', () => {
    const testText = `baseline-${Date.now()}`;

    // Write to clipboard
    cy.window().then(async (win) => {
      await win.navigator.clipboard.writeText(testText);
      cy.log('Clipboard written:', testText);
    });

    // Focus terminal and paste
    cy.get('.xterm-helper-textarea').first().focus();
    cy.wait(500);
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
      cy.log('Terminal buffer:', fullText);
      expect(fullText).to.include(testText);
    });

    cy.screenshot('v3.17.16-baseline-paste');
  });

  it('should paste to terminal even when feedback modal is open', () => {
    const testText = `modal-open-${Date.now()}`;

    // Open feedback modal
    cy.window().then((win) => {
      // Trigger modal open via keyboard shortcut or button
      // Assuming Ctrl+Shift+F opens feedback modal
      cy.get('body').type('{ctrl}{shift}f');
      cy.wait(1000);
    });

    // Verify modal is open
    cy.get('.modal-overlay').should('be.visible');
    cy.log('Feedback modal opened');

    // Write to clipboard
    cy.window().then(async (win) => {
      await win.navigator.clipboard.writeText(testText);
      cy.log('Clipboard written:', testText);
    });

    // Focus terminal (click on it to ensure focus)
    cy.get('.xterm-helper-textarea').first().click({ force: true }).focus();
    cy.wait(500);

    // Paste with Ctrl+V
    cy.realPress(['Control', 'V']);
    cy.log('Real Ctrl+V pressed with modal open');
    cy.wait(1500);

    // Verify text appears in terminal (NOT intercepted by modal)
    cy.window().then((win) => {
      const buffer = win.term.buffer.active;
      let fullText = '';
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          fullText += line.translateToString(true) + '\n';
        }
      }
      cy.log('Terminal buffer with modal open:', fullText);
      expect(fullText).to.include(testText);
    });

    cy.screenshot('v3.17.16-modal-open-paste');

    // Close modal
    cy.get('.btn-close').first().click();
  });

  it('should paste only to active tab in multi-tab scenario', () => {
    const testText = `tab-routing-${Date.now()}`;

    // Create 3 tabs
    cy.get('.tab-bar').should('exist');
    
    // Add second tab
    cy.get('.tab-plus').click();
    cy.wait(1000);
    
    // Add third tab
    cy.get('.tab-plus').click();
    cy.wait(1000);

    // Verify we have 3 tabs
    cy.get('.tab').should('have.length', 3);
    cy.log('3 tabs created');

    // Click on middle tab (tab 2) to make it active
    cy.get('.tab').eq(1).click();
    cy.wait(500);

    // Verify tab 2 is active
    cy.get('.tab').eq(1).should('have.class', 'active');
    cy.log('Tab 2 is active');

    // Write to clipboard
    cy.window().then(async (win) => {
      await win.navigator.clipboard.writeText(testText);
    });

    // Focus terminal in active tab
    cy.get('.terminal-wrapper').eq(1).find('.xterm-helper-textarea').focus();
    cy.wait(500);

    // Paste with real Ctrl+V
    cy.realPress(['Control', 'V']);
    cy.log('Real Ctrl+V pressed in tab 2');
    cy.wait(1500);

    // Verify text appears ONLY in tab 2 (active tab)
    cy.window().then((win) => {
      // Check all terminal instances
      const terminals = win.document.querySelectorAll('.terminal-wrapper');
      
      terminals.forEach((termWrapper, idx) => {
        const terminalInstance = termWrapper.__terminal;
        if (terminalInstance) {
          const buffer = terminalInstance.buffer.active;
          let fullText = '';
          for (let i = 0; i < buffer.length; i++) {
            const line = buffer.getLine(i);
            if (line) {
              fullText += line.translateToString(true) + '\n';
            }
          }
          
          const hasText = fullText.includes(testText);
          cy.log(`Tab ${idx + 1} has text: ${hasText}`);
          
          // Only tab 2 (index 1) should have the text
          if (idx === 1) {
            expect(hasText).to.be.true;
          } else {
            expect(hasText).to.be.false;
          }
        }
      });
    });

    cy.screenshot('v3.17.16-multi-tab-routing');
  });

  it('should handle 5 consecutive pastes with modal interference', () => {
    const results = [];

    Cypress._.times(5, (i) => {
      const iteration = i + 1;
      const testText = `iter-${iteration}-${Date.now()}`;

      // Every other iteration, toggle modal open/closed
      if (iteration % 2 === 0) {
        cy.get('body').type('{ctrl}{shift}f');
        cy.wait(500);
        cy.log(`Iteration ${iteration}: Modal opened`);
      } else if (iteration > 1) {
        cy.get('.btn-close').first().click();
        cy.wait(500);
        cy.log(`Iteration ${iteration}: Modal closed`);
      }

      // Write to clipboard
      cy.window().then(async (win) => {
        await win.navigator.clipboard.writeText(testText);
      });

      // Focus terminal and paste
      cy.get('.xterm-helper-textarea').first().click({ force: true }).focus();
      cy.wait(300);
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

      // Clear line
      cy.realPress('Enter');
      cy.wait(300);
    });

    // Final verification - require 100% success
    cy.wrap(null).then(() => {
      const passCount = results.filter((r) => r.success).length;
      cy.log(`Final results: ${passCount}/5 passed`);
      expect(passCount).to.equal(5);
    });

    // Close modal if open
    cy.get('body').then(($body) => {
      if ($body.find('.modal-overlay').length > 0) {
        cy.get('.btn-close').first().click();
      }
    });

    cy.screenshot('v3.17.16-modal-interference-5x');
  });
});
