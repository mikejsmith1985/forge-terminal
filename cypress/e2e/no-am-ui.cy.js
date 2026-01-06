/// <reference types="cypress" />

/**
 * E2E Test: Verify AM UI elements are removed
 * 
 * Context: v3.12.3 cleanup removed unimplemented features
 * - SLM/routing/Task Dashboard were fake scaffolding
 * - AM backend tracking still works (/api/am/v2/*)
 * - BUT: AM UI elements (toasts, indicators, toggles) removed from user view
 * 
 * What we're testing:
 * 1. No "🧠 AM tracking started" toast when running command cards
 * 2. No "AM Logging" indicator in tab titles
 * 3. No AM toggle button in tab context menu
 * 4. No AM visual indicator (BookOpen icon) on tabs
 */

describe('No AM UI Elements', () => {
  const BASE_URL = 'http://localhost:3005';

  beforeEach(() => {
    cy.visit(BASE_URL);
    cy.wait(2000); // Wait for app to fully load
    
    // Dismiss tour if it appears (conditional check)
    cy.get('body').then($body => {
      const tourElements = $body.find('.tour-modal, .tour-backdrop');
      if (tourElements.length > 0) {
        // Tour is present, try to close it
        const closeButton = $body.find('.tour-modal button, .tour-close').first();
        if (closeButton.length > 0) {
          closeButton.click();
          cy.wait(500);
        }
      }
    });
  });

  it('should not show AM toast notifications', () => {
    // Wait a bit for any initial toasts to appear
    cy.wait(2000);
    
    // Check if toast container exists and check its content
    cy.get('body').then($body => {
      const toastText = $body.text();
      expect(toastText).to.not.include('AM tracking');
      expect(toastText).to.not.include('AM Logging');
      expect(toastText).to.not.include('🧠');
    });
  });

  it('should not show "AM Logging" in tab title', () => {
    // Get the active tab element
    cy.get('.tab.active').first().should('exist');
    
    // Check the title attribute (tooltip) doesn't mention AM
    cy.get('.tab.active').first().invoke('attr', 'title').then(title => {
      if (title) {
        expect(title.toLowerCase()).to.not.include('am logging');
        expect(title.toLowerCase()).to.not.include('am tracking');
      }
    });

    // Check visible text doesn't mention AM
    cy.get('.tab.active').first().invoke('text').then(text => {
      expect(text.toLowerCase()).to.not.include('am logging');
      expect(text.toLowerCase()).to.not.include('am tracking');
    });
  });

  it('should not show AM indicator icon on tabs', () => {
    // Check that there's no .am-indicator element
    cy.get('.am-indicator').should('not.exist');
    
    // Check that tab doesn't have am-enabled class
    cy.get('.tab').first().should('not.have.class', 'am-enabled');
  });

  it('should not show AM toggle in tab context menu', () => {
    // Right-click on the active tab to open context menu
    cy.get('.tab.active').first().rightclick({ force: true });
    cy.wait(500); // Wait for menu to appear

    // Check if context menu exists
    cy.get('.tab-context-menu').should('exist');

    // Verify no button with "AM Logging" text
    cy.get('.tab-context-menu').within(() => {
      cy.get('button').each($btn => {
        const text = $btn.text();
        expect(text).to.not.include('AM Logging');
        expect(text).to.not.include('AM Tracking');
      });
    });

    // Close menu by clicking elsewhere
    cy.get('body').click(0, 0, { force: true });
  });

  it('should not show brain emoji (🧠) anywhere in main UI', () => {
    // Exclude ForgeAssist sidebar and IconPicker which legitimately use 🧠
    cy.get('body').then($body => {
      const mainContent = $body.find('.app-container, .tabs-container, .terminal-container, .toast-container');
      const visibleText = mainContent.text();
      
      // Check main UI areas don't have brain emoji
      expect(visibleText).to.not.include('🧠');
    });
  });

  it('should still have functional tab switching and terminal', () => {
    // Verify basic functionality still works after AM UI removal
    cy.get('.tab').should('have.length.at.least', 1);
    cy.get('.terminal-container').should('be.visible');
    
    // Verify terminal is loaded (xterm-screen should exist)
    cy.get('.xterm-screen', { timeout: 10000 }).should('exist');
  });
});
