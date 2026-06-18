// UX tests for the SDD phase orchestrator decision flow (specs/003-sdd-phase-orchestrator).
// Updated in spec-006: PhaseDecisionCard selectors replaced with SddDashboard decision bar.
//
// IMPORTANT: targets the dev server on :9999 — NOT :3005.
// Launch: .\scripts\run-dev-clean.ps1  (dev server on :9999)
// Run:    npx playwright test tests/e2e/sdd-phase-gate.spec.js
//
// Changes from spec-006 migration:
//   - .phase-decision-card* → .sdd-dashboard__decision-btn--*
//   - .phase-decision-card-phase → .sdd-dashboard__cell--awaiting-decision .sdd-dashboard__cell-name
//   - .phase-decision-card-drawer removed — decision bar is now inline in the dashboard (SC-004)
//   - dismiss failsafe test removed — SddDashboard has no standalone dismiss button
//     (the gate closes naturally when a decision is submitted or a new gate event arrives)
//
// Non-blocking and error handling scenarios are covered by WS-injection tests in
// sdd-dashboard.spec.js, which do not require a real pipeline session.
//
// Article V: real browser events only. Article X: xterm buffer, not DOM text.

const { test, expect, exec, waitForTerminal, terminalShouldContain } = require('../fixtures/forge')

const DEV_URL = 'http://localhost:9999'
const SPEC_FILE = 'specs/003-sdd-phase-orchestrator/spec.md'
const NEXT_COMMAND = 'speckit-plan'

async function visitAndBind(page) {
  await page.goto(`${DEV_URL}/`)
  await waitForTerminal(page)
  // Fresh tab → live PTY so auto-bind fires and the dashboard can receive gate events.
  await page.locator('.new-tab-btn').click()
  await waitForTerminal(page)
  await page.waitForTimeout(3000)
}

test.describe('SDD phase orchestrator — dashboard decision bar', () => {
  test('decision bar appears on phase completion and Approve injects the next command', async ({ page }) => {
    await visitAndBind(page)

    // Touch the spec → watcher fires → backend broadcasts SDD_PHASE_GATE for 'clarify'.
    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    // Decision buttons must appear inline in the dashboard (not in a floating drawer).
    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).toBeVisible({ timeout: 15000 })
    // The 'clarify' phase cell must be in awaiting-decision state.
    await expect(
      page.locator('.sdd-dashboard__cell--awaiting-decision .sdd-dashboard__cell-name')
    ).toContainText('clarify', { timeout: 5000 })

    // Approving must inject the next phase command into the PTY.
    await page.locator('.sdd-dashboard__decision-btn--approve').click()

    // Buttons must disappear after the decision is submitted.
    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).not.toBeAttached({ timeout: 10000 })
    // Article X: assert terminal content via xterm buffer model.
    await terminalShouldContain(page, NEXT_COMMAND, { timeout: 20000 })
  })

  test('Reject stops the pipeline and injects nothing', async ({ page }) => {
    await visitAndBind(page)
    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    await expect(page.locator('.sdd-dashboard__decision-btn--reject')).toBeVisible({ timeout: 15000 })
    await page.locator('.sdd-dashboard__decision-btn--reject').click()

    // Buttons must disappear after Reject.
    await expect(page.locator('.sdd-dashboard__decision-btn--reject')).not.toBeAttached({ timeout: 10000 })

    // No next-phase command should appear in the terminal buffer after Reject.
    // Article X: asserted via xterm buffer model.
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

  test('decision bar is inline — no overlay blocks the terminal', async ({ page }) => {
    await visitAndBind(page)
    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).toBeVisible({ timeout: 15000 })

    // spec-006 SC-004: the decision bar is inline in the dashboard, never a floating overlay.
    await expect(page.locator('.phase-decision-card-drawer')).not.toBeAttached()
    await expect(page.locator('.phase-decision-card-overlay')).not.toBeAttached()

    // Terminal must remain visible and interactive behind the decision bar.
    await expect(page.locator('.xterm').first()).toBeVisible()
    // Article X: xterm buffer model.
    await page.locator('.xterm-helper-textarea').pressSequentially('echo forge-gate-nonblocking')
    await terminalShouldContain(page, 'forge-gate-nonblocking', { timeout: 8000 })
  })
})
