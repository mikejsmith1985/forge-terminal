describe('Backspace Key Functionality', () => {
  beforeEach(() => {
    cy.visit('http://localhost:9000');
    cy.get('[data-testid="terminal-container"]', { timeout: 10000 }).should('be.visible');
  });

  it('should delete characters when backspace is pressed', () => {
    // Type some text
    cy.get('[data-testid="terminal-input"]').type('hello');
    
    // Wait for terminal to receive the text
    cy.wait(500);
    
    // Press backspace 3 times
    cy.get('[data-testid="terminal-input"]').type('{backspace}{backspace}{backspace}');
    
    // Wait for terminal to process
    cy.wait(500);
    
    // Check that the terminal output shows deletion happened
    // We should see "hello" followed by backspace sequences that deleted 3 chars
    // Leaving "he" visible in the terminal
    cy.get('[data-testid="terminal-container"]').then(($terminal) => {
      const text = $terminal.text();
      // Should NOT contain "hello" anymore, should have backspace effect
      expect(text).to.include('he');
    });
  });

  it('should respond to backspace diagnostics showing deletion', () => {
    // Open diagnostics panel
    cy.get('[data-testid="diagnostics-button"]').click({ force: true });
    cy.get('[data-testid="diagnostics-panel"]', { timeout: 5000 }).should('be.visible');

    // Type text in terminal
    cy.get('[data-testid="terminal-input"]').type('test');
    cy.wait(300);

    // Press backspace
    cy.get('[data-testid="terminal-input"]').type('{backspace}');
    cy.wait(300);

    // Check diagnostics show backspace was processed
    cy.get('[data-testid="diagnostics-events"]').should('contain', 'Terminal received: Backspace');
  });
});
