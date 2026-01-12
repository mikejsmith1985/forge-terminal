/**
 * E2E Test: Forge Assist Button Layout
 * 
 * Validates that buttons in Forge Assist header do not overlap
 */

describe('Forge Assist Button Layout', () => {
  beforeEach(() => {
    // Start Forge Terminal
    cy.visit('http://localhost:3005');
    cy.get('.terminal-container', { timeout: 10000 }).should('be.visible');
  });

  it('buttons should not overlap in Forge Assist header', () => {
    // Open Forge Assist with Ctrl+/
    cy.get('body').type('{ctrl}/');
    
    // Wait for modal to appear
    cy.get('.forge-assist-modal', { timeout: 5000 }).should('be.visible');
    
    // Get button positions
    cy.get('[data-testid="persistent-instructions-btn"]').then($persistent => {
      cy.get('.forge-assist-instruction-toggle').then($files => {
        const persistentRect = $persistent[0].getBoundingClientRect();
        const filesRect = $files[0].getBoundingClientRect();
        
        // Persistent button's right edge should not extend past Files button's left edge
        expect(persistentRect.right).to.be.at.most(filesRect.left);
        
        cy.log(`Persistent right: ${persistentRect.right}, Files left: ${filesRect.left}`);
      });
    });
    
    // Take screenshot
    cy.screenshot('forge-assist-buttons-no-overlap', {
      clip: { x: 200, y: 50, width: 900, height: 150 }
    });
  });

  it('header should have reasonable button sizes', () => {
    // Open Forge Assist with Ctrl+/
    cy.get('body').type('{ctrl}/');
    cy.get('.forge-assist-modal').should('be.visible');
    
    cy.get('[data-testid="persistent-instructions-btn"]').then($btn => {
      const rect = $btn[0].getBoundingClientRect();
      
      // Button should not be excessively wide
      expect(rect.width).to.be.lessThan(150);
      
      // Button should not be excessively tall
      expect(rect.height).to.be.lessThan(50);
      
      cy.log(`Button dimensions: ${rect.width}x${rect.height}`);
    });
  });
});
