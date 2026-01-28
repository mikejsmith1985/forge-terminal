// Cypress test to reproduce terminal issues
describe('Terminal Issues - v3.17.5', () => {
  beforeEach(() => {
    cy.visit('http://localhost:9999');
    cy.wait(2000);
  });

  it('Test 1: Terminal text cut-off when switching tabs', () => {
    cy.log('Creating 3 terminal tabs');
    
    // Wait for initial terminal
    cy.get('.terminal', { timeout: 10000 }).should('be.visible');
    
    // Create tab 2
    cy.get('button[title="New Terminal Tab"]').click();
    cy.wait(1000);
    
    // Create tab 3
    cy.get('button[title="New Terminal Tab"]').click();
    cy.wait(1000);
    
    // Get tab buttons
    cy.get('.tab-button').should('have.length.at.least', 3);
    
    // Switch to tab 2
    cy.get('.tab-button').eq(1).click();
    cy.wait(500);
    
    // Switch back to tab 1
    cy.get('.tab-button').eq(0).click();
    cy.wait(500);
    
    // Check terminal dimensions
    cy.get('.terminal').then($term => {
      const rect = $term[0].getBoundingClientRect();
      cy.log(`Terminal width: ${rect.width}, left: ${rect.left}`);
      
      // Terminal should start at left edge of container
      expect(rect.left).to.be.lessThan(20, 'Terminal should not be shifted left');
    });
    
    // Take screenshot
    cy.screenshot('tab-switch-cutoff');
  });

  it('Test 2: Ctrl+V paste functionality', () => {
    cy.log('Testing Ctrl+V paste');
    
    // Wait for terminal
    cy.get('.terminal', { timeout: 10000 }).should('be.visible');
    
    // Focus terminal textarea
    cy.get('.xterm-helper-textarea').first().focus();
    cy.wait(500);
    
    // Set clipboard data and paste
    const testText = 'echo "test paste"';
    cy.window().then(win => {
      // Simulate paste event
      const pasteEvent = new win.ClipboardEvent('paste', {
        clipboardData: new win.DataTransfer(),
        bubbles: true,
        cancelable: true
      });
      pasteEvent.clipboardData.setData('text/plain', testText);
      
      // Trigger on focused textarea
      cy.get('.xterm-helper-textarea').first().then($textarea => {
        $textarea[0].dispatchEvent(pasteEvent);
      });
    });
    
    cy.wait(1000);
    
    // Check console for paste logs
    cy.window().its('console').then(console => {
      cy.log('Check browser console for paste-related logs');
    });
    
    // Take screenshot
    cy.screenshot('ctrl-v-paste');
  });

  it('Test 3: Measure terminal dimensions after tab switch', () => {
    cy.log('Measuring terminal dimensions');
    
    // Create multiple tabs
    cy.get('.terminal', { timeout: 10000 }).should('be.visible');
    cy.get('button[title="New Terminal Tab"]').click();
    cy.wait(1000);
    cy.get('button[title="New Terminal Tab"]').click();
    cy.wait(1000);
    
    // Measure tab 1 initially
    cy.get('.tab-button').eq(0).click();
    cy.wait(500);
    
    cy.get('.terminal').first().then($term => {
      const initialRect = $term[0].getBoundingClientRect();
      const initialWidth = initialRect.width;
      const initialLeft = initialRect.left;
      
      cy.log(`Initial - Width: ${initialWidth}, Left: ${initialLeft}`);
      
      // Switch to tab 2
      cy.get('.tab-button').eq(1).click();
      cy.wait(500);
      
      // Switch back to tab 1
      cy.get('.tab-button').eq(0).click();
      cy.wait(500);
      
      // Measure again
      cy.get('.terminal').first().then($term2 => {
        const afterRect = $term2[0].getBoundingClientRect();
        const afterWidth = afterRect.width;
        const afterLeft = afterRect.left;
        
        cy.log(`After switch - Width: ${afterWidth}, Left: ${afterLeft}`);
        
        // Dimensions should be consistent
        expect(Math.abs(afterWidth - initialWidth)).to.be.lessThan(5, 'Width should be consistent');
        expect(Math.abs(afterLeft - initialLeft)).to.be.lessThan(5, 'Left position should be consistent');
      });
    });
    
    cy.screenshot('terminal-dimensions');
  });
});
