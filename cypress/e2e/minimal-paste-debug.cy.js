/// <reference types="cypress" />

/**
 * Minimal Paste Debug Test
 * Tests if paste works via multiple approaches
 */

describe('Minimal Paste Debug', () => {
  it('should paste text via xterm.paste() directly', () => {
    cy.visitWithoutTour('/');
    cy.waitForTerminal(30000);
    cy.wait(2000);

    const testText = `direct-paste-${Date.now()}`;

    // Use xterm's built-in paste method via window.term
    cy.window().then((win) => {
      expect(win.term, 'window.term should exist').to.exist;
      expect(win.term.paste, 'term.paste should be a function').to.be.a('function');
      
      console.log('[Test] Calling win.term.paste() with:', testText);
      win.term.paste(testText);
    });

    cy.wait(1000);

    // Verify paste worked
    cy.window().then((win) => {
      const buffer = win.term.buffer.active;
      let fullText = '';
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) fullText += line.translateToString(true) + '\n';
      }
      
      console.log('[Test] Terminal buffer:', fullText);
      expect(fullText).to.include(testText);
    });

    cy.screenshot('direct-paste-test');
  });

  it('should paste text via synthetic paste event on document', () => {
    cy.visitWithoutTour('/');
    cy.waitForTerminal(30000);
    cy.wait(2000);

    const testText = `paste-event-${Date.now()}`;

    // Focus terminal
    cy.get('.xterm-helper-textarea').first().focus();
    cy.wait(500);

    // Dispatch paste event to document (our fallback listener)
    cy.window().then((win) => {
      const dt = new win.DataTransfer();
      dt.setData('text/plain', testText);

      const pasteEvent = new win.ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });

      console.log('[Test] Dispatching paste event to document');
      win.document.dispatchEvent(pasteEvent);
    });

    cy.wait(2000);

    // Verify paste worked
    cy.window().then((win) => {
      const buffer = win.term.buffer.active;
      let fullText = '';
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) fullText += line.translateToString(true) + '\n';
      }
      
      console.log('[Test] Terminal buffer:', fullText);
      expect(fullText).to.include(testText);
    });

    cy.screenshot('paste-event-test');
  });

  it('should paste text via Ctrl+V with realPress', () => {
    cy.visitWithoutTour('/');
    cy.waitForTerminal(30000);
    cy.wait(2000);

    const testText = `ctrlv-test-${Date.now()}`;

    // Focus terminal
    cy.get('.xterm-helper-textarea').first().focus();
    cy.wait(500);

    // Write to clipboard using Clipboard API
    cy.window().then(async (win) => {
      try {
        await win.navigator.clipboard.writeText(testText);
        console.log('[Test] Wrote to clipboard via API:', testText);
      } catch (e) {
        // Fallback: use execCommand
        const input = win.document.createElement('textarea');
        input.value = testText;
        win.document.body.appendChild(input);
        input.select();
        win.document.execCommand('copy');
        win.document.body.removeChild(input);
        console.log('[Test] Wrote to clipboard via execCommand:', testText);
      }
    });

    cy.wait(500);

    // Focus terminal again
    cy.get('.xterm-helper-textarea').first().focus();
    cy.wait(500);

    // Use realPress for Ctrl+V - this tests real keyboard handling
    cy.realPress(['Control', 'v']);

    cy.wait(2000);

    // Verify paste worked
    cy.window().then((win) => {
      const buffer = win.term.buffer.active;
      let fullText = '';
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) fullText += line.translateToString(true) + '\n';
      }
      
      console.log('[Test] Terminal buffer after Ctrl+V:', fullText);
      expect(fullText).to.include(testText);
    });

    cy.screenshot('ctrlv-realpress-test');
  });
});
