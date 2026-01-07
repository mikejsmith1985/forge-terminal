/**
 * E2E Test: Follow Me Recording Timer
 * 
 * Validates that the recording timer updates correctly and survives tab switches
 */

describe('Follow Me Recording Timer', () => {
  beforeEach(() => {
    // Start Forge Terminal
    cy.visit('http://localhost:3005');
    cy.get('.terminal-container', { timeout: 10000 }).should('be.visible');
  });

  it('timer should increment from 0:00', () => {
    // Navigate to WebTools → Debug
    cy.contains('button', 'Web Tools').click();
    cy.wait(500);
    
    // Click Debug view
    cy.get('[data-view="debug"]').click({ force: true });
    cy.wait(1000);
    
    // Wait for Follow Me button
    cy.get('[data-testid="follow-me-button"]', { timeout: 5000 }).should('be.visible');
    
    // Click Follow Me
    cy.get('[data-testid="follow-me-button"]').click();
    
    // Wait for recording to start
    cy.get('[data-testid="recording-indicator"]', { timeout: 5000 }).should('be.visible');
    
    // Get initial timer value
    cy.get('.recording-duration').invoke('text').then(initialTimer => {
      cy.log('Initial timer:', initialTimer);
      
      // Should be 0:00 or 0:01
      expect(initialTimer).to.match(/0:0[0-1]/);
      
      // Wait 3 seconds
      cy.wait(3000);
      
      // Timer should have incremented
      cy.get('.recording-duration').invoke('text').then(updatedTimer => {
        cy.log('Updated timer:', updatedTimer);
        expect(updatedTimer).to.match(/0:0[3-5]/);
      });
    });
    
    // Take screenshot
    cy.screenshot('follow-me-timer-running');
    
    // Stop recording
    cy.get('[data-testid="im-done-button"]').click();
  });

  it('timer should survive tab switches', () => {
    // Navigate to Debug tab
    cy.contains('button', 'Web Tools').click();
    cy.get('[data-view="debug"]').click({ force: true });
    
    // Start Follow Me
    cy.get('[data-testid="follow-me-button"]').click();
    cy.get('[data-testid="recording-indicator"]').should('be.visible');
    
    // Wait for timer to reach ~5 seconds
    cy.wait(5000);
    
    // Get timer value before switch
    cy.get('.recording-duration').invoke('text').then(timerBefore => {
      cy.log('Timer before switch:', timerBefore);
      const secondsBefore = parseInt(timerBefore.split(':')[1]);
      
      // Switch away from WebTools
      cy.get('.tab').first().click();
      cy.wait(2000);
      
      // Switch back to WebTools → Debug
      cy.contains('button', 'Web Tools').click();
      cy.get('[data-view="debug"]').click({ force: true });
      
      // Wait for component to remount
      cy.get('[data-testid="recording-indicator"]', { timeout: 5000 }).should('be.visible');
      cy.wait(1000);
      
      // Timer should show continued time
      cy.get('.recording-duration').invoke('text').then(timerAfter => {
        cy.log('Timer after switch:', timerAfter);
        const secondsAfter = parseInt(timerAfter.split(':')[1]);
        
        // Timer should have continued (allow 2s tolerance)
        expect(secondsAfter).to.be.at.least(secondsBefore + 1);
        expect(secondsAfter).to.be.at.most(secondsBefore + 5);
      });
    });
    
    // Take screenshot
    cy.screenshot('follow-me-timer-after-switch');
    
    // Stop recording
    cy.get('[data-testid="im-done-button"]').click();
  });
});
