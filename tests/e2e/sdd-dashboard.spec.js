// E2E tests for the SDD Pipeline Dashboard (spec-006).
// Covers all 9 quickstart scenarios: idle state, phase rail, decision bar,
// clarify modal, phase detail strip, run-count badge, error handling, all-complete.
//
// Launch: .\scripts\run-dev-clean.ps1  (dev server on :9999)
// Run:    npx playwright test tests/e2e/sdd-dashboard.spec.js
//
// WS injection technique:
//   addInitScript patches window.WebSocket before React mounts, capturing the live
//   connection on window.__testWS. Simultaneously, window.fetch is patched to extract
//   the sessionId from the useSddGate mount-time recovery call
//   (GET /api/sdd/status?sessionId=…), which fires within milliseconds of mount even
//   when no pipeline is active. This gives us the correct sessionId to put on injected
//   SDD_PHASE_STATUS / SDD_PHASE_GATE events without touching any production code.
//
// Article V: real browser events (locator.click, page.keyboard) only — never page.evaluate
//   to dispatch synthetic DOM events.
// Article X: terminal content asserted via window.term.buffer.active, never DOM/canvas text.

const { test, expect, visitWithoutTour, terminalShouldContain } = require('../fixtures/forge')

const APP_URL = 'http://localhost:9999'

// ── WS injection helpers ──────────────────────────────────────────────────────

// enableWsInjection — patches WebSocket and fetch BEFORE the page loads so we can:
//   1. Capture the real WS connection for later message injection.
//   2. Extract the active sessionId from the useSddGate recovery fetch.
// Must be called before the first page.goto() in each test.
async function enableWsInjection(page) {
  await page.addInitScript(() => {
    // Intercept fetch to extract sessionId from useSddGate's recovery call.
    const origFetch = window.fetch
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? ''
      if (url.includes('/api/sdd/status')) {
        try {
          const parsedUrl = new URL(url, location.origin)
          const sessionId = parsedUrl.searchParams.get('sessionId')
          if (sessionId) window.__testSessionId = sessionId
        } catch (urlErr) {}
      }
      return origFetch.apply(this, args)
    }

    // Intercept WebSocket constructor to capture the live connection.
    const OrigWS = window.WebSocket
    window.WebSocket = class extends OrigWS {
      constructor (...args) {
        super(...args)
        window.__testWS = this
        // Fallback: also extract sessionId from real SDD messages.
        this.addEventListener('message', (evt) => {
          try {
            const msg = JSON.parse(evt.data)
            if (msg.sessionId && !window.__testSessionId) {
              window.__testSessionId = msg.sessionId
            }
          } catch (parseErr) {}
        })
      }
    }

    // window.__wsInject — dispatches a synthetic message on the captured WS.
    window.__wsInject = (msg) => {
      if (!window.__testWS) return false
      const data = typeof msg === 'string' ? msg : JSON.stringify(msg)
      window.__testWS.dispatchEvent(new MessageEvent('message', { data }))
      return true
    }
  })
}

// getSessionId — waits for window.__testSessionId to be populated (set by the
// fetch intercept) and returns it. Typically resolves in < 500 ms.
async function getSessionId(page, timeout = 8000) {
  await page.waitForFunction(() => !!window.__testSessionId, { timeout })
  return page.evaluate(() => window.__testSessionId)
}

// injectPhaseStatus — sends a synthetic SDD_PHASE_STATUS message.
async function injectPhaseStatus(page, sessionId, feature, phases) {
  await page.evaluate(
    ({ sessionId, feature, phases }) => {
      window.__wsInject({ type: 'SDD_PHASE_STATUS', sessionId, feature, phases })
    },
    { sessionId, feature, phases }
  )
}

// injectPhaseGate — sends a synthetic SDD_PHASE_GATE message, populating phaseSummaries.
async function injectPhaseGate(page, sessionId, cardId, phase, summary, actions = ['approve', 'reject', 'clarify']) {
  await page.evaluate(
    ({ sessionId, cardId, phase, summary, actions }) => {
      window.__wsInject({ type: 'SDD_PHASE_GATE', sessionId, cardId, phase, summary, actions })
    },
    { sessionId, cardId, phase, summary, actions }
  )
}

