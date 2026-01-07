/**
 * E2E Test: AM Feature Removal Verification
 * 
 * Validates that Activity Monitor (AM) related UI elements have been removed
 * from the entire application.
 * 
 * NOTE: This test runs against the newly built forge binary on port 3006
 */

describe('AM Feature Removal', () => {
  beforeEach(() => {
    // Use the new test server port
    cy.visit('http://localhost:3006', {
      onBeforeLoad: (win) => {
        win.localStorage.setItem('tourComplete', 'true');
        win.localStorage.setItem('skipTour', 'true');
      }
    });
    // Wait for app to fully load
    cy.get('body', { timeout: 15000 }).should('be.visible');
    // Wait for React to render
    cy.wait(3000);
  });

  describe('Full page scan', () => {
    it('should NOT have visible AM text anywhere on initial load', () => {
      // Wait for page to fully render
      cy.wait(2000);
      
      // The text "AM Logging" and "Activity Monitor" should not be visible anywhere
      cy.contains('AM Logging').should('not.exist');
      cy.contains('Master AM').should('not.exist');
      cy.contains('AM System Active').should('not.exist');
      cy.contains('AM System Disabled').should('not.exist');
    });
  });

  describe('Tab Context Menu (Right-click on tab)', () => {
    it('should NOT contain AM toggle option', () => {
      // Wait for tab to be visible
      cy.get('.tab', { timeout: 10000 }).first().should('be.visible');
      
      // Right-click on a tab to open context menu
      cy.get('.tab').first().rightclick({ force: true });
      
      // Wait for context menu
      cy.get('.tab-context-menu', { timeout: 5000 }).should('exist');
      
      // Should NOT contain AM-related options
      cy.contains('AM Logging').should('not.exist');
      cy.contains('Activity Monitor').should('not.exist');
    });
  });
});
