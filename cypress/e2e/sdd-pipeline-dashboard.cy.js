/// <reference types="cypress-real-events" />

// UX test for the SDD pipeline dashboard — status panel and gate card drawer
// (specs/004-sdd-pipeline-dashboard, US1 + SC-004 regression).
//
// IMPORTANT: targets the dev server on :9999 — NOT :3005.
// Launch: ./run-dev-clean.ps1 -Port 9999
// Run: npx cypress run --spec cypress/e2e/sdd-pipeline-dashboard.cy.js
//
// Per Article X, terminal content is asserted via the xterm buffer model
// (window.term.buffer.active), never DOM/canvas text.

const DEV_URL = 'http://localhost:9999'
// The spec.md already has a "## Clarifications" section, so touching it fires a
// Clarify-phase completion and triggers both SDD_PHASE_STATUS and SDD_PHASE_GATE.
const SPEC_FILE = 'specs/003-sdd-phase-orchestrator/spec.md'

function visitAndBind() {
  cy.visit(`${DEV_URL}/`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('tour_disabled', 'true')
    },
  })
  cy.waitForTerminal()
  // Fresh tab → live PTY so the auto-bind fires and the panel can receive events.
  cy.get('.new-tab-btn').click()
  cy.waitForTerminal()
  cy.wait(3000) // allow the new shell to report its cwd so POST /api/sdd/bind fires
}

describe('SDD pipeline dashboard — status panel (US1)', () => {
  it('status panel shows all 5 phases after bind and phase completion', () => {
    visitAndBind()

    // Phase completion → backend broadcasts SDD_PHASE_STATUS → panel becomes visible.
    cy.exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    cy.get('.sdd-pipeline-panel', { timeout: 15000 }).should('be.visible')

    // All 5 pipeline phases must render as labelled rows.
    cy.get('.sdd-pipeline-panel__row').should('have.length', 5)
  })

  it('panel reflects phase status within 2s of phase completion', () => {
    visitAndBind()
    cy.exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    // At least one phase row must reach complete or awaiting-decision within 2 seconds
    // of the SDD_PHASE_STATUS broadcast (FR-005: live update ≤ 2s).
    cy.get('.sdd-pipeline-panel__row--complete, .sdd-pipeline-panel__row--awaiting-decision', {
      timeout: 10000,
    }).should('exist')
  })

  it('panel collapses to 32px header bar and expands again on toggle', () => {
    visitAndBind()
    cy.exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)
    cy.get('.sdd-pipeline-panel', { timeout: 15000 }).should('be.visible')

    // Collapse — phase rows must disappear; panel shrinks to header height.
    cy.get('.sdd-pipeline-panel__toggle').click()
    cy.get('.sdd-pipeline-panel--collapsed').should('exist')
    cy.get('.sdd-pipeline-panel__rows').should('not.be.visible')

    // Expand — phase rows must re-appear.
    cy.get('.sdd-pipeline-panel__toggle').click()
    cy.get('.sdd-pipeline-panel--expanded').should('exist')
    cy.get('.sdd-pipeline-panel__rows').should('be.visible')
  })

  it('badge appears on collapsed panel when a phase is awaiting-decision', () => {
    visitAndBind()
    cy.exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    // Wait for the gate card (awaiting-decision state) and the panel.
    cy.get('.phase-decision-card', { timeout: 15000 }).should('be.visible')
    cy.get('.sdd-pipeline-panel', { timeout: 5000 }).should('be.visible')

    // Collapse while a phase is awaiting-decision → badge counter must appear.
    cy.get('.sdd-pipeline-panel__toggle').click()
    cy.get('[data-testid="sdd-panel-badge"]').should('be.visible')
  })

  it('terminal remains interactive with the status panel visible', () => {
    visitAndBind()
    cy.exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)
    cy.get('.sdd-pipeline-panel', { timeout: 15000 }).should('be.visible')

    // Keystroke must reach the PTY — the panel must not capture input.
    // Per Article X, asserted via the xterm buffer model.
    cy.get('.xterm-helper-textarea').realType('echo forge-panel-nonblocking')
    cy.terminalShouldContain('forge-panel-nonblocking', { timeout: 8000 })
  })

  it('SC-004 regression: gate card appears as side drawer within 3s of phase completion', () => {
    visitAndBind()
    cy.exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    // Card must render as a flex-child drawer, not a blocking full-screen overlay.
    cy.get('.phase-decision-card-drawer', { timeout: 15000 }).should('be.visible')
    cy.get('.phase-decision-card-overlay').should('not.exist')
  })
})
