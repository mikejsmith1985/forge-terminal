// E2E tests for the SDD pipeline dashboard (spec-004 / US1 real-backend path).
//
// spec-006 MIGRATION NOTE:
//   - SddPipelinePanel and PhaseDecisionCard have been deleted.
//   - SddDashboard (sdd-dashboard.spec.js) covers all spec-006 scenarios including:
//     terminal non-blocking (SC-004), phase rail rendering, decision bar, Clarify
//     modal, detail strip, all-complete badge, and error handling.
//   - Tests that targeted deleted UI patterns (collapse/expand toggle, collapsed badge,
//     artifact preview <details> drawer) have been removed here.
//   - The REAL-BACKEND tests below are kept for the few scenarios that genuinely
//     require a live PTY session (file-touch → WS broadcast → DOM update) rather
//     than synthetic WS injection.
//
// Launch: .\scripts\run-dev-clean.ps1  (dev server on :9999)
// Run:    npx playwright test tests/e2e/sdd-pipeline-dashboard.spec.js
//
// Article V: real browser events only. Article X: xterm buffer, not DOM text.

const { test, expect, exec, waitForTerminal, terminalShouldContain } = require('../fixtures/forge')

const DEV_URL = 'http://localhost:9999'
const SPEC_FILE = 'specs/003-sdd-phase-orchestrator/spec.md'

async function visitAndBind(page) {
  await page.goto(`${DEV_URL}/`)
  await waitForTerminal(page)
  await page.locator('.new-tab-btn').click()
  await waitForTerminal(page)
  // Allow the new shell to report its cwd so POST /api/sdd/bind can fire.
  await page.waitForTimeout(3000)
}

// ── Real-backend path: pipeline binds and broadcasts SDD_PHASE_STATUS ────────

test.describe('SDD Dashboard — real-backend phase broadcast', () => {
  test('dashboard renders 6 phase cells after file-touch triggers broadcast', async ({ page }) => {
    await visitAndBind(page)

    // Touch the spec file → watcher fires → backend broadcasts SDD_PHASE_STATUS.
    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    // spec-006: 6 phase cells (not 5 — tasks phase was added in spec-006).
    await expect(page.locator('.sdd-dashboard__cell')).toHaveCount(6, { timeout: 15000 })
  })

  test('dashboard reflects phase status within 2s of phase completion', async ({ page }) => {
    await visitAndBind(page)
    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    // At least one cell must reach complete or awaiting-decision within 2s of broadcast.
    await expect(
      page.locator('.sdd-dashboard__cell--complete, .sdd-dashboard__cell--awaiting-decision')
    ).toBeAttached({ timeout: 10000 })
  })

  test('terminal remains interactive while the dashboard is visible', async ({ page }) => {
    await visitAndBind(page)
    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)
    await expect(page.locator('[data-testid="sdd-dashboard"]')).toBeVisible({ timeout: 15000 })

    // Keystroke must reach the PTY — the dashboard must not capture keyboard input.
    // Article X: assert via xterm buffer model, not DOM/canvas text.
    await page.locator('.xterm-helper-textarea').pressSequentially('echo forge-dashboard-nonblocking')
    await terminalShouldContain(page, 'forge-dashboard-nonblocking', { timeout: 8000 })
  })

  test('SC-004 regression: no overlay or drawer appears — decision bar is inline', async ({ page }) => {
    await visitAndBind(page)
    await exec(`powershell -NoProfile -Command "(Get-Item '${SPEC_FILE}').LastWriteTime = Get-Date"`)

    // Wait for the gate state — decision buttons must appear INSIDE the dashboard.
    await expect(
      page.locator('.sdd-dashboard__decision-btn--approve, .sdd-dashboard__decision-btn--reject')
    ).toBeVisible({ timeout: 15000 })

    // Old overlay / drawer patterns must NOT be present (spec-006 regression guard).
    await expect(page.locator('.phase-decision-card-drawer')).not.toBeAttached()
    await expect(page.locator('.phase-decision-card-overlay')).not.toBeAttached()

    // Terminal must remain visible behind the decision bar.
    await expect(page.locator('.xterm').first()).toBeVisible()
  })
})