// waitForDashboard — waits for the SddDashboard root to be visible.
async function waitForDashboard(page) {
  await page.locator('[data-testid="sdd-dashboard"]').waitFor({ state: 'visible', timeout: 15000 })
}

// visitAndReady — visits the app, waits for the terminal, returns after the
// dashboard is mounted. Used by tests that only need the idle state.
async function visitAndReady(page) {
  await visitWithoutTour(page, APP_URL)
  await page.locator('.xterm').first().waitFor({ state: 'visible', timeout: 20000 })
  await waitForDashboard(page)
}

// visitAndBind — visits the app, opens a new tab so the auto-bind fires, and
// returns the active session ID. Used by tests that inject WS state messages.
async function visitAndBind(page) {
  await visitAndReady(page)
  await page.locator('.new-tab-btn').click()
  await page.waitForTimeout(1500) // let the new shell connect and trigger the recovery fetch
  return getSessionId(page)
}

// ── Scenario 1: Idle dashboard (FR-010) ──────────────────────────────────────

test.describe('SDD Dashboard — Scenario 1: Idle state', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndReady(page)
  })

  test('dashboard is always mounted and visible at app load', async ({ page }) => {
    await expect(page.locator('[data-testid="sdd-dashboard"]')).toBeVisible()
  })

  test('idle rail row visible when no pipeline is bound', async ({ page }) => {
    await expect(page.locator('.sdd-dashboard__idle-row')).toBeVisible()
  })

  test('action-prompt-strip always present and period-terminated', async ({ page }) => {
    const strip = page.locator('.action-prompt-strip')
    await expect(strip).toBeVisible()
    const text = (await strip.textContent()).trim()
    expect(text.length).toBeGreaterThan(0)
    expect(text.endsWith('.')).toBe(true)
  })

  test('no collapse or minimize control exists', async ({ page }) => {
    // spec-006 removes the collapse toggle that spec-004 introduced.
    await expect(page.locator('.sdd-pipeline-panel__toggle')).not.toBeAttached()
    await expect(page.locator('[data-testid="sdd-dashboard-toggle"]')).not.toBeAttached()
  })
})

// ── Scenario 2: Phase rail (FR-001, FR-002, FR-003) ──────────────────────────

test.describe('SDD Dashboard — Scenario 2: Phase rail', () => {
  let sessionId

  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
    sessionId = await visitAndBind(page)
  })

  test('6 phase cells appear after SDD_PHASE_STATUS with all phases', async ({ page }) => {
    await injectPhaseStatus(page, sessionId, 'demo-feature', [
      { phase: 'specify',   order: 1, displayStatus: 'complete',          runCount: 1, artifactPath: '' },
      { phase: 'clarify',   order: 2, displayStatus: 'complete',          runCount: 1, artifactPath: '' },
      { phase: 'plan',      order: 3, displayStatus: 'awaiting-decision', runCount: 1, artifactPath: '' },
      { phase: 'tasks',     order: 4, displayStatus: 'pending',           runCount: 0, artifactPath: '' },
      { phase: 'validate',  order: 5, displayStatus: 'pending',           runCount: 0, artifactPath: '' },
      { phase: 'implement', order: 6, displayStatus: 'pending',           runCount: 0, artifactPath: '' },
    ])

    await expect(page.locator('.sdd-dashboard__cell')).toHaveCount(6)
  })

  test('feature name appears in the dashboard header', async ({ page }) => {
    await injectPhaseStatus(page, sessionId, 'auth-refresh', [
      { phase: 'specify', order: 1, displayStatus: 'active', runCount: 1, artifactPath: '' },
    ])

    await expect(page.locator('.sdd-dashboard__feature-name')).toContainText('auth-refresh')
  })

  test('cell icons match the six displayStatus values', async ({ page }) => {
    await injectPhaseStatus(page, sessionId, 'icon-test', [
      { phase: 'specify',   order: 1, displayStatus: 'complete',          runCount: 1, artifactPath: '' },
      { phase: 'clarify',   order: 2, displayStatus: 'active',            runCount: 1, artifactPath: '' },
      { phase: 'plan',      order: 3, displayStatus: 'awaiting-decision', runCount: 1, artifactPath: '' },
      { phase: 'tasks',     order: 4, displayStatus: 'iterating',         runCount: 2, artifactPath: '' },
      { phase: 'validate',  order: 5, displayStatus: 'rejected',          runCount: 1, artifactPath: '' },
      { phase: 'implement', order: 6, displayStatus: 'pending',           runCount: 0, artifactPath: '' },
    ])

    const cells = page.locator('.sdd-dashboard__cell')
    await expect(cells.nth(0).locator('.sdd-dashboard__cell-icon')).toHaveText('✓')
    await expect(cells.nth(1).locator('.sdd-dashboard__cell-icon')).toHaveText('⟳')
    await expect(cells.nth(2).locator('.sdd-dashboard__cell-icon')).toHaveText('⏳')
    await expect(cells.nth(3).locator('.sdd-dashboard__cell-icon')).toHaveText('↻')
    await expect(cells.nth(4).locator('.sdd-dashboard__cell-icon')).toHaveText('⚠')
    await expect(cells.nth(5).locator('.sdd-dashboard__cell-icon')).toHaveText('◌')
  })

  test('idle rail disappears once phases are present', async ({ page }) => {
    await injectPhaseStatus(page, sessionId, 'demo', [
      { phase: 'specify', order: 1, displayStatus: 'active', runCount: 1, artifactPath: '' },
    ])

    await expect(page.locator('.sdd-dashboard__idle-row')).not.toBeAttached()
  })

  test('unknown future displayStatus falls back to --unknown class in stylesheet', async ({ page }) => {
    const hasUnknownClass = await page.evaluate(() => {
      return Array.from(document.styleSheets).some((sheet) => {
        try {
          return Array.from(sheet.cssRules || []).some(
            (rule) => rule.selectorText?.includes('sdd-dashboard__cell--unknown')
          )
        } catch {
          return false
        }
      })
    })
    expect(hasUnknownClass, 'sdd-dashboard__cell--unknown must exist in the stylesheet').toBe(true)
  })
})

