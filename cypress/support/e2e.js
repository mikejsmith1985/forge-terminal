// Cypress E2E Support File
// https://on.cypress.io/configuration

// Import cypress-real-events for REAL keyboard/mouse events
import 'cypress-real-events';

// Skip tour in all tests by setting localStorage before visit
// This prevents the "Welcome to Forge Terminal" modal from blocking tests
Cypress.Commands.add('skipTour', () => {
  cy.window().then((win) => {
    // Set the tour as completed to skip it
    win.localStorage.setItem('forge_tour_completed', 'v3.4.0');
    // Also set to skip any future version checks
    win.localStorage.setItem('forge_tour_version', 'v999.0.0');
  });
});

// Custom command: Get terminal output from xterm buffer
// This reads the actual terminal buffer, not DOM text (which is hidden in canvas)
Cypress.Commands.add('getTerminalOutput', (lineCount = 10) => {
  return cy.window().then((win) => {
    if (!win.term) {
      throw new Error('Terminal not exposed. Ensure window.term is set in test environment.');
    }
    
    const buffer = win.term.buffer.active;
    const lines = [];
    const startLine = Math.max(0, buffer.length - lineCount);
    
    for (let i = startLine; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        lines.push(line.translateToString(true));
      }
    }
    
    return lines.join('\n');
  });
});

// Custom command: Wait for terminal to be ready
Cypress.Commands.add('waitForTerminal', (timeout = 30000) => {
  // Wait for the xterm element to exist first
  cy.get('.xterm', { timeout }).should('exist');
  
  // Click Skip Tour button if it appears
  cy.get('body').then(($body) => {
    const skipButton = $body.find('button').filter(':contains("Skip Tour")');
    if (skipButton.length > 0) {
      cy.wrap(skipButton).click({ force: true });
      cy.wait(500);
    }
  });
  
  // Then wait for window.term to be set
  return cy.window({ timeout }).should((win) => {
    if (win.term && win.term.buffer && win.term.buffer.active) {
      expect(win.term).to.exist;
    } else {
      throw new Error('Terminal not ready yet');
    }
  });
});

// Custom command: Visit app with tour skipped
Cypress.Commands.add('visitWithoutTour', (url = '/') => {
  cy.visit(url, {
    onBeforeLoad(win) {
      // Use tour_disabled which is checked first (line 59) and returns early
      win.localStorage.setItem('tour_disabled', 'true');
    }
  });
});

// Custom command: Type into terminal using REAL keyboard events
// This uses cypress-real-events for OS-level key simulation
Cypress.Commands.add('terminalType', (text) => {
  return cy.get('.xterm-helper-textarea').realType(text);
});

// Custom command: Paste using REAL Ctrl+V
// FORBIDDEN: .trigger('paste') - that's fake
// REQUIRED: cy.realPress(['Control', 'V'])
Cypress.Commands.add('terminalPaste', () => {
  return cy.get('.xterm-helper-textarea').focus().realPress(['Control', 'V']);
});

// Custom command: Send Enter key
Cypress.Commands.add('terminalEnter', () => {
  return cy.get('.xterm-helper-textarea').realPress('Enter');
});

// Custom command: Wait for text to appear in terminal buffer
Cypress.Commands.add('terminalShouldContain', (text, options = {}) => {
  const { timeout = 10000, interval = 500 } = options;
  
  return cy.window().should((win) => {
    if (!win.term) {
      throw new Error('Terminal not exposed');
    }
    
    const buffer = win.term.buffer.active;
    let fullText = '';
    
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        fullText += line.translateToString(true) + '\n';
      }
    }
    
    expect(fullText).to.include(text);
  }, { timeout });
});

// Anti-flake: Wait for WebSocket connection
Cypress.Commands.add('waitForConnection', (timeout = 15000) => {
  return cy.window({ timeout }).should((win) => {
    // Check if terminal exists and is connected
    const forgeApp = win.__FORGE_APP__;
    if (forgeApp && forgeApp.isConnected) {
      expect(forgeApp.isConnected()).to.be.true;
    }
  });
});
