/// <reference types="cypress-real-events" />

// UX test for the SDD phase orchestrator decision card (specs/003-sdd-phase-orchestrator).
//
// IMPORTANT: this exercises a feature that only exists in the dev build, so it targets the
// dev server on :9999 — NOT the production baseUrl (:3005). Launch the dev build first:
//   ./run-dev-clean.ps1 -Port 9999
// then run:  npx cypress run --spec cypress/e2e/sdd-phase-gate.cy.js
//
// Per Article X, terminal output is asserted via the xterm buffer model (window.term.buffer
// .active) through the repo's terminalShouldContain command, never the DOM/canvas.

const DEV_URL = 'http://localhost:9999'
// The feature directory's spec.md already contains a "## Clarifications" section, so a write
// to it classifies as a Clarify-phase completion (see internal/sdd/detector.go).
const SPEC_FILE = 'specs/003-sdd-phase-orchestrator/spec.md'
// Approving the Clarify gate advances to Plan, so the orchestrator injects this command.
const NEXT_COMMAND = 'speckit-plan'

describe('SDD phase orchestrator — in-terminal decision card', () => {
  it('shows a decision card on phase completion and Approve injects the next command', () => {
    cy.visit(`${DEV_URL}/`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('tour_disabled', 'true')
      },
    })

    cy.waitForTerminal()

    // Open a FRESH tab so the pipeline binds to a live PTY. A reused/restored session's
    // backend PTY is detached, so an injected command would write successfully but never
    // render in the replayed view. A fresh tab is also what real macro cards inject into.
    // The frontend auto-binds the active session + repo once its cwd is known (POST /api/sdd/bind).
    cy.get('.new-tab-btn').click()
    cy.waitForTerminal()
    cy.wait(3000) // let the new shell connect and report its cwd so auto-bind fires

    // Trigger a phase completion by touching spec.md's modification time (no content change).
    // The real tutor.Watcher polls (2s) and debounces (3s), so the gate arrives within ~6s.
    cy.exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    // The decision card appears beside the terminal — no browser tab, no context switch.
    cy.get('.phase-decision-card', { timeout: 15000 }).should('be.visible')
    cy.get('.phase-decision-card-phase').should('contain', 'clarify')

    // Approving advances the pipeline by injecting the next phase command into the terminal.
    cy.get('.phase-decision-card-button-approve').realClick()

    // The card dismisses, and the injected command appears in the real terminal buffer.
    cy.get('.phase-decision-card').should('not.exist')
    cy.terminalShouldContain(NEXT_COMMAND, { timeout: 20000 })
  })

  it('Reject stops the pipeline and injects nothing', () => {
    cy.visit(`${DEV_URL}/`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('tour_disabled', 'true')
      },
    })
    cy.waitForTerminal()

    // Fresh tab → live PTY (see the note in the first test).
    cy.get('.new-tab-btn').click()
    cy.waitForTerminal()
    cy.wait(3000)

    cy.exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)
    cy.get('.phase-decision-card', { timeout: 15000 }).should('be.visible')

    cy.get('.phase-decision-card-button-reject').realClick()
    cy.get('.phase-decision-card').should('not.exist')

    // No next-phase command should have been injected by a Reject.
    cy.window().should((win) => {
      const buffer = win.term.buffer.active
      let text = ''
      for (let lineIndex = 0; lineIndex < buffer.length; lineIndex++) {
        const line = buffer.getLine(lineIndex)
        if (line) text += line.translateToString(true) + '\n'
      }
      expect(text).to.not.include(NEXT_COMMAND)
    })
  })
})