// ── Scenario 7: Run-count badge (FR-004) ─────────────────────────────────────

test.describe('SDD Dashboard — Scenario 7: Run-count badge', () => {
  let sessionId

  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
    sessionId = await visitAndBind(page)
  })

  test('×N badge appears when runCount >= 2', async ({ page }) => {
    await injectPhaseStatus(page, sessionId, 'badge-test', [
      { phase: 'plan', order: 3, displayStatus: 'iterating', runCount: 3, artifactPath: '' },
    ])

    await expect(page.locator('.sdd-dashboard__cell-badge')).toContainText('×3')
  })

  test('×N badge absent when runCount is 1', async ({ page }) => {
    await injectPhaseStatus(page, sessionId, 'badge-test', [
      { phase: 'plan', order: 3, displayStatus: 'awaiting-decision', runCount: 1, artifactPath: '' },
    ])

    await expect(page.locator('.sdd-dashboard__cell-badge')).not.toBeAttached()
  })

  test('pipeline badge shows Awaiting when a phase is iterating', async ({ page }) => {
    await injectPhaseStatus(page, sessionId, 'badge-test', [
      { phase: 'plan', order: 3, displayStatus: 'iterating', runCount: 2, artifactPath: '' },
    ])

    await expect(page.locator('.sdd-dashboard__badge--awaiting')).toBeVisible()
  })
})

// ── Scenario 3: Decision bar (FR-005) ────────────────────────────────────────

