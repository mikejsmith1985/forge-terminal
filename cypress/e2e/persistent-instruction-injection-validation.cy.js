/**
 * Cypress Test: Persistent Instruction Injection Validation
 * 
 * Following copilot-instructions.md Phase 4: Deterministic Verification & Proof
 * 
 * This test validates that persistent instructions are actually injected into
 * LLM commands by reading the xterm.js buffer (NOT the DOM).
 */

describe('Persistent Instruction Injection - Deterministic Validation', () => {
  beforeEach(() => {
    cy.visit('http://localhost:9999');
    cy.wait(3000); // Allow app to fully initialize
  });

  it('should inject persistent instruction into copilot command', () => {
    // Step 1: Configure persistent instruction via API
    const testInstruction = 'INJECTED_CONTEXT_VALIDATION_TEST_12345';
    
    cy.request({
      method: 'POST',
      url: 'http://localhost:9999/api/persistent-instruction',
      body: {
        enabled: true,
        template: testInstruction
      }
    }).then((response) => {
      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('success');
      cy.log('✅ API config saved');
    });

    // Step 2: Get WebSocket connection and send PROMPT_INJECTION_CONFIG
    cy.window().then((win) => {
      // Access the WebSocket connection
      const wsMap = win.wsConnections;
      if (!wsMap || wsMap.size === 0) {
        throw new Error('No WebSocket connections found');
      }

      const ws = Array.from(wsMap.values())[0];
      
      // Send persistent instruction config via WebSocket
      const config = {
        type: 'PROMPT_INJECTION_CONFIG',
        enabled: true,
        instruction: testInstruction
      };
      
      ws.send(JSON.stringify(config));
      cy.log('✅ Sent WebSocket config');
    });

    // Wait for config to be processed
    cy.wait(1000);

    // Step 3: Type a copilot command (but DON'T press enter yet)
    cy.get('.xterm-helper-textarea')
      .first()
      .focus()
      .type('echo "BEFORE_INJECTION"', { delay: 50 });

    // Step 4: Read terminal buffer BEFORE enter (baseline)
    cy.window().then((win) => {
      const term = win.terminalInstances?.[Object.keys(win.terminalInstances)[0]]?.terminal;
      if (!term) {
        throw new Error('Terminal instance not found');
      }

      const bufferBefore = [];
      for (let i = 0; i < term.buffer.active.length; i++) {
        const line = term.buffer.active.getLine(i);
        if (line) {
          bufferBefore.push(line.translateToString(true));
        }
      }
      
      cy.log('Buffer before Enter:', bufferBefore.join('\n'));
      win.bufferBefore = bufferBefore;
    });

    // Step 5: Press Enter
    cy.get('.xterm-helper-textarea')
      .first()
      .type('{enter}', { delay: 100 });

    // Wait for command to execute
    cy.wait(500);

    // Step 6: Read terminal buffer AFTER enter
    cy.window().then((win) => {
      const term = win.terminalInstances?.[Object.keys(win.terminalInstances)[0]]?.terminal;
      
      const bufferAfter = [];
      for (let i = 0; i < term.buffer.active.length; i++) {
        const line = term.buffer.active.getLine(i);
        if (line) {
          bufferAfter.push(line.translateToString(true));
        }
      }
      
      cy.log('Buffer after Enter:', bufferAfter.join('\n'));
      
      // Verify the command was executed
      const bufferText = bufferAfter.join('\n');
      expect(bufferText).to.include('BEFORE_INJECTION');
      
      cy.log('✅ Command executed (baseline test)');
    });

    // Step 7: Now test with ACTUAL LLM command
    cy.wait(1000);
    
    cy.get('.xterm-helper-textarea')
      .first()
      .focus()
      .clear()
      .type('copilot test prompt', { delay: 50 });

    cy.wait(500);

    // Step 8: Press Enter for copilot command
    cy.get('.xterm-helper-textarea')
      .first()
      .type('{enter}', { delay: 100 });

    // Wait for injection to happen
    cy.wait(2000);

    // Step 9: Read buffer to verify injection happened
    cy.window().then((win) => {
      const term = win.terminalInstances?.[Object.keys(win.terminalInstances)[0]]?.terminal;
      
      const finalBuffer = [];
      for (let i = 0; i < term.buffer.active.length; i++) {
        const line = term.buffer.active.getLine(i);
        if (line) {
          finalBuffer.push(line.translateToString(true));
        }
      }
      
      const bufferText = finalBuffer.join('\n');
      cy.log('Final buffer:', bufferText);
      
      // CRITICAL VALIDATION: Check if the injected context appears in the buffer
      // This proves the backend modified the command before sending to PTY
      if (bufferText.includes('INJECTED_CONTEXT_VALIDATION_TEST_12345')) {
        cy.log('✅ INJECTION SUCCESSFUL: Context found in terminal buffer');
      } else {
        cy.log('❌ INJECTION FAILED: Context NOT found in terminal buffer');
        cy.log('Buffer contents:', bufferText);
        throw new Error('Persistent instruction was NOT injected into copilot command');
      }
    });
  });

  it('should NOT inject into regular shell commands', () => {
    // Configure persistent instruction
    const testInstruction = 'THIS_SHOULD_NOT_APPEAR';
    
    cy.request({
      method: 'POST',
      url: 'http://localhost:9999/api/persistent-instruction',
      body: {
        enabled: true,
        template: testInstruction
      }
    });

    // Send WebSocket config
    cy.window().then((win) => {
      const ws = Array.from(win.wsConnections.values())[0];
      ws.send(JSON.stringify({
        type: 'PROMPT_INJECTION_CONFIG',
        enabled: true,
        instruction: testInstruction
      }));
    });

    cy.wait(1000);

    // Type a regular shell command (NOT an LLM command)
    cy.get('.xterm-helper-textarea')
      .first()
      .focus()
      .type('echo "Regular command"', { delay: 50 })
      .type('{enter}');

    cy.wait(500);

    // Verify injection did NOT happen
    cy.window().then((win) => {
      const term = win.terminalInstances?.[Object.keys(win.terminalInstances)[0]]?.terminal;
      
      const buffer = [];
      for (let i = 0; i < term.buffer.active.length; i++) {
        const line = term.buffer.active.getLine(i);
        if (line) {
          buffer.push(line.translateToString(true));
        }
      }
      
      const bufferText = buffer.join('\n');
      
      // Should NOT contain the injection
      expect(bufferText).not.to.include('THIS_SHOULD_NOT_APPEAR');
      cy.log('✅ Regular command was NOT modified (correct behavior)');
    });
  });
});
