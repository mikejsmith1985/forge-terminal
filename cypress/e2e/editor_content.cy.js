describe('Editor Content Loading', () => {
  beforeEach(() => {
    cy.visit('/');
    // Wait for initial load
    cy.get('.terminal-container', { timeout: 10000 }).should('be.visible');
  });

  it('opens a file and displays its content', () => {
    // 1. Open File Picker
    cy.contains('button', 'Files').click();
    
    // 2. Handle File Access Prompt if it appears
    // We check if the modal exists.
    cy.get('body').then(($body) => {
      if ($body.find('button:contains("Confirm Selection")').length > 0) {
        cy.contains('button', 'Confirm Selection').click();
      }
    });

    // 3. Double click the test file
    cy.contains('.lens-file-name', 'README.md').scrollIntoView().dblclick({ force: true });
    
    // 4. Assert Editor is visible
    cy.get('.monaco-editor-container').should('be.visible');
    
    // 5. Assert Content
    // Wait for content to load
    cy.wait(2000); // Give it some time to fetch
    // Check if Monaco Editor contains the text.
    // Monaco renders text in lines.
    cy.contains('.monaco-editor', 'Forge Terminal').should('exist');
  });
});
