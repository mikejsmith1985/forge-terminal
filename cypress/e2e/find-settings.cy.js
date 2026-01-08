describe('Find Settings Button', () => {
  it('should load Forge and find settings button', () => {
    cy.visit('http://localhost:8333');
    cy.wait(3000);
    
    // Take screenshot of the full page
    cy.screenshot('forge-homepage');
    
    // Try to find settings button by aria-label
    cy.get('[aria-label*="Settings"], [aria-label*="settings"]').then($btn => {
      cy.log('Found by aria-label:', $btn);
    });
    
    // Try to find settings icon
    cy.get('button').contains('Settings').should('exist');
  });
});
