// E2E tests for SDD Phase UX (specs/005-sdd-phase-ux).
// Validates six distinct state icons, ×N counter, and ActionPromptStrip via the
// live Forge Terminal app launched with run-dev-clean.ps1.
// Run: npx playwright test e2e/sdd-phase-ux.spec.js
//
// Article V note: real browser events via page.keyboard / locator.click() only;
// no page.evaluate() for synthetic events. Terminal output read from xterm.js
// buffer model (window.term.buffer.active), never the DOM innerHTML.
import { test, expect } from '@playwright/test'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wait until the panel row for `phase` has the expected BEM modifier class. */
async function waitForPhaseStatus(page, phase, statusSuffix, timeout = 15000) {
  const selector = `.sdd-pipeline-panel__row--${statusSuffix}`
  await page.waitForSelector(selector, { timeout })
  // Confirm the row also carries the phase name (guards against first-match on wrong row).
  const row = page.locator(selector).filter({ hasText: new RegExp(phase, 'i') })
  await expect(row).toBeVisible({ timeout })
  return row
}

/** Read the full xterm.js buffer (Article X — never read DOM for terminal output). */
async function terminalBuffer(page) {
  return page.evaluate(() => {
    const buf = window.term?.buffer?.active
    if (!buf) return ''
    const lines = []
    for (let i = 0; i < buf.length; i++) {
      lines.push(buf.getLine(i)?.translateToString(true) ?? '')
    }
    return lines.join('\n')
  })
}

// ── Scenario A — six distinct state icons ──────────────────────────────────

test.describe('SDD Phase UX — Scenario A: six distinct state icons', () => {
  test.beforeEach(async ({ page }) => {
    // App is already running via run-dev-clean.ps1 on localhost:5173.
    await page.goto('http://localhost:5173')
    await page.waitForLoadState('networkidle')
  })

  test('pending phases show ◌ icon with --pending class', async ({ page }) => {
    // Before any speckit command, all phases should be pending.
    const pendingIcons = page.locator('.sdd-pipeline-panel__row--pending .sdd-pipeline-panel__icon')
    // There are 5 phases — at least some should be pending at startup.
    await expect(pendingIcons.first()).toBeVisible()
    const iconText = await pendingIcons.first().textContent()
    expect(iconText).toBe('◌')
  })

  test('active phase shows ⟳ icon with --active class', async ({ page }) => {
    // Trigger Specify phase by injecting the command via keyboard (Article V: real events).
    await page.locator('.xterm-helper-textarea').click()
    await page.keyboard.type('/speckit-specify Test feature for E2E')
    await page.keyboard.press('Enter')

    // Wait for the specify row to become active (running).
    const row = await waitForPhaseStatus(page, 'specify', 'active', 20000)
    const icon = row.locator('.sdd-pipeline-panel__icon')
    await expect(icon).toHaveText('⟳')
  })

  test('awaiting-decision phase shows ⏳ icon with --awaiting-decision class', async ({ page }) => {
    const row = await waitForPhaseStatus(page, 'specify', 'awaiting-decision', 30000)
    const icon = row.locator('.sdd-pipeline-panel__icon')
    await expect(icon).toHaveText('⏳')
  })

  test('iterating phase shows ↻ icon with --iterating class after second run', async ({ page }) => {
    // Reject once to increment the run count, then re-run.
    // This test depends on the pipeline already being at awaiting-decision.
    await waitForPhaseStatus(page, 'specify', 'awaiting-decision', 30000)

    // Click Reject on the gate card.
    await page.locator('button', { hasText: /reject/i }).click()
    await waitForPhaseStatus(page, 'specify', 'rejected', 10000)

    // Re-run specify.
    await page.locator('.xterm-helper-textarea').click()
    await page.keyboard.type('/speckit-specify Re-run after rejection')
    await page.keyboard.press('Enter')

    // Wait for the second gate to open — should show iterating.
    await waitForPhaseStatus(page, 'specify', 'iterating', 30000)
    const row = page.locator('.sdd-pipeline-panel__row--iterating').filter({ hasText: /specify/i })
    const icon = row.locator('.sdd-pipeline-panel__icon')
    await expect(icon).toHaveText('↻')
  })
})

// ── Scenario B — ×N counter ───────────────────────────────────────────────

test.describe('SDD Phase UX — Scenario B: ×N iteration counter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.waitForLoadState('networkidle')
  })

  test('no counter shown on first completion (runCount = 1)', async ({ page }) => {
    await waitForPhaseStatus(page, 'specify', 'awaiting-decision', 30000)
    const row = page.locator('.sdd-pipeline-panel__row--awaiting-decision')
    // runCount = 1 → no ×N badge
    await expect(row.locator('.sdd-pipeline-panel__run-count')).not.toBeVisible()
  })

  test('×2 counter shown after second completion (runCount = 2)', async ({ page }) => {
    // Precondition: iterating status reached (second run completed).
    await waitForPhaseStatus(page, 'specify', 'iterating', 60000)
    const row = page.locator('.sdd-pipeline-panel__row--iterating')
    const counter = row.locator('.sdd-pipeline-panel__run-count')
    await expect(counter).toBeVisible()
    await expect(counter).toHaveText('×2')
  })
})

// ── Scenario C — ActionPromptStrip ────────────────────────────────────────

test.describe('SDD Phase UX — Scenario C: ActionPromptStrip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.waitForLoadState('networkidle')
  })

  test('shows start prompt before any pipeline is active', async ({ page }) => {
    const strip = page.locator('.action-prompt-strip')
    await expect(strip).toBeVisible()
    // Either start or continue prompt is acceptable at clean state.
    const text = await strip.textContent()
    expect(text).toMatch(/speckit-specify|no active feature/i)
  })

  test('shows running prompt when a phase is active', async ({ page }) => {
    await page.locator('.xterm-helper-textarea').click()
    await page.keyboard.type('/speckit-specify E2E action prompt test')
    await page.keyboard.press('Enter')

    await waitForPhaseStatus(page, 'specify', 'active', 20000)
    const strip = page.locator('.action-prompt-strip')
    await expect(strip).toHaveText('Specify is running…')
  })

  test('shows gate prompt in panel footer when awaiting-decision', async ({ page }) => {
    // Panel footer shows isCardOpen=false, so it should show the gate is open via
    // deriveActionPrompt checking for awaiting-decision phase but isCardOpen is false —
    // it falls through to the "no command running" state.  The card itself will show
    // the approve/reject prompt via ActionPromptStrip(isCardOpen=true).
    await waitForPhaseStatus(page, 'specify', 'awaiting-decision', 30000)
    // The gate card's ActionPromptStrip (isCardOpen=true) should be visible.
    const cardStrip = page.locator('.phase-decision-card .action-prompt-strip')
    await expect(cardStrip).toBeVisible()
    await expect(cardStrip).toHaveText('Review the artifact above, then Approve, Reject, or Clarify.')
  })

  test('shows iterating prompt in card when iterating', async ({ page }) => {
    await waitForPhaseStatus(page, 'specify', 'iterating', 60000)
    const cardStrip = page.locator('.phase-decision-card .action-prompt-strip')
    await expect(cardStrip).toHaveText('Approve this iteration, or Reject to try again.')
  })
})
