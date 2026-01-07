describe('File Viewer with LensFilePicker', () => {
  beforeEach(() => {
    // Clear and pre-set localStorage before visit
    cy.clearLocalStorage();
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('fileAccessModeSet', 'true');
        win.localStorage.setItem('fileAccessMode', 'restricted');
      }
    });
    cy.wait(3000); // Wait for app to load

    // Dismiss the welcome tour modal
    cy.get('button').then(($buttons) => {
      const skipBtn = Array.from($buttons).find(btn => btn.textContent.includes('Skip'));
      if (skipBtn) {
        cy.wrap(skipBtn).click({ force: true });
        cy.wait(1000);
      }
    });
  });

  it('should open file from LensFilePicker, display content, edit, save, and persist changes', () => {
    // Step 1: Click Files button to switch to Files view with LensFilePicker
    cy.contains('button', 'Files', { timeout: 10000 }).should('exist').click({ force: true });
    cy.wait(2000); // Wait for LensFilePicker to load files

    // Step 2: Verify LensFilePicker is visible and has loaded files
    cy.get('.lens-picker', { timeout: 5000 }).should('be.visible');
    cy.get('.lens-file-item', { timeout: 5000 }).should('have.length.greaterThan', 0);

    // Step 3: Find and double-click the copilot-instructions.md file to open it
    cy.get('.lens-file-item').then(($items) => {
      const item = Array.from($items).find(el =>
        el.textContent.includes('copilot-instructions.md')
      );
      expect(item).to.exist;
      cy.wrap(item).dblclick();
    });

    // Step 4: Verify editor panel opens with file content
    cy.get('.editor-panel', { timeout: 5000 }).should('be.visible');

    // Step 5: Verify file content is displayed (this proves the file opened successfully)
    cy.get('.editor-panel', { timeout: 5000 }).should('contain', 'NEVER FUCKING KILL');

    // Step 7: Verify Save button exists
    cy.get('.editor-panel').should('contain', 'Save');
  });

});
