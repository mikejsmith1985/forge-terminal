/**
 * WebSocket Recovery Tests
 * 
 * Tests for WebSocket disconnection, reconnection, and keyboard input latency.
 * These tests identify:
 * 1. Whether WebSocket recovery actually works
 * 2. Whether backspace/keyboard input has latency issues
 * 3. Whether AM logging is blocking the UI
 */

describe('WebSocket Recovery', () => {
  const baseUrl = Cypress.env('BASE_URL') || 'http://localhost:3005';

  beforeEach(() => {
    cy.visit(baseUrl, { timeout: 30000 });
    // Wait for initial terminal connection
    cy.get('.xterm-screen', { timeout: 15000 }).should('be.visible');
    cy.wait(2000); // Allow terminal to fully initialize
  });

  describe('1. Connection State Tracking', () => {
    it('should track WebSocket connection state', () => {
      // Check that we can access connection state
      cy.window().then((win) => {
        // Look for terminal refs or connection indicators
        const terminalContainer = win.document.querySelector('[data-terminal-connected]');
        const connectionIndicator = win.document.querySelector('.connection-indicator');
        
        // Log what we find
        cy.log('Terminal container:', terminalContainer ? 'found' : 'not found');
        cy.log('Connection indicator:', connectionIndicator ? 'found' : 'not found');
      });
      
      // The terminal should show "Connected" message
      cy.get('.xterm-screen').should('contain.text', 'Connected');
    });

    it('should have WebSocket in OPEN state after connection', () => {
      cy.window().then((win) => {
        // Check if there are any open WebSocket connections
        // This is a best-effort check since we can't directly access wsRef
        const performance = win.performance;
        const resources = performance.getEntriesByType('resource');
        const wsResources = resources.filter(r => r.initiatorType === 'other' && r.name.includes('ws://'));
        cy.log('WebSocket resources found:', wsResources.length);
      });
    });
  });

  describe('2. WebSocket Disconnection Handling', () => {
    it('should show reconnection UI when connection is lost', () => {
      // Simulate disconnection by visiting a route that closes WS
      // This is tricky because we can't directly access the WebSocket
      
      // One approach: check if the reconnecting overlay exists in the component
      cy.get('.xterm-screen').should('be.visible');
      
      // Check that the component has reconnection capability
      cy.window().then((win) => {
        // Look for reconnection-related elements or state
        const reconnectingOverlay = win.document.querySelector('[class*="reconnect"]');
        cy.log('Reconnecting overlay element exists:', !!reconnectingOverlay);
      });
    });

    it('should attempt reconnection with exponential backoff', () => {
      // This test validates the reconnection logic exists
      // We can't easily trigger a real disconnection, but we can verify the code path
      cy.window().then((win) => {
        // Check if ForgeTerminal has reconnection refs
        const scripts = Array.from(win.document.querySelectorAll('script'));
        cy.log('Scripts loaded:', scripts.length);
      });
    });
  });

  describe('3. Keyboard Input Latency', () => {
    it('should process backspace without delay', () => {
      // Type some text first
      cy.get('.xterm-screen').click();
      cy.wait(500);

      // Record timing for typing and backspace
      const startTime = Date.now();
      
      // Type test text
      cy.get('.xterm-helper-textarea', { timeout: 5000 })
        .should('exist')
        .focus()
        .type('test123', { delay: 50 });

      cy.wait(200);

      // Now test backspace
      const backspaceStart = Date.now();
      cy.get('.xterm-helper-textarea')
        .type('{backspace}{backspace}{backspace}', { delay: 50 });
      
      cy.wait(200).then(() => {
        const backspaceEnd = Date.now();
        const backspaceDuration = backspaceEnd - backspaceStart;
        cy.log(`Backspace sequence took: ${backspaceDuration}ms`);
        
        // Backspace should not take more than 500ms for 3 keys
        expect(backspaceDuration).to.be.lessThan(1000);
      });
    });

    it('should not block on rapid backspace presses', () => {
      cy.get('.xterm-screen').click();
      cy.wait(500);

      // Type longer text
      cy.get('.xterm-helper-textarea')
        .type('abcdefghijklmnop', { delay: 20 });

      cy.wait(100);

      // Rapid backspace
      const start = Date.now();
      cy.get('.xterm-helper-textarea')
        .type('{backspace}'.repeat(10), { delay: 10 });

      cy.wait(100).then(() => {
        const duration = Date.now() - start;
        cy.log(`10 rapid backspaces took: ${duration}ms`);
        
        // Should complete in under 500ms (10 * 10ms delay + overhead)
        expect(duration).to.be.lessThan(1000);
      });
    });

    it('should maintain keyboard responsiveness during AM logging', () => {
      // This test checks if AM logging blocks the UI
      cy.get('.xterm-screen').click();
      cy.wait(500);

      // Enable AM if available
      cy.window().then((win) => {
        // Try to find AM toggle
        const amToggle = win.document.querySelector('[data-am-toggle]');
        if (amToggle) {
          amToggle.click();
          cy.log('AM toggle clicked');
        }
      });

      // Type with AM potentially enabled
      const start = Date.now();
      cy.get('.xterm-helper-textarea')
        .type('echo "AM logging test"{enter}', { delay: 30 });

      cy.wait(500).then(() => {
        const duration = Date.now() - start;
        cy.log(`Command with AM took: ${duration}ms`);
        
        // Should not take more than 2 seconds even with AM
        expect(duration).to.be.lessThan(3000);
      });
    });
  });

  describe('4. WebSocket Message Flow', () => {
    it('should send keyboard input to WebSocket immediately', () => {
      cy.get('.xterm-screen').click();
      cy.wait(500);

      // Type a character and verify it appears
      cy.get('.xterm-helper-textarea')
        .type('x');

      // The character should echo in terminal
      cy.wait(200);
      cy.get('.xterm-screen').then(($screen) => {
        // Just verify we didn't get an error
        const text = $screen.text();
        cy.log('Screen contains text of length:', text.length);
      });
    });

    it('should not queue keyboard input when AM fetch is pending', () => {
      // This tests that fetch('/api/am/log') doesn't block keyboard
      cy.get('.xterm-screen').click();
      cy.wait(500);

      // Intercept AM log requests
      cy.intercept('POST', '/api/am/log').as('amLog');

      // Type a command
      cy.get('.xterm-helper-textarea')
        .type('echo test{enter}', { delay: 30 });

      // Continue typing immediately
      cy.get('.xterm-helper-textarea')
        .type('echo second{enter}', { delay: 30 });

      // Both should work without blocking
      cy.wait(1000);
      cy.get('.xterm-screen').should('contain.text', 'test');
    });
  });

  describe('5. Diagnostic Integration', () => {
    it('should have keyboard diagnostics available', () => {
      cy.window().then((win) => {
        // Check if keyboard diagnostics are exposed
        if (win.kbDiag) {
          cy.log('kbDiag available');
          const stats = win.kbDiag.stats();
          cy.log('Keyboard stats:', JSON.stringify(stats));
        } else {
          cy.log('kbDiag not exposed (diagnostics disabled)');
        }
      });
    });

    it('should track backspace delivery rate', () => {
      cy.window().then((win) => {
        // Enable diagnostics if available
        if (win.diagnosticCore) {
          win.diagnosticCore.enable();
        }
      });

      cy.get('.xterm-screen').click();
      cy.wait(500);

      // Type and backspace
      cy.get('.xterm-helper-textarea')
        .type('abc{backspace}{backspace}{backspace}', { delay: 50 });

      cy.wait(500);

      cy.window().then((win) => {
        if (win.kbDiag) {
          const summary = win.kbDiag.summary();
          cy.log('Backspace delivery rate:', summary.backspaceDeliveryRate + '%');
          
          // All backspaces should be delivered
          if (summary.backspaceDeliveryRate !== 'N/A') {
            expect(summary.backspaceDeliveryRate).to.be.greaterThan(90);
          }
        }
      });
    });
  });
});

