describe('Visual Theme Change Verification', () => {
  it('should visually change theme colors', () => {
    cy.visit('http://localhost:8333');
    cy.wait(3000);
    
    // Dismiss tour
    cy.get('body').then($body => {
      if ($body.find('.tour-backdrop').length > 0) {
        cy.contains('button', 'Skip').click({force: true});
        cy.wait(500);
      }
    });
    
    // Click first tab to activate it
    cy.get('.tab').first().click();
    cy.wait(1000);
    
    // Take screenshot BEFORE theme change
    cy.screenshot('01-before-theme-change', { capture: 'viewport' });
    
    // Right-click to open context menu
    cy.get('.tab').first().rightclick();
    cy.wait(500);
    cy.contains('button', 'Theme').click();
    cy.wait(500);
    
    // Change to Forest Dark (green theme)
    cy.get('.theme-submenu').within(() => {
      cy.contains('.theme-name', 'Forest').parent().within(() => {
        cy.contains('button', 'Dark').click();
      });
    });
    
    cy.wait(2000);
    cy.screenshot('02-after-forest-dark', { capture: 'viewport' });
    
    // Change to Rose Light (pink theme)
    cy.get('.tab').first().rightclick();
    cy.wait(500);
    cy.contains('button', 'Theme').click();
    cy.wait(500);
    
    cy.get('.theme-submenu').within(() => {
      cy.contains('.theme-name', 'Rose').parent().within(() => {
        cy.contains('button', 'Light').click();
      });
    });
    
    cy.wait(2000);
    cy.screenshot('03-after-rose-light', { capture: 'viewport' });
    
    // Change to Midnight Dark (purple theme)
    cy.get('.tab').first().rightclick();
    cy.wait(500);
    cy.contains('button', 'Theme').click();
    cy.wait(500);
    
    cy.get('.theme-submenu').within(() => {
      cy.contains('.theme-name', 'Midnight').parent().within(() => {
        cy.contains('button', 'Dark').click();
      });
    });
    
    cy.wait(2000);
    cy.screenshot('04-after-midnight-dark', { capture: 'viewport' });
  });
});
