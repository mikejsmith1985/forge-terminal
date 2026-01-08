/**
 * Cypress E2E Tests: Tab Theme Controls
 * 
 * Tests the ability to control color themes and modes per tab:
 * 1. Right-click context menu theme selection
 * 2. Settings > Tab Controls with per-tab defaults
 * 3. Separate terminal/ribbon theme controls
 * 4. Visual diagram display
 */

describe('Tab Theme Controls', () => {
  beforeEach(() => {
    // Start Forge in a clean state
    cy.exec('go run cmd/forge/main.go', { timeout: 60000, failOnNonZeroExit: false });
    cy.wait(3000);
    cy.visit('http://localhost:8333');
    cy.wait(2000);
  });

  afterEach(() => {
    // Clean up
    cy.exec('taskkill /F /IM forge.exe', { failOnNonZeroExit: false });
  });

  describe('Right-Click Context Menu Theme Selection', () => {
    it('should show theme submenu when right-clicking a tab', () => {
      // Right-click on the first tab
      cy.get('.tab').first().rightclick();
      
      // Context menu should appear
      cy.get('.tab-context-menu').should('be.visible');
      
      // Should have a "Theme" option
      cy.get('.tab-context-menu').contains('Theme').should('exist');
    });

    it('should show all 10 themes in submenu', () => {
      cy.get('.tab').first().rightclick();
      cy.get('.tab-context-menu').contains('Theme').click();
      
      // Should show submenu with all themes
      const themes = ['Molten Metal', 'Deep Ocean', 'Forest', 'Midnight', 'Rose', 'Arctic', 
                     'High Contrast Dark', 'High Contrast Light', 'High Contrast Blue', 'High Contrast Yellow'];
      
      themes.forEach(theme => {
        cy.get('.theme-submenu').contains(theme).should('exist');
      });
    });

    it('should allow selecting theme + mode for a tab', () => {
      cy.get('.tab').first().rightclick();
      cy.get('.tab-context-menu').contains('Theme').click();
      cy.get('.theme-submenu').contains('Deep Ocean').click();
      
      // Should show mode selector (Dark/Light)
      cy.get('.mode-selector').should('be.visible');
      cy.get('.mode-selector').contains('Dark').click();
      
      // Tab should update with new theme
      cy.get('.tab').first().should('have.attr', 'data-theme', 'ocean');
      cy.get('.tab').first().should('have.attr', 'data-mode', 'dark');
    });

    it('should persist theme selection across page reload', () => {
      // Set a theme
      cy.get('.tab').first().rightclick();
      cy.get('.tab-context-menu').contains('Theme').click();
      cy.get('.theme-submenu').contains('Rose').click();
      cy.get('.mode-selector').contains('Light').click();
      
      // Reload page
      cy.reload();
      cy.wait(2000);
      
      // Theme should persist
      cy.get('.tab').first().should('have.attr', 'data-theme', 'rose');
      cy.get('.tab').first().should('have.attr', 'data-mode', 'light');
    });
  });

  describe('Settings Tab Controls', () => {
    beforeEach(() => {
      // Open Settings modal
      cy.get('[aria-label="Settings"]').click();
      cy.get('.settings-modal').should('be.visible');
    });

    it('should have a "Tab Controls" tab in Settings', () => {
      cy.get('.settings-tabs').contains('Tab Controls').should('exist');
    });

    it('should show global preset options', () => {
      cy.get('.settings-tabs').contains('Tab Controls').click();
      
      // Should show preset options
      cy.contains('Global Presets').should('exist');
      cy.contains('Auto-cycle (alternating dark/light)').should('exist');
      cy.contains('Dark mode only').should('exist');
      cy.contains('Light mode only').should('exist');
    });

    it('should show per-tab explicit defaults (1-20)', () => {
      cy.get('.settings-tabs').contains('Tab Controls').click();
      
      // Should show 20 tab slots
      cy.get('.tab-default-row').should('have.length', 20);
      
      // Each should have theme and mode selectors
      cy.get('.tab-default-row').first().find('select[name="theme"]').should('exist');
      cy.get('.tab-default-row').first().find('select[name="mode"]').should('exist');
    });

    it('should allow setting different theme for terminal vs ribbon', () => {
      cy.get('.settings-tabs').contains('Tab Controls').click();
      
      // Should have separate controls for terminal and ribbon
      cy.contains('Terminal Theme').should('exist');
      cy.contains('Control Ribbon Theme').should('exist');
      
      // Should be able to set different themes
      cy.get('select[name="terminalTheme"]').select('molten');
      cy.get('select[name="terminalMode"]').select('dark');
      cy.get('select[name="ribbonTheme"]').select('ocean');
      cy.get('select[name="ribbonMode"]').select('light');
      
      // Save and verify
      cy.contains('Save').click();
      cy.reload();
      cy.wait(2000);
      
      // Re-open settings and verify persistence
      cy.get('[aria-label="Settings"]').click();
      cy.get('.settings-tabs').contains('Tab Controls').click();
      cy.get('select[name="terminalTheme"]').should('have.value', 'molten');
      cy.get('select[name="ribbonTheme"]').should('have.value', 'ocean');
    });

    it('should display visual diagram explaining auto-cycle behavior', () => {
      cy.get('.settings-tabs').contains('Tab Controls').click();
      
      // Should show a visual diagram
      cy.get('.theme-diagram').should('exist');
      cy.get('.theme-diagram').should('be.visible');
      
      // Should show the alternating pattern
      cy.get('.theme-diagram').contains('Tab 1').should('exist');
      cy.get('.theme-diagram').contains('Dark').should('exist');
      cy.get('.theme-diagram').contains('Tab 2').should('exist');
      cy.get('.theme-diagram').contains('Light').should('exist');
    });

    it('should apply per-tab defaults when creating new tabs', () => {
      cy.get('.settings-tabs').contains('Tab Controls').click();
      
      // Set Tab 2 to use Rose theme in light mode
      cy.get('.tab-default-row').eq(1).find('select[name="theme"]').select('rose');
      cy.get('.tab-default-row').eq(1).find('select[name="mode"]').select('light');
      cy.contains('Save').click();
      
      // Close settings
      cy.get('.settings-modal').find('[aria-label="Close"]').click();
      
      // Create a new tab (should be Tab 2)
      cy.get('.new-tab-btn').click();
      
      // Verify Tab 2 has Rose theme in light mode
      cy.get('.tab').eq(1).should('have.attr', 'data-theme', 'rose');
      cy.get('.tab').eq(1).should('have.attr', 'data-mode', 'light');
    });
  });

  describe('Terminal vs Ribbon Theme Split', () => {
    it('should allow terminal dark mode with ribbon light mode', () => {
      // Open settings
      cy.get('[aria-label="Settings"]').click();
      cy.get('.settings-tabs').contains('Tab Controls').click();
      
      // Set terminal to dark, ribbon to light
      cy.get('input[name="splitThemes"]').check();
      cy.get('select[name="terminalMode"]').select('dark');
      cy.get('select[name="ribbonMode"]').select('light');
      cy.contains('Save').click();
      
      // Verify terminal is dark
      cy.get('.forge-terminal').should('have.attr', 'data-mode', 'dark');
      
      // Verify ribbon is light
      cy.get('.app-sidebar').should('have.attr', 'data-mode', 'light');
    });

    it('should use global setting when split is disabled', () => {
      cy.get('[aria-label="Settings"]').click();
      cy.get('.settings-tabs').contains('Tab Controls').click();
      
      // Ensure split is disabled
      cy.get('input[name="splitThemes"]').uncheck();
      
      // Terminal and ribbon should use same theme/mode
      cy.get('.forge-terminal').invoke('attr', 'data-mode').then(terminalMode => {
        cy.get('.app-sidebar').should('have.attr', 'data-mode', terminalMode);
      });
    });
  });

  describe('Theme Persistence', () => {
    it('should save theme settings to localStorage', () => {
      cy.get('.tab').first().rightclick();
      cy.get('.tab-context-menu').contains('Theme').click();
      cy.get('.theme-submenu').contains('Forest').click();
      cy.get('.mode-selector').contains('Dark').click();
      
      // Verify localStorage
      cy.window().then(win => {
        const sessions = JSON.parse(win.localStorage.getItem('sessions') || '{}');
        expect(sessions.tabs[0].colorTheme).to.equal('forest');
        expect(sessions.tabs[0].mode).to.equal('dark');
      });
    });

    it('should restore all 20 tab defaults from backend on reload', () => {
      // Set defaults for tabs 1-5
      cy.get('[aria-label="Settings"]').click();
      cy.get('.settings-tabs').contains('Tab Controls').click();
      
      for (let i = 0; i < 5; i++) {
        cy.get('.tab-default-row').eq(i).find('select[name="theme"]').select('midnight');
        cy.get('.tab-default-row').eq(i).find('select[name="mode"]').select('light');
      }
      
      cy.contains('Save').click();
      cy.reload();
      cy.wait(2000);
      
      // Re-open and verify
      cy.get('[aria-label="Settings"]').click();
      cy.get('.settings-tabs').contains('Tab Controls').click();
      
      for (let i = 0; i < 5; i++) {
        cy.get('.tab-default-row').eq(i).find('select[name="theme"]').should('have.value', 'midnight');
        cy.get('.tab-default-row').eq(i).find('select[name="mode"]').should('have.value', 'light');
      }
    });
  });
});
