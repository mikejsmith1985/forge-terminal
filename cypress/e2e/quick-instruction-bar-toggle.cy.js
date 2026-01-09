/**
 * Test: Quick Instruction Bar Toggle Fix
 * 
 * Verifies that the "Bar: ON/OFF" toggle in Forge Assist correctly
 * responds to rapid clicks without getting stuck (stale closure bug fix)
 * 
 * Bug Reference: Functional state update prevents stale closure
 * Fixed: ForgeAssist.jsx:459 - Use setQuickInstructionBarEnabled((prev) => ...)
 */

describe('Quick Instruction Bar Toggle - Stale Closure Fix', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.window().then((win) => {
      // Clear localStorage to start fresh
      win.localStorage.removeItem('forgeAssist_quickInstructionBarEnabled');
      win.localStorage.removeItem('forgeAssist_quickInstructions');
      
      // Set up a test quick instruction
      win.localStorage.setItem('forgeAssist_quickInstructions', JSON.stringify([
        { id: 'test-1', text: 'Test instruction', enabled: true }
      ]));
    });
  });

  it('should toggle correctly on single click', () => {
    // Open Forge Assist
    cy.get('body').type('{ctrl}/');
    cy.contains('Quick').click();
    
    // Find the toggle button
    cy.get('[data-testid="quick-instruction-bar-toggle"]').should('exist');
    
    // Initial state should be ON (default)
    cy.get('[data-testid="quick-instruction-bar-toggle"]').should('contain', 'Bar: ON');
    cy.window().then((win) => {
      expect(win.localStorage.getItem('forgeAssist_quickInstructionBarEnabled')).to.equal('true');
    });
    
    // Click to toggle OFF
    cy.get('[data-testid="quick-instruction-bar-toggle"]').click();
    cy.get('[data-testid="quick-instruction-bar-toggle"]').should('contain', 'Bar: OFF');
    cy.window().then((win) => {
      expect(win.localStorage.getItem('forgeAssist_quickInstructionBarEnabled')).to.equal('false');
    });
    
    // Click to toggle back ON
    cy.get('[data-testid="quick-instruction-bar-toggle"]').click();
    cy.get('[data-testid="quick-instruction-bar-toggle"]').should('contain', 'Bar: ON');
    cy.window().then((win) => {
      expect(win.localStorage.getItem('forgeAssist_quickInstructionBarEnabled')).to.equal('true');
    });
  });

  it('should handle rapid clicks correctly (stale closure regression test)', () => {
    // Open Forge Assist
    cy.get('body').type('{ctrl}/');
    cy.contains('Quick').click();
    
    // Find the toggle button
    const toggleBtn = cy.get('[data-testid="quick-instruction-bar-toggle"]');
    toggleBtn.should('exist');
    
    // Initial state: ON
    toggleBtn.should('contain', 'Bar: ON');
    
    // Rapid click test: 5 clicks in quick succession
    // Each click should alternate the state
    for (let i = 0; i < 5; i++) {
      toggleBtn.click();
      cy.wait(50); // Small delay to allow state update
      
      // Verify localStorage alternates
      const expectedState = i % 2 === 0 ? 'false' : 'true';
      const expectedLabel = i % 2 === 0 ? 'Bar: OFF' : 'Bar: ON';
      
      cy.window().then((win) => {
        const actual = win.localStorage.getItem('forgeAssist_quickInstructionBarEnabled');
        expect(actual).to.equal(expectedState, `Click ${i + 1}: Expected ${expectedState}, got ${actual}`);
      });
      
      toggleBtn.should('contain', expectedLabel);
    }
    
    // Final state should be OFF (started ON, clicked 5 times)
    toggleBtn.should('contain', 'Bar: OFF');
  });

  it('should dispatch custom event on toggle', () => {
    let eventFired = false;
    
    cy.window().then((win) => {
      win.addEventListener('forge-quick-instruction-bar-enabled-changed', () => {
        eventFired = true;
      });
    });
    
    // Open Forge Assist and toggle
    cy.get('body').type('{ctrl}/');
    cy.contains('Quick').click();
    cy.get('[data-testid="quick-instruction-bar-toggle"]').click();
    
    // Verify event was fired
    cy.window().then(() => {
      expect(eventFired).to.be.true;
    });
  });

  it('should show toast notification on toggle', () => {
    // Open Forge Assist
    cy.get('body').type('{ctrl}/');
    cy.contains('Quick').click();
    
    // Toggle OFF
    cy.get('[data-testid="quick-instruction-bar-toggle"]').click();
    
    // Toast should appear (implementation-dependent, adjust selector as needed)
    // This is a placeholder - adjust based on actual toast implementation
    cy.contains(/Quick Instruction Bar (Enabled|Disabled)/i, { timeout: 2000 }).should('exist');
  });
});
