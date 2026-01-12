/**
 * Validation Test: Terminology Audit (quick instruction → persistent instruction)
 * 
 * This test verifies that all "quick instruction" references have been replaced
 * with "persistent instruction" across the UI and functionality.
 * 
 * Following copilot-instructions.md Phase 4: Visual Proof Protocol
 */

describe('Terminology Audit Validation', () => {
  beforeEach(() => {
    cy.visit('http://localhost:9999');
    cy.wait(2000); // Allow app to initialize
  });

  it('should verify API endpoint changed to /api/persistent-instruction', () => {
    // Test the new endpoint exists
    cy.request('GET', 'http://localhost:9999/api/persistent-instruction')
      .then((response) => {
        expect(response.status).to.equal(200);
        cy.log('✓ New API endpoint /api/persistent-instruction works');
      });
  });

  it('should verify old API endpoint no longer exists', () => {
    // Test the old endpoint is gone
    cy.request({
      url: 'http://localhost:9999/api/quick-instruction',
      failOnStatusCode: false
    }).then((response) => {
      expect(response.status).to.equal(404);
      cy.log('✓ Old API endpoint /api/quick-instruction removed');
    });
  });

  it('should verify CSS classes use "persistent-instruction"', () => {
    // Open Forge Assist to render the UI
    cy.get('body').type('{ctrl}/');
    cy.wait(500);
    
    // Verify new CSS classes exist in the DOM or stylesheet
    cy.window().then((win) => {
      const stylesheets = Array.from(win.document.styleSheets);
      let foundPersistent = false;
      let foundQuick = false;
      
      stylesheets.forEach(sheet => {
        try {
          const rules = Array.from(sheet.cssRules || []);
          rules.forEach(rule => {
            if (rule.selectorText) {
              if (rule.selectorText.includes('persistent-instruction')) {
                foundPersistent = true;
              }
              if (rule.selectorText.includes('quick-instruction')) {
                foundQuick = true;
              }
            }
          });
        } catch (e) {
          // CORS errors expected for external stylesheets
        }
      });
      
      expect(foundPersistent).to.be.true;
      expect(foundQuick).to.be.false;
      cy.log('✓ CSS classes use "persistent-instruction", not "quick-instruction"');
    });
  });

  it('should verify tour step uses "persistent-instruction" terminology', () => {
    cy.window().then((win) => {
      // Access tour steps from window if exposed, or check via config
      // Tour steps are defined in frontend/src/config/tourSteps.js
      cy.readFile('frontend/src/config/tourSteps.js').then((content) => {
        expect(content).to.include('persistent-instruction-intro');
        expect(content).to.include('.persistent-instruction-collapsed');
        expect(content).to.include('Persistent Instructions');
        expect(content).not.to.include('quick-instruction-intro');
        expect(content).not.to.include('.quick-instruction-collapsed');
        cy.log('✓ Tour steps use "persistent instruction" terminology');
      });
    });
  });

  it('should capture visual proof of terminology changes', () => {
    // Open Forge Assist
    cy.get('body').type('{ctrl}/');
    cy.wait(1000);
    cy.get('.forge-assist-modal').should('be.visible');
    
    // Take screenshot showing the UI with updated terminology
    cy.screenshot('terminology-audit-forge-assist-ui', {
      capture: 'viewport',
      overwrite: true
    });
    
    // Look for any persistent instruction UI elements
    cy.get('body').then(($body) => {
      // Check if persistent instruction button exists
      const hasPersistentBtn = $body.find('[data-testid="persistent-instructions-btn"]').length > 0;
      
      if (hasPersistentBtn) {
        cy.get('[data-testid="persistent-instructions-btn"]')
          .should('exist')
          .screenshot('terminology-audit-persistent-btn', { overwrite: true });
        cy.log('✓ Found persistent-instructions-btn (correct naming)');
      }
      
      // Verify NO quick instruction buttons exist
      const hasQuickBtn = $body.find('[data-testid="quick-instructions-btn"]').length > 0;
      expect(hasQuickBtn).to.be.false;
      cy.log('✓ No quick-instructions-btn found (correctly removed)');
    });
  });

  it('should verify backend handler file was renamed', () => {
    // Verify the new handler file exists
    cy.readFile('cmd/forge/handlers_persistent_instruction.go').then((content) => {
      expect(content).to.include('PersistentInstructionConfig');
      expect(content).to.include('handleGetPersistentInstruction');
      expect(content).to.include('persistent-instruction.json');
      expect(content).not.to.include('QuickInstructionConfig');
      cy.log('✓ Backend handler uses "persistent instruction" terminology');
    });
  });

  it('should verify main.go uses new API route', () => {
    cy.readFile('cmd/forge/main.go').then((content) => {
      expect(content).to.include('/api/persistent-instruction');
      expect(content).to.include('handleGetPersistentInstruction');
      expect(content).not.to.include('/api/quick-instruction');
      cy.log('✓ main.go uses /api/persistent-instruction route');
    });
  });

  it('should verify App.jsx uses new variable names', () => {
    cy.readFile('frontend/src/App.jsx').then((content) => {
      expect(content).to.include('showPersistentInstruction');
      expect(content).to.include('setShowPersistentInstruction');
      expect(content).to.include('[PersistentInstruction]');
      expect(content).not.to.include('showQuickInstruction');
      expect(content).not.to.include('[QuickInstruction]');
      cy.log('✓ App.jsx uses "persistent instruction" terminology');
    });
  });
});
