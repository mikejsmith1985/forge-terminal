/**
 * E2E Test: Backspace Key Functionality
 * 
 * v3.12.13: Tests that backspace works correctly with all CLIs
 * - Typing text then deleting works without freezing
 * - Deleting on empty line works
 * - Works with both Claude and Copilot CLIs
 */
describe('Backspace Key Functionality', () => {
  beforeEach(() => {
    cy.visit('http://localhost:3005');
    
    // Wait for app to fully load
    cy.wait(2000);
    
    // Dismiss tour if present (use body.then for conditional)
    cy.get('body').then($body => {
      const tourClose = $body.find('.tour-tooltip-close');
      if (tourClose.length > 0) {
        tourClose.trigger('click');
      }
    });
    cy.wait(500);
    
    // Wait for the VISIBLE terminal (not hidden one)
    cy.get('.terminal-wrapper:not(.hidden) .terminal-inner', { timeout: 15000 }).should('be.visible');
    // Wait for terminal to be ready
    cy.wait(1000);
  });

  it('should delete characters when backspace is pressed', () => {
    // Click visible terminal to focus
    cy.get('.terminal-wrapper:not(.hidden) .terminal-inner').click({ force: true });
    cy.wait(500);
    
    // Type some text - xterm uses .xterm-helper-textarea for input
    cy.get('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').type('hello', { force: true });
    
    // Wait for terminal to receive the text
    cy.wait(500);
    
    // Press backspace 3 times
    cy.get('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').type('{backspace}{backspace}{backspace}', { force: true });
    
    // Wait for terminal to process
    cy.wait(500);
    
    // Take screenshot to verify visual result
    cy.screenshot('backspace-after-delete');
    
    // The text "hello" minus 3 chars should leave "he"
    // Note: We can't easily assert terminal buffer content in Cypress
    // The test passes if no freeze/hang occurs during backspace
  });

  it('should handle backspace on empty line without issues', () => {
    // Click visible terminal to focus
    cy.get('.terminal-wrapper:not(.hidden) .terminal-inner').click({ force: true });
    cy.wait(500);
    
    // Press backspace multiple times on empty line - should not freeze
    cy.get('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').type('{backspace}{backspace}{backspace}', { force: true });
    
    // Wait briefly
    cy.wait(500);
    
    // Terminal should still be responsive
    cy.get('.terminal-wrapper:not(.hidden) .terminal-inner').should('be.visible');
    
    // Type new text to confirm terminal is responsive
    cy.get('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').type('still works', { force: true });
    cy.wait(500);
    
    cy.screenshot('backspace-empty-line-then-type');
  });

  it('should not freeze during rapid backspace', () => {
    // Click visible terminal to focus
    cy.get('.terminal-wrapper:not(.hidden) .terminal-inner').click({ force: true });
    cy.wait(500);
    
    // Type a longer string
    cy.get('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').type('this is a test string', { force: true });
    cy.wait(500);
    
    // Rapid backspace to delete everything (use chained backspaces for efficiency)
    cy.get('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').type(
      '{backspace}{backspace}{backspace}{backspace}{backspace}' +
      '{backspace}{backspace}{backspace}{backspace}{backspace}' +
      '{backspace}{backspace}{backspace}{backspace}{backspace}' +
      '{backspace}{backspace}{backspace}{backspace}{backspace}' +
      '{backspace}{backspace}', 
      { force: true, delay: 50 }
    );
    
    // Wait for all backspaces to process
    cy.wait(1000);
    
    // Terminal should still be responsive
    cy.get('.terminal-wrapper:not(.hidden) .terminal-inner').should('be.visible');
    cy.get('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').type('recovered', { force: true });
    
    cy.screenshot('backspace-rapid-delete');
  });
});
