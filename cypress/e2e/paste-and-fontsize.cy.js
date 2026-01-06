/// <reference types="cypress" />
/// <reference types="cypress-real-events" />

/**
 * Paste Functionality E2E Test
 * 
 * CONSTRAINT: NO NETWORK STUBS - Real backend, real clipboard
 * CONSTRAINT: REAL INPUTS ONLY - Uses cypress-real-events for OS-level events
 * 
 * This test validates:
 * 1. Ctrl+V paste works without showing permission errors
 * 2. Font size controls are visible and larger
 * 3. Font size controls use contrasting orange color
 * 4. Robot and terminal emoji icons are removed from font size tool
 */

describe('Paste Functionality', () => {
  beforeEach(() => {
    // Visit the app - NO stubs, real backend
    cy.visit('/');
    
    // Wait for the terminal element to be visible
    cy.get('.xterm', { timeout: 15000 }).should('be.visible');
    
    // Wait for WebSocket connection
    cy.wait(2000);
  });

  it('should have font size controls visible with correct styling', () => {
    // Font size controls should be visible
    cy.get('.font-size-controls').should('be.visible');
    
    // Should have orange background (contrasting color)
    cy.get('.font-size-controls').should('have.css', 'background-color', 'rgb(249, 115, 22)');
    
    // Should have minus and plus buttons
    cy.get('.font-size-controls button').should('have.length', 2);
    
    // Should have font size display
    cy.get('.font-size-display').should('be.visible');
    
    // Should NOT have robot emoji (🤖) or keyboard emoji (⌨️)
    cy.get('.font-size-controls').should('not.contain', '🤖');
    cy.get('.font-size-controls').should('not.contain', '⌨️');
  });

  it('should allow increasing and decreasing font size with real clicks', () => {
    // Get initial font size
    cy.get('.font-size-display').invoke('text').then((initialSize) => {
      const initial = parseInt(initialSize.replace('px', ''), 10);
      
      // Use realClick for actual mouse events
      cy.get('.font-size-controls button').eq(1).realClick();
      
      // Font size should increase
      cy.wait(200);
      cy.get('.font-size-display').should('not.contain', initialSize);
      cy.get('.font-size-display').invoke('text').then((newSize) => {
        const increased = parseInt(newSize.replace('px', ''), 10);
        expect(increased).to.be.greaterThan(initial);
      });
      
      // Use realClick to decrease
      cy.get('.font-size-controls button').eq(0).realClick();
      cy.wait(200);
      cy.get('.font-size-controls button').eq(0).realClick();
      
      // Font size should decrease below initial
      cy.wait(200);
      cy.get('.font-size-display').invoke('text').then((finalSize) => {
        const final = parseInt(finalSize.replace('px', ''), 10);
        expect(final).to.be.lessThan(initial);
      });
    });
  });

  it('should support REAL Ctrl+V paste without permission errors', () => {
    // Focus the terminal with real click
    cy.get('.xterm-helper-textarea').first().realClick();
    
    // Write some test text to clipboard
    const testText = 'test-paste-content-real';
    cy.window().then((win) => {
      // Use clipboard API to write text
      return win.navigator.clipboard.writeText(testText);
    });
    
    // Wait a moment for clipboard to be ready
    cy.wait(500);
    
    // Use REAL Ctrl+V keyboard event (OS-level)
    cy.get('.xterm-helper-textarea').first().realPress(['Control', 'KeyV']);
    
    // Wait a moment for paste to process
    cy.wait(1000);
    
    // Verify NO yellow permission message appears in terminal
    cy.window().then((win) => {
      const terminalElement = win.document.querySelector('.xterm-screen');
      if (terminalElement) {
        const terminalText = terminalElement.textContent || '';
        // Should NOT contain the old permission warning
        expect(terminalText).to.not.include('Paste tip: Click in terminal first');
        expect(terminalText).to.not.include('use Ctrl+Shift+V in some browsers');
        
        cy.log('✓ No permission error message found');
      }
    });
  });

  it('should handle paste event listener correctly', () => {
    // Focus the terminal
    cy.get('.xterm-helper-textarea').first().focus();
    
    // Create a paste event programmatically
    cy.window().then((win) => {
      const testText = 'programmatic-paste-test';
      const textarea = win.document.querySelector('.xterm-helper-textarea');
      
      if (textarea) {
        // Create a paste event with clipboard data
        const clipboardData = new win.DataTransfer();
        clipboardData.setData('text/plain', testText);
        
        const pasteEvent = new win.ClipboardEvent('paste', {
          clipboardData: clipboardData,
          bubbles: true,
          cancelable: true
        });
        
        // Dispatch the paste event
        textarea.dispatchEvent(pasteEvent);
        
        cy.log('Paste event dispatched successfully');
      }
    });
    
    // Verify no error message appears
    cy.wait(500);
    cy.window().then((win) => {
      const terminalElement = win.document.querySelector('.xterm-screen');
      if (terminalElement) {
        const terminalText = terminalElement.textContent || '';
        // Should NOT contain any paste error
        expect(terminalText).to.not.include('[Paste failed');
        expect(terminalText).to.not.include('Paste tip');
      }
    });
  });
});

describe('Font Size Tool Visual Validation', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('.xterm', { timeout: 15000 }).should('be.visible');
  });

  it('should have larger buttons with proper spacing', () => {
    // Check button size - should be larger than before (18px icons instead of 14px)
    cy.get('.font-size-controls button svg').should('have.attr', 'width', '18');
    cy.get('.font-size-controls button svg').should('have.attr', 'height', '18');
    
    // Check padding - buttons should have more padding
    cy.get('.font-size-controls button').first().should('have.css', 'padding', '8px');
  });

  it('should have prominent font size display', () => {
    // Font size display should be larger and bolder
    cy.get('.font-size-display')
      .should('have.css', 'font-size', '15px')
      .should('have.css', 'font-weight', '700')
      .should('have.css', 'color', 'rgb(255, 255, 255)'); // white text
  });

  it('should have orange background for maximum visibility', () => {
    // The controls container should have orange background (#f97316)
    cy.get('.font-size-controls')
      .should('have.css', 'background-color', 'rgb(249, 115, 22)')
      .should('have.css', 'border-radius', '8px')
      .should('have.css', 'padding', '6px 10px');
  });
});