test.describe('SDD Dashboard — Scenario 3: Decision bar', () => {
  let sessionId

  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
    sessionId = await visitAndBind(page)
  })

  test('Approve/Reject/Clarify buttons appear when SDD_PHASE_GATE arrives', async ({ page }) => {
    await injectPhaseGate(page, sessionId, 'gate-plan-1', 'plan',
      { headline: 'Plan ready', producedItems: ['plan.md'], flags: [] },
      ['approve', 'reject', 'clarify']
    )

    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.sdd-dashboard__decision-btn--reject')).toBeVisible()
    await expect(page.locator('.sdd-dashboard__decision-btn--clarify')).toBeVisible()
  })

  test('no decision buttons when no gate is open', async ({ page }) => {
    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).not.toBeAttached()
  })

  test('action prompt reflects gate-open state', async ({ page }) => {
    await injectPhaseGate(page, sessionId, 'gate-plan-2', 'plan',
      { headline: 'Plan ready', producedItems: ['plan.md'], flags: [] }
    )

    const strip = page.locator('.action-prompt-strip')
    await expect(strip).toContainText(/Approve|Reject|Clarify/)
  })

  test('no floating overlay or side-drawer — terminal remains visible behind bar', async ({ page }) => {
    await injectPhaseGate(page, sessionId, 'gate-plan-3', 'plan',
      { headline: 'Plan ready', producedItems: ['plan.md'], flags: [] }
    )

    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).toBeVisible()
    // Old drawer / overlay patterns must not exist.
    await expect(page.locator('.phase-decision-card-drawer')).not.toBeAttached()
    await expect(page.locator('.phase-decision-card-overlay')).not.toBeAttached()
    // Terminal must remain visible.
    await expect(page.locator('.xterm').first()).toBeVisible()
  })
})

// ── Scenario 5: Clarify modal (FR-006) ───────────────────────────────────────

test.describe('SDD Dashboard — Scenario 5: Clarify modal', () => {
  let sessionId

  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
    sessionId = await visitAndBind(page)
    await injectPhaseGate(page, sessionId, 'gate-clarify-1', 'plan',
      { headline: 'Plan ready', producedItems: ['plan.md'], flags: [] },
      ['clarify']
    )
    await expect(page.locator('.sdd-dashboard__decision-btn--clarify')).toBeVisible()
  })

  test('clicking Clarify opens a native <dialog> element', async ({ page }) => {
    await page.locator('.sdd-dashboard__decision-btn--clarify').click()

    await expect(page.locator('dialog.sdd-dashboard__clarify-dialog')).toBeVisible({ timeout: 3000 })
  })

  test('Confirm button disabled when textarea is empty', async ({ page }) => {
    await page.locator('.sdd-dashboard__decision-btn--clarify').click()

    await expect(page.locator('.sdd-dashboard__clarify-btn--confirm')).toBeDisabled()
  })

  test('Confirm button enables once steer text is typed', async ({ page }) => {
    await page.locator('.sdd-dashboard__decision-btn--clarify').click()
    await page.locator('.sdd-dashboard__clarify-input').fill('Narrow to the auth module only')

    await expect(page.locator('.sdd-dashboard__clarify-btn--confirm')).not.toBeDisabled()
  })

  test('Cancel closes the dialog without submitting', async ({ page }) => {
    await page.locator('.sdd-dashboard__decision-btn--clarify').click()
    await expect(page.locator('dialog.sdd-dashboard__clarify-dialog')).toBeVisible()

    await page.locator('.sdd-dashboard__clarify-btn--cancel').click()

    await expect(page.locator('dialog.sdd-dashboard__clarify-dialog')).not.toBeVisible()
    // Gate must still be open — Cancel must not dismiss the decision bar.
    await expect(page.locator('.sdd-dashboard__decision-btn--clarify')).toBeVisible()
  })

  test('Escape key closes the dialog', async ({ page }) => {
    await page.locator('.sdd-dashboard__decision-btn--clarify').click()
    await expect(page.locator('dialog.sdd-dashboard__clarify-dialog')).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.locator('dialog.sdd-dashboard__clarify-dialog')).not.toBeVisible()
  })
})

// ── Scenario 6: Phase detail strip (FR-007, FR-008, FR-009, SC-004) ──────────

