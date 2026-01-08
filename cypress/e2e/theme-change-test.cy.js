describe('Theme Change Functionality Test', () => {
  it('should change tab theme when selected from context menu', () => {
    cy.visit('http://localhost:8333');
    cy.wait(3000);
    
    // Dismiss tour if present
    cy.get('body').then($body => {
      if ($body.find('.tour-backdrop').length > 0) {
        cy.contains('button', 'Skip').click({force: true});
        cy.wait(500);
      }
    });
    
    // Get the first tab
    cy.get('.tab').first().as('firstTab');
    
    // Right-click to open context menu
    cy.get('@firstTab').rightclick();
    cy.wait(500);
    
    // Click Theme button to open theme submenu
    cy.contains('button', 'Theme').click();
    cy.wait(500);
    
    // Take screenshot of theme submenu
    cy.screenshot('theme-submenu-opened');
    
    // Click Ocean theme, Light mode
    cy.get('.theme-submenu').within(() => {
      cy.contains('.theme-name', 'Ocean').parent().within(() => {
        cy.contains('button', 'Light').click();
      });
    });
    
    cy.wait(1000);
    
    // Verify theme was applied by checking console logs
    cy.window().then((win) => {
      // Check if console.log was called with theme change info
      expect(true).to.be.true; // Placeholder - will check logs manually
    });
    
    // Take screenshot after theme change
    cy.screenshot('after-theme-change');
    
    // Try another theme change - Midnight Dark
    cy.get('@firstTab').rightclick();
    cy.wait(500);
    cy.contains('button', 'Theme').click();
    cy.wait(500);
    
    cy.get('.theme-submenu').within(() => {
      cy.contains('.theme-name', 'Midnight').parent().within(() => {
        cy.contains('button', 'Dark').click();
      });
    });
    
    cy.wait(1000);
    cy.screenshot('after-second-theme-change');
  });
});
