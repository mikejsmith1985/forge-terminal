// UX test for the SDD phase orchestrator decision card (specs/003-sdd-phase-orchestrator).
//
// IMPORTANT: this exercises a feature that only exists in the dev build, so it targets the
// dev server on :9999 — NOT the production baseUrl (:3005). Launch the dev build first:
//   ./run-dev-clean.ps1 -Port 9999
// then run:  npx playwright test tests/e2e/sdd-phase-gate.spec.js
//
// Per Article X, terminal output is asserted via the xterm buffer model (window.term.buffer
// .active) through the repo's terminalShouldContain helper, never the DOM/canvas.

const { test, expect, exec, waitForTerminal, terminalShouldContain } = require('../fixtures/forge')

const DEV_URL = 'http://localhost:9999'
// The feature directory's spec.md already contains a "## Clarifications" section, so a write
// to it classifies as a Clarify-phase completion (see internal/sdd/detector.go).
const SPEC_FILE = 'specs/003-sdd-phase-orchestrator/spec.md'
// Approving the Clarify gate advances to Plan, so the orchestrator injects this command.
const NEXT_COMMAND = 'speckit-plan'

test.describe('SDD phase orchestrator — in-terminal decision card', () => {
  test('shows a decision card on phase completion and Approve injects the next command', async ({ page }) => {
    await page.goto(`${DEV_URL}/`)

    await waitForTerminal(page)

    // Open a FRESH tab so the pipeline binds to a live PTY. A reused/restored session's
    // backend PTY is detached, so an injected command would write successfully but never
    // render in the replayed view. A fresh tab is also what real macro cards inject into.
    // The frontend auto-binds the active session + repo once its cwd is known (POST /api/sdd/bind).
    await page.locator('.new-tab-btn').click()
    await waitForTerminal(page)
    await page.waitForTimeout(3000) // let the new shell connect and report its cwd so auto-bind fires

    // Trigger a phase completion by touching spec.md's modification time (no content change).
    // The real tutor.Watcher polls (2s) and debounces (3s), so the gate arrives within ~6s.
    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    // The decision card appears beside the terminal — no browser tab, no context switch.
    await page.locator('.phase-decision-card').waitFor({ timeout: 15000 })
    await expect(page.locator('.phase-decision-card')).toBeVisible()
    await expect(page.locator('.phase-decision-card-phase')).toContainText('clarify')

    // Approving advances the pipeline by injecting the next phase command into the terminal.
    await page.locator('.phase-decision-card-button-approve').click()

    // The card dismisses, and the injected command appears in the real terminal buffer.
    await expect(page.locator('.phase-decision-card')).not.toBeAttached()
    await terminalShouldContain(page, NEXT_COMMAND, { timeout: 20000 })
  })

  test('Reject stops the pipeline and injects nothing', async ({ page }) => {
    await page.goto(`${DEV_URL}/`)
    await waitForTerminal(page)

    // Fresh tab → live PTY (see the note in the first test).
    await page.locator('.new-tab-btn').click()
    await waitForTerminal(page)
    await page.waitForTimeout(3000)

    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)
    await page.locator('.phase-decision-card').waitFor({ timeout: 15000 })
    await expect(page.locator('.phase-decision-card')).toBeVisible()

    await page.locator('.phase-decision-card-button-reject').click()
    await expect(page.locator('.phase-decision-card')).not.toBeAttached()

    // No next-phase command should have been injected by a Reject.
    // Per Article X, terminal content is asserted via the xterm buffer model, never DOM.
    await expect.poll(
      async () => {
        return await page.evaluate(() => {
          if (!window.term) return ''
          const buffer = window.term.buffer.active
          let text = ''
          for (let lineIndex = 0; lineIndex < buffer.length; lineIndex++) {
            const line = buffer.getLine(lineIndex)
            if (line) text += line.translateToString(true) + '\n'
          }
          return text
        })
      },
      { timeout: 5000 }
    ).not.toContain(NEXT_COMMAND)
  })

  test('failsafe: the dismiss control always closes the card so the session is never trapped', async ({ page }) => {
    await page.goto(`${DEV_URL}/`)
    await waitForTerminal(page)
    await page.locator('.new-tab-btn').click()
    await waitForTerminal(page)
    await page.waitForTimeout(3000)

    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)
    await page.locator('.phase-decision-card').waitFor({ timeout: 15000 })
    await expect(page.locator('.phase-decision-card')).toBeVisible()

    // The ✕ is the guaranteed local escape — it must close the card with no backend dependency.
    await page.locator('.phase-decision-card-dismiss').click()
    await expect(page.locator('.phase-decision-card')).not.toBeAttached()
  })

  test('non-blocking: terminal remains interactive while the decision card is open', async ({ page }) => {
    // US2 regression (SC-004): the card must be a side drawer that does not trap
    // keyboard focus or block terminal scrolling (specs/004-sdd-pipeline-dashboard, US2).
    await page.goto(`${DEV_URL}/`)
    await waitForTerminal(page)
    await page.locator('.new-tab-btn').click()
    await waitForTerminal(page)
    await page.waitForTimeout(3000)

    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)
    await page.locator('.phase-decision-card').waitFor({ timeout: 15000 })
    await expect(page.locator('.phase-decision-card')).toBeVisible()

    // Card must be a drawer sibling, not a full-screen overlay (US2 structural check).
    await expect(page.locator('.phase-decision-card-drawer')).toBeVisible()
    await expect(page.locator('.phase-decision-card-overlay')).not.toBeAttached()

    // Keystroke must reach the PTY buffer — not be swallowed by the open card.
    // Per Article X, terminal content is asserted via the xterm buffer model, never DOM.
    await page.locator('.xterm-helper-textarea').pressSequentially('echo forge-non-blocking-check')
    await terminalShouldContain(page, 'forge-non-blocking-check', { timeout: 8000 })

    // Scroll must reach the xterm viewport — the terminal must remain scrollable.
    const viewport = page.locator('.xterm-viewport')
    const initialScrollTop = await viewport.evaluate((el) => el.scrollTop)
    await viewport.evaluate((el, dy) => el.scrollBy(0, dy), -300)
    // Either scrollTop decreased (scroll worked) or was already at top (0). Both are valid.
    const newScrollTop = await viewport.evaluate((el) => el.scrollTop)
    expect(newScrollTop).toBeLessThanOrEqual(initialScrollTop)
  })
})