test.describe('SDD Dashboard — Scenario 6: Phase detail strip', () => {
  let sessionId

  const PHASES_WITH_SPECIFY_COMPLETE = [
    { phase: 'specify',   order: 1, displayStatus: 'complete', runCount: 1, artifactPath: 'specs/test/spec.md' },
    { phase: 'clarify',   order: 2, displayStatus: 'complete', runCount: 1, artifactPath: '' },
    { phase: 'plan',      order: 3, displayStatus: 'awaiting-decision', runCount: 1, artifactPath: '' },
    { phase: 'tasks',     order: 4, displayStatus: 'pending',  runCount: 0, artifactPath: '' },
    { phase: 'validate',  order: 5, displayStatus: 'pending',  runCount: 0, artifactPath: '' },
    { phase: 'implement', order: 6, displayStatus: 'pending',  runCount: 0, artifactPath: '' },
  ]

  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
    sessionId = await visitAndBind(page)

    // Inject gate first so phaseSummaries is populated for 'specify'.
    await injectPhaseGate(page, sessionId, 'gate-specify-1', 'specify',
      { headline: 'Spec ready — 0 open clarifications', producedItems: ['spec.md'], flags: [] },
      ['approve']
    )
    // Then inject status with specify complete (gate now closed in UI terms).
    await injectPhaseStatus(page, sessionId, 'test-feature', PHASES_WITH_SPECIFY_COMPLETE)
  })

  test('clicking a complete cell expands the detail strip', async ({ page }) => {
    const specifyCell = page.locator('.sdd-dashboard__cell--clickable').first()
    await specifyCell.click()

    await expect(page.locator('.sdd-dashboard__detail-strip')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.sdd-dashboard__detail-headline')).toContainText('Spec ready')
  })

  test('artifact file chip shows produced item name', async ({ page }) => {
    await page.locator('.sdd-dashboard__cell--clickable').first().click()

    await expect(page.locator('.sdd-dashboard__detail-chip').first()).toContainText('spec.md')
  })

  test('"View artifact →" link is present for phases with an artifactPath', async ({ page }) => {
    await page.locator('.sdd-dashboard__cell--clickable').first().click()

    await expect(page.locator('.sdd-dashboard__detail-artifact-link')).toBeVisible()
    await expect(page.locator('.sdd-dashboard__detail-artifact-link')).toContainText('View artifact')
  })

  test('clicking the same cell again collapses the strip', async ({ page }) => {
    const specifyCell = page.locator('.sdd-dashboard__cell--clickable').first()
    await specifyCell.click()
    await expect(page.locator('.sdd-dashboard__detail-strip')).toBeVisible()

    await specifyCell.click()

    await expect(page.locator('.sdd-dashboard__detail-strip')).not.toBeVisible()
  })

  test('clicking a different complete cell switches the strip to that phase', async ({ page }) => {
    // Inject gate summary for clarify too.
    await injectPhaseGate(page, sessionId, 'gate-clarify-det', 'clarify',
      { headline: 'Clarify done', producedItems: ['clarifications.md'], flags: [] },
      ['approve']
    )

    const cells = page.locator('.sdd-dashboard__cell--clickable')
    await cells.nth(0).click() // specify
    await expect(page.locator('.sdd-dashboard__detail-headline')).toContainText('Spec ready')

    await cells.nth(1).click() // clarify
    await expect(page.locator('.sdd-dashboard__detail-headline')).toContainText('Clarify done')
    // Only one strip visible at a time.
    await expect(page.locator('.sdd-dashboard__detail-strip')).toHaveCount(1)
  })

  test('SC-004: detail strip floats above the rail — dashboard height does not change', async ({ page }) => {
    const dashboard = page.locator('[data-testid="sdd-dashboard"]')
    const rail = page.locator('.sdd-dashboard__rail-wrapper')

    const heightBefore = await dashboard.evaluate((el) => el.getBoundingClientRect().height)
    const railTopBefore = await rail.evaluate((el) => el.getBoundingClientRect().top)

    await page.locator('.sdd-dashboard__cell--clickable').first().click()
    await expect(page.locator('.sdd-dashboard__detail-strip')).toBeVisible()

    const heightAfter = await dashboard.evaluate((el) => el.getBoundingClientRect().height)
    const railTopAfter = await rail.evaluate((el) => el.getBoundingClientRect().top)

    // Rail must not shift — the strip is out of flow (position: absolute; bottom: 100%).
    expect(Math.abs(railTopAfter - railTopBefore)).toBeLessThan(2)
    // Dashboard container must not grow.
    expect(Math.abs(heightAfter - heightBefore)).toBeLessThan(2)
  })
})

// ── Scenario 8: Backend error — inline error message (FR-013) ────────────────

