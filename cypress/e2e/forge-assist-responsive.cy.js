/**
 * E2E Test: Forge Assist Button Layout at Multiple Viewports
 * 
 * Tests button overlap at various screen sizes to reproduce user's issue
 */

describe('Forge Assist Button Layout - Responsive', () => {
  const viewports = [
    { width: 1920, height: 1080, name: 'Desktop HD' },
    { width: 1280, height: 720, name: 'Default' },
    { width: 1024, height: 768, name: 'Tablet' },
    { width: 800, height: 600, name: 'Small' },
  ];

  viewports.forEach(viewport => {
    describe(`at ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      beforeEach(() => {
        // Set viewport before visiting
        cy.viewport(viewport.width, viewport.height);
        cy.visit('http://localhost:3005');
        cy.get('.terminal-container', { timeout: 10000 }).should('be.visible');
        
        // Dismiss tour if present
        cy.get('body').then($body => {
          if ($body.find('.tour-tooltip').length > 0) {
            cy.get('.tour-tooltip button').contains('Skip').click();
          }
        });
      });

      it('buttons should not overlap', () => {
        // Open Forge Assist
        cy.get('body').type('{ctrl}/');
        
        // Wait for modal
        cy.get('.forge-assist-modal', { timeout: 5000 }).should('be.visible');
        
        // Get all buttons in header
        cy.get('.forge-assist-header button').then($buttons => {
          const buttonRects = [];
          $buttons.each((i, btn) => {
            const rect = btn.getBoundingClientRect();
            buttonRects.push({
              index: i,
              left: rect.left,
              right: rect.right,
              width: rect.width,
              text: btn.textContent.trim()
            });
          });
          
          // Check for overlaps
          for (let i = 0; i < buttonRects.length - 1; i++) {
            const current = buttonRects[i];
            const next = buttonRects[i + 1];
            
            cy.log(`Button ${i}: ${current.text} (${current.left}-${current.right})`);
            cy.log(`Button ${i+1}: ${next.text} (${next.left}-${next.right})`);
            
            // Assert no overlap: current.right should be <= next.left
            expect(current.right, 
              `${current.text} should not overlap ${next.text}`
            ).to.be.at.most(next.left);
          }
          
          // Take screenshot
          cy.screenshot(`buttons-${viewport.name}-${viewport.width}x${viewport.height}`);
        });
      });

      it('modal should fit in viewport', () => {
        cy.get('body').type('{ctrl}/');
        cy.get('.forge-assist-modal', { timeout: 5000 }).should('be.visible');
        
        cy.get('.forge-assist-modal').then($modal => {
          const rect = $modal[0].getBoundingClientRect();
          
          expect(rect.right).to.be.at.most(viewport.width);
          expect(rect.bottom).to.be.at.most(viewport.height);
          
          cy.log(`Modal size: ${rect.width}x${rect.height}`);
          cy.log(`Viewport: ${viewport.width}x${viewport.height}`);
        });
      });
    });
  });
});
