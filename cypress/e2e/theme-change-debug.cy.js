describe('Theme Change with Console Logging', () => {
  let logs = [];

  beforeEach(() => {
    logs = [];
    cy.visit('http://localhost:8333', {
      onBeforeLoad(win) {
        // Capture console.log
        cy.stub(win.console, 'log').callsFake((...args) => {
          logs.push({ type: 'log', args });
        });
        cy.stub(win.console, 'warn').callsFake((...args) => {
          logs.push({ type: 'warn', args });
        });
        cy.stub(win.console, 'error').callsFake((...args) => {
          logs.push({ type: 'error', args });
        });
      }
    });
    cy.wait(3000);
    
    // Dismiss tour if present
    cy.get('body').then($body => {
      if ($body.find('.tour-backdrop').length > 0) {
        cy.contains('button', 'Skip').click({force: true});
        cy.wait(500);
      }
    });
  });

  it('should log theme change events', () => {
    // Get the first tab and CLICK IT to make it active
    cy.get('.tab').first().as('firstTab');
    cy.get('@firstTab').click();
    cy.wait(1000);
    
    // Right-click to open context menu
    cy.get('@firstTab').rightclick();
    cy.wait(500);
    
    // Click Theme button
    cy.contains('button', 'Theme').click();
    cy.wait(500);
    
    // Click Molten Dark (different from current theme)
    cy.get('.theme-submenu').within(() => {
      cy.contains('.theme-name', 'Molten').parent().within(() => {
        cy.contains('button', 'Dark').click();
      });
    });
    
    cy.wait(2000);
    
    // Print all console logs
    cy.then(() => {
      cy.log('=== Console Logs ===');
      logs.forEach(log => {
        const msg = log.args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        cy.log(`[${log.type}] ${msg}`);
      });
      
      // Check for specific logs
      const themeChangeLogs = logs.filter(log => 
        log.args.some(arg => 
          String(arg).includes('handleThemeChange') || 
          String(arg).includes('changeTabTheme') ||
          String(arg).includes('Theme useEffect')
        )
      );
      
      cy.log(`Found ${themeChangeLogs.length} theme-related logs`);
      
      // Write logs to file for inspection
      cy.writeFile('theme-change-logs.json', { logs, themeChangeLogs });
    });
  });
});