test.describe('SDD Dashboard — Scenario 8: Backend error handling', () => {
  let sessionId

  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
    sessionId = await visitAndBind(page)
  })

  test('inline error appears and gate stays open on 500 from /api/sdd/decision', async ({ page }) => {
    await page.route('**/api/sdd/decision', (route) =>
      route.fulfill({ status: 500, body: 'internal server error' })
    )

    await injectPhaseGate(page, sessionId, 'gate-err-1', 'plan',
      { headline: 'Plan ready', producedItems: ['plan.md'], flags: [] },
      ['approve', 'reject', 'clarify']
    )
    await page.locator('.sdd-dashboard__decision-btn--approve').click()

    await expect(page.locator('.sdd-dashboard__decision-error')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.sdd-dashboard__decision-error')).toContainText('500')
    // Buttons must remain for retry.
    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).toBeVisible()
    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).not.toBeDisabled()
  })

  test('error clears when a new gate event arrives after the failure', async ({ page }) => {
    await page.route('**/api/sdd/decision', (route) =>
      route.fulfill({ status: 500, body: 'error' })
    )

    await injectPhaseGate(page, sessionId, 'gate-err-2', 'plan',
      { headline: 'Plan ready', producedItems: ['plan.md'], flags: [] }
    )
    await page.locator('.sdd-dashboard__decision-btn--approve').click()
    await expect(page.locator('.sdd-dashboard__decision-error')).toBeVisible()

    // A new gate supersedes the error.
    await injectPhaseGate(page, sessionId, 'gate-err-3', 'plan',
      { headline: 'Plan re-opened', producedItems: ['plan.md'], flags: [] }
    )

    await expect(page.locator('.sdd-dashboard__decision-error')).not.toBeAttached()
  })
})

// ── Scenario 9: All phases complete (US4 acceptance scenario 4) ──────────────

test.describe('SDD Dashboard — Scenario 9: All phases complete', () => {
  let sessionId

  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
    sessionId = await visitAndBind(page)
  })

  test('all 6 cells show complete icon and badge shows Complete', async ({ page }) => {
    await injectPhaseStatus(page, sessionId, 'done-feature', [
      { phase: 'specify',   order: 1, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'clarify',   order: 2, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'plan',      order: 3, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'tasks',     order: 4, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'validate',  order: 5, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'implement', order: 6, displayStatus: 'complete', runCount: 1, artifactPath: '' },
    ])

    await expect(page.locator('.sdd-dashboard__cell--complete')).toHaveCount(6, { timeout: 5000 })
    await expect(page.locator('.sdd-dashboard__badge--complete')).toBeVisible()
  })

  test('no decision buttons when pipeline is complete', async ({ page }) => {
    await injectPhaseStatus(page, sessionId, 'done-feature', [
      { phase: 'specify',   order: 1, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'clarify',   order: 2, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'plan',      order: 3, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'tasks',     order: 4, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'validate',  order: 5, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'implement', order: 6, displayStatus: 'complete', runCount: 1, artifactPath: '' },
    ])

    await expect(page.locator('.sdd-dashboard__decision-bar')).not.toBeAttached()
  })

  test('action prompt reads "Pipeline complete."', async ({ page }) => {
    await injectPhaseStatus(page, sessionId, 'done-feature', [
      { phase: 'specify',   order: 1, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'clarify',   order: 2, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'plan',      order: 3, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'tasks',     order: 4, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'validate',  order: 5, displayStatus: 'complete', runCount: 1, artifactPath: '' },
      { phase: 'implement', order: 6, displayStatus: 'complete', runCount: 1, artifactPath: '' },
    ])

    await expect(page.locator('.action-prompt-strip')).toContainText('Pipeline complete')
  })
})

// ── Scenario 4: Terminal non-blocking (SC-004 regression) ────────────────────

test.describe('SDD Dashboard — Terminal non-blocking with gate open', () => {
  let sessionId

  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
    sessionId = await visitAndBind(page)
  })

  test('keystrokes reach the PTY while the decision bar is visible', async ({ page }) => {
    await injectPhaseGate(page, sessionId, 'gate-nonblock', 'plan',
      { headline: 'Plan ready', producedItems: ['plan.md'], flags: [] }
    )
    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).toBeVisible()

    // Type into the terminal — per Article X, verify via xterm buffer model.
    await page.locator('.xterm-helper-textarea').pressSequentially('echo sdd-nonblocking-check')
    await terminalShouldContain(page, 'sdd-nonblocking-check', { timeout: 8000 })
  })
})
