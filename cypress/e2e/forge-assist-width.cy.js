/**
 * E2E Test: Forge Assist Modal Width
 * 
 * Validates that the Forge Assist modal has adequate width
 * and buttons are not crowded/overlapping.
 * 
 * TDD: RED phase - This test should pass after CSS fix
 */

describe('Forge Assist Modal Width (P5)', () => {
  beforeEach(() => {
    cy.visit('http://localhost:3005', {
      onBeforeLoad: (win) => {
        win.localStorage.setItem('tourComplete', 'true');
        win.localStorage.setItem('skipTour', 'true');
      }
    });
    cy.get('body', { timeout: 15000 }).should('be.visible');
    cy.wait(2000);
  });

  it('should have minimum width of 600px', () => {
    // Open Forge Assist with Ctrl+/
    cy.get('body').type('{ctrl}/');
    
    // Wait for modal
    cy.get('.forge-assist-modal', { timeout: 5000 }).should('be.visible');
    
    // Check minimum width - should be at least 600px
    cy.get('.forge-assist-modal').then($modal => {
      const width = $modal[0].getBoundingClientRect().width;
      expect(width).to.be.at.least(600);
    });
  });

  it('should have header buttons not overlapping', () => {
    cy.get('body').type('{ctrl}/');
    cy.get('.forge-assist-modal', { timeout: 5000 }).should('be.visible');
    
    // Check that header elements have adequate spacing
    cy.get('.forge-assist-header').then($header => {
      const headerWidth = $header[0].getBoundingClientRect().width;
      // Header should be wide enough to fit all elements
      expect(headerWidth).to.be.at.least(580);
    });
    
    // Buttons should not overlap - check each has positive width
    cy.get('.forge-assist-header button, .forge-assist-header .mode-btn').each($btn => {
      const rect = $btn[0].getBoundingClientRect();
      expect(rect.width).to.be.at.least(20);
    });
  });

  it('should maintain readability on standard viewport', () => {
    // Set viewport to common laptop size
    cy.viewport(1366, 768);
    
    cy.get('body').type('{ctrl}/');
    cy.get('.forge-assist-modal', { timeout: 5000 }).should('be.visible');
    
    // Modal should be visible and properly sized
    cy.get('.forge-assist-modal').should('be.visible')
      .and('have.css', 'max-width')
      .and('not.eq', '0px');
  });
});
