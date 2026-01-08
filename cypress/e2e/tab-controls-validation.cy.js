describe('Tab Controls Settings Panel - Manual Validation', () => {
  beforeEach(() => {
    cy.visit('http://localhost:8333');
    cy.wait(2000);
    
    // Dismiss tour if present
    cy.get('body').then($body => {
      if ($body.find('.tour-backdrop').length > 0) {
        cy.get('button').contains('Skip').click({force: true});
        cy.wait(500);
      }
    });
  });

  it('should load Tab Controls panel without errors', () => {
    // Open Settings (button has title="Shell Settings")
    cy.get('button[title="Shell Settings"]').click();
    cy.wait(1000);
    
    // Click Tab Controls tab
    cy.contains('Tab Controls').click();
    cy.wait(2000);
    
    // Screenshot full modal
    cy.screenshot('tab-controls-full-panel');
    
    // Verify no error message
    cy.contains('Failed to load settings').should('not.exist');
    
    // Verify Global Presets section
    cy.contains('Global Presets').should('be.visible');
    cy.contains('label', 'Auto-cycle').should('be.visible');
    cy.contains('label', 'Auto-cycle dark-only').should('be.visible');
    cy.contains('label', 'Auto-cycle light-only').should('be.visible');
    
    // Verify visual diagram
    cy.contains('Visual Preview').should('be.visible');
    
    // Verify per-tab defaults grid
    cy.contains('Tab 1').should('be.visible');
    cy.contains('Tab 20').should('be.visible');
    
    // Verify split themes section
    cy.contains('Terminal Theme').should('be.visible');
    cy.contains('Control Ribbon').should('be.visible');
    
    // Verify Save button
    cy.contains('button', 'Save').should('be.visible');
    
    cy.log('✅ All sections validated successfully');
  });
});
