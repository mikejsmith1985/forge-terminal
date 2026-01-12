// Test: Persistent Instruction Enter key submits instruction
// TDD: RED phase - test should pass after Enter key fix

describe('Persistent Instruction Enter Key', () => {
  beforeEach(() => {
    cy.visit('http://localhost:3005');
    // Clear localStorage to start fresh
    cy.window().then((win) => {
      win.localStorage.removeItem('forgeAssist_persistentInstructions');
    });
    cy.wait(1000);
  });

  it('should add instruction when Enter is pressed in textarea', () => {
    // Open Forge Assist with Ctrl+/
    cy.get('body').type('{ctrl}/');
    cy.wait(500);
    
    // Click the Persistent Instructions button (sparkle icon)
    cy.get('[data-testid="persistent-instructions-btn"]').click();
    cy.wait(300);
    
    // Find the textarea and type instruction text
    cy.get('textarea[placeholder*="Enter instruction text"]').type('Always use TypeScript strict mode');
    
    // Press Enter to submit (not Shift+Enter)
    cy.get('textarea[placeholder*="Enter instruction text"]').type('{enter}');
    cy.wait(300);
    
    // Verify the instruction was added (should appear in the list)
    cy.contains('Always use TypeScript strict mode').should('exist');
    
    // Verify the textarea was cleared
    cy.get('textarea[placeholder*="Enter instruction text"]').should('have.value', '');
  });

  it('should allow multiline input with Shift+Enter', () => {
    // Open Forge Assist with Ctrl+/
    cy.get('body').type('{ctrl}/');
    cy.wait(500);
    
    // Click the Persistent Instructions button
    cy.get('[data-testid="persistent-instructions-btn"]').click();
    cy.wait(300);
    
    // Type text with Shift+Enter for newline
    cy.get('textarea[placeholder*="Enter instruction text"]')
      .type('Line 1{shift+enter}Line 2');
    
    // Verify textarea still contains the multiline text (wasn't submitted)
    cy.get('textarea[placeholder*="Enter instruction text"]')
      .should('have.value', 'Line 1\nLine 2');
  });

  it('should not submit empty instructions on Enter', () => {
    // Open Forge Assist with Ctrl+/
    cy.get('body').type('{ctrl}/');
    cy.wait(500);
    
    // Click the Persistent Instructions button
    cy.get('[data-testid="persistent-instructions-btn"]').click();
    cy.wait(300);
    
    // Press Enter without typing anything
    cy.get('textarea[placeholder*="Enter instruction text"]').type('{enter}');
    cy.wait(300);
    
    // Verify no instruction was added (still shows empty state message)
    cy.contains('No persistent instructions yet').should('exist');
  });
});
