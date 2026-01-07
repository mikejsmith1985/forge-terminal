/**
 * Test case for LensFilePicker + File Viewer path resolution bug
 * 
 * BUG: When files are opened from LensFilePicker, relative paths from subdirectories
 * are not properly resolved against the rootPath in the backend.
 * 
 * Expected: File content should be displayed in MonacoEditor
 * Actual: Blank/empty editor (file fails to load)
 */

describe('LensFilePicker File Viewer - Path Resolution Bug', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('fileAccessModeSet', 'true');
        win.localStorage.setItem('fileAccessMode', 'restricted');
      }
    });
    cy.wait(3000);

    // Dismiss welcome tour
    cy.get('button').then(($buttons) => {
      const skipBtn = Array.from($buttons).find(btn => btn.textContent.includes('Skip'));
      if (skipBtn) cy.wrap(skipBtn).click({ force: true });
    });
    cy.wait(1000);
  });

  it('should display file content when opening file from subdirectory via LensFilePicker', () => {
    // Step 1: Click Files button
    cy.contains('button', 'Files', { timeout: 10000 }).click({ force: true });
    cy.wait(2000);

    // Step 2: Verify LensFilePicker loaded
    cy.get('.lens-picker', { timeout: 5000 }).should('be.visible');
    cy.get('.lens-file-item', { timeout: 5000 }).should('have.length.greaterThan', 0);

    // Step 3: Open copilot-instructions.md (in .github subdirectory)
    cy.get('.lens-file-item').then(($items) => {
      const item = Array.from($items).find(el =>
        el.textContent.includes('copilot-instructions.md')
      );
      expect(item, 'copilot-instructions.md file should be in the list').to.exist;
      cy.wrap(item).dblclick();
    });

    // Step 4: Editor panel should open
    cy.get('.editor-panel', { timeout: 5000 }).should('be.visible');

    // Step 5: CRITICAL TEST - Monaco editor should NOT show loading state forever
    cy.get('.monaco-loading', { timeout: 2000 }).should('not.exist');

    // Step 6: CRITICAL TEST - File content must be displayed (not blank)
    // The file contains "NEVER FUCKING KILL THE SESSION" at the top
    cy.get('.monaco-editor-wrapper', { timeout: 5000 })
      .should('be.visible')
      .within(() => {
        // Monaco loads content into a contenteditable div
        cy.get('[data-uri], .view-lines, .monaco-editor', { timeout: 5000 })
          .should('exist')
          .and('not.be.empty');
      });

    // Step 7: Verify the actual file content is present (not error message)
    cy.get('.monaco-editor-wrapper').should('contain.text', 'NEVER');

    // Step 8: Verify toolbar shows filename
    cy.get('.monaco-filename').should('contain', 'copilot-instructions.md');
  });

  it('should log file path information for debugging', () => {
    // Intercept the file read API call to inspect the request
    cy.intercept('POST', '/api/files/read').as('fileRead');

    // Click Files and open a file
    cy.contains('button', 'Files').click({ force: true });
    cy.wait(2000);

    cy.get('.lens-file-item').then(($items) => {
      const item = Array.from($items).find(el =>
        el.textContent.includes('copilot-instructions.md')
      );
      if (item) {
        cy.wrap(item).dblclick();
        
        // Wait for the API call and inspect it
        cy.wait('@fileRead', { timeout: 10000 }).then((interception) => {
          const requestBody = interception.request.body;
          cy.log('File Read Request:', JSON.stringify(requestBody));
          
          // Log what we got
          expect(requestBody).to.have.property('path');
          expect(requestBody).to.have.property('rootPath');
          
          cy.log(`Path: ${requestBody.path}`);
          cy.log(`RootPath: ${requestBody.rootPath}`);
          
          // The bug: path is relative (e.g. "copilot-instructions.md")
          // but backend resolves it against server cwd, not rootPath
        });
      }
    });
  });
});
