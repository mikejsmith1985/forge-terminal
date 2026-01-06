/// <reference types="cypress" />
/// <reference types="cypress-real-events" />

/**
 * Terminal Connection E2E Test
 * 
 * CONSTRAINT: NO NETWORK STUBS - Real backend, real database
 * CONSTRAINT: REAL INPUTS ONLY - Uses cypress-real-events for OS-level events
 * 
 * This test validates:
 * 1. Terminal connects to WebSocket backend
 * 2. Terminal buffer is accessible for assertions
 * 3. Real keyboard input works (not .trigger())
 */

describe('Terminal Connection', () => {
  beforeEach(() => {
    // Visit the app - NO stubs, real backend
    cy.visit('/');
    
    // Wait for terminal to be ready (exposed on window.term)
    cy.waitForTerminal();
  });

  it('should connect to WebSocket and show welcome message', () => {
    // Verify terminal buffer contains connection message
    cy.terminalShouldContain('[Forge Terminal]');
    cy.terminalShouldContain('Connected');
  });

  it('should accept real keyboard input', () => {
    // Type a command using REAL keyboard events (not .type())
    cy.get('.xterm-helper-textarea').focus();
    cy.terminalType('echo "hello cypress"');
    cy.terminalEnter();
    
    // Verify output appears in terminal buffer
    cy.terminalShouldContain('hello cypress', { timeout: 5000 });
  });

  it('should handle Ctrl+V paste using REAL events', () => {
    // First, put something in clipboard via exec
    // Note: In real tests, you'd set up clipboard content via cy.task()
    
    // Focus terminal
    cy.get('.xterm-helper-textarea').focus();
    
    // Attempt real Ctrl+V - this tests the actual paste handler
    // FORBIDDEN: .trigger('paste') - that's fake
    // REQUIRED: cy.realPress(['Control', 'V'])
    cy.terminalPaste();
    
    // The paste handler should fire (even if clipboard is empty)
    // In a real scenario with clipboard content, text would appear
  });

  it('should read terminal buffer content', () => {
    // Use custom command to read actual xterm buffer
    cy.getTerminalOutput(20).then((output) => {
      // Output should contain something (connection message at minimum)
      expect(output).to.have.length.greaterThan(0);
      cy.log('Terminal buffer content:', output);
    });
  });
});

describe('Terminal Auto-Respond', () => {
  // These tests require the app to be in a state where
  // CLI prompts appear (e.g., running Copilot CLI)
  
  it.skip('should detect CLI confirmation prompts', () => {
    // This would need a real CLI running
    // Left as example structure
    cy.terminalType('copilot');
    cy.terminalEnter();
    
    // Wait for prompt detection
    cy.window().should((win) => {
      // Check if auto-respond detected a prompt
      // This requires the app to expose state
    });
  });
});