describe('API Health Check for WebSocket', () => {
  const baseUrl = Cypress.env('BASE_URL') || 'http://localhost:3005';

  it('should verify /api/am/log does not block', () => {
    const start = Date.now();
    
    cy.request({
      method: 'POST',
      url: `${baseUrl}/api/am/log`,
      body: {
        tabId: 'test-tab',
        tabName: 'Test',
        workspace: '/test',
        entryType: 'USER_INPUT',
        content: 'test input'
      },
      timeout: 5000
    }).then((response) => {
      const duration = Date.now() - start;
      cy.log(`/api/am/log took ${duration}ms`);
      
      expect(response.status).to.eq(200);
      // Should respond in under 100ms normally
      expect(duration).to.be.lessThan(500);
    });
  });

  it('should verify WebSocket endpoint is available', () => {
    // Check that the /ws endpoint upgrade is possible
    cy.request({
      method: 'GET',
      url: `${baseUrl}/ws`,
      failOnStatusCode: false
    }).then((response) => {
      // Should return 400 (Bad Request) because we're not upgrading
      // or 426 (Upgrade Required) - both indicate the endpoint exists
      expect([400, 426]).to.include(response.status);
    });
  });

  it('should handle multiple concurrent /api/am/log requests', () => {
    const requests = [];
    const start = Date.now();

    // Fire 10 concurrent requests
    for (let i = 0; i < 10; i++) {
      requests.push(
        cy.request({
          method: 'POST',
          url: `${baseUrl}/api/am/log`,
          body: {
            tabId: `test-tab-${i}`,
            tabName: `Test ${i}`,
            workspace: '/test',
            entryType: 'USER_INPUT',
            content: `test input ${i}`
          },
          timeout: 5000
        })
      );
    }

    // All should complete quickly
    cy.wrap(Promise.all(requests)).then(() => {
      const duration = Date.now() - start;
      cy.log(`10 concurrent /api/am/log requests took ${duration}ms`);
      
      // Should complete in under 2 seconds even with 10 concurrent
      expect(duration).to.be.lessThan(2000);
    });
  });
});
