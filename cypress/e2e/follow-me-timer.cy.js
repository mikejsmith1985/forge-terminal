/**
 * E2E Test: Follow Me Recording Timer
 * 
 * v3.12.13: Validates that the recording timer updates correctly and survives tab switches
 */

describe('Follow Me Recording Timer', () => {
  beforeEach(() => {
    // Start Forge Terminal
    cy.visit('http://localhost:3005');
    
    // Wait for app to load
    cy.wait(2000);
    
    // Dismiss tour if present (use jQuery trigger like in backspace test)
    cy.get('body').then($body => {
      const tourClose = $body.find('.tour-tooltip-close');
      if (tourClose.length > 0) {
        tourClose.trigger('click');
      }
    });
    cy.wait(500);
    
    cy.get('.terminal-wrapper:not(.hidden) .terminal-inner', { timeout: 15000 }).should('be.visible');
  });

  it('timer should increment from 0:00', () => {
    // Navigate to Web Tools tab (which contains the debugger)
    cy.contains('button', 'Web Tools').click({ force: true });
    cy.wait(500);
    
    // Wait for WebAppDebuggerCard to appear (contains Follow Me)
    cy.get('.web-app-debugger-card', { timeout: 5000 }).should('be.visible');
    
    // Wait for Follow Me button
    cy.get('[data-testid="follow-me-button"]', { timeout: 5000 }).should('be.visible');
    
    // Click Follow Me with force to bypass any overlays
    cy.get('[data-testid="follow-me-button"]').click({ force: true });
    
    // Wait for recording to start
    cy.get('[data-testid="recording-indicator"]', { timeout: 5000 }).should('be.visible');
    
    // Take immediate screenshot
    cy.screenshot('timer-after-click');
    
    // Get initial timer value
    cy.get('.recording-duration').invoke('text').then(initialTimer => {
      cy.log('Initial timer:', initialTimer);
      
      // Should be 0:00 or 0:01
      expect(initialTimer).to.match(/0:0[0-2]/);
      
      // Wait 4 seconds (a bit longer to ensure ticks)
      cy.wait(4000);
      
      // Take screenshot after wait
      cy.screenshot('timer-after-4-seconds');
      
      // Timer should have incremented
      cy.get('.recording-duration').invoke('text').then(updatedTimer => {
        cy.log('Updated timer:', updatedTimer);
        // Timer should now be 0:03 to 0:06 (4 seconds + some slack)
        expect(updatedTimer).to.match(/0:0[3-6]/);
      });
    });
    
    // Take final screenshot
    cy.screenshot('follow-me-timer-running');
    
    // Stop recording
    cy.get('[data-testid="im-done-button"]').click({ force: true });
  });

  it('timer should survive tab switches', () => {
    // Navigate to Web Tools tab
    cy.contains('button', 'Web Tools').click();
    cy.wait(500);
    cy.get('.web-app-debugger-card', { timeout: 5000 }).should('be.visible');
    
    // Start Follow Me
    cy.get('[data-testid="follow-me-button"]').click();
    cy.get('[data-testid="recording-indicator"]').should('be.visible');
    
    // Wait for timer to reach ~5 seconds
    cy.wait(5000);
    
    // Get timer value before switch
    cy.get('.recording-duration').invoke('text').then(timerBefore => {
      cy.log('Timer before switch:', timerBefore);
      const secondsBefore = parseInt(timerBefore.split(':')[1]);
      
      // Switch away to Files tab
      cy.contains('button', 'Files').click();
      cy.wait(2000);
      
      // Switch back to Web Tools tab
      cy.contains('button', 'Web Tools').click();
      
      // Wait for component to remount
      cy.get('[data-testid="recording-indicator"]', { timeout: 5000 }).should('be.visible');
      cy.wait(1000);
      
      // Timer should show continued time
      cy.get('.recording-duration').invoke('text').then(timerAfter => {
        cy.log('Timer after switch:', timerAfter);
        const secondsAfter = parseInt(timerAfter.split(':')[1]);
        
        // Timer should have continued (allow 2s tolerance for switch time)
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
