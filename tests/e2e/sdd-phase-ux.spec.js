// E2E tests for SDD Phase UX (specs/005-sdd-phase-ux + spec-006 dashboard update).
// Updated in spec-006 to use SddDashboard selectors (replaces SddPipelinePanel).
//
// Validates: always-visible idle state, ActionPromptStrip, CSS class contracts,
// and unknown-status fallback — all against the live dev server on localhost:9999.
//
// Article V: real browser events (page.keyboard / locator.click) only.
// Article X: terminal output read from window.term.buffer.active, never DOM.
const { test, expect, visitWithoutTour } = require('../fixtures/forge')

const APP_URL = 'http://localhost:9999'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForApp(page, timeout = 20000) {
  await page.locator('.xterm').first().waitFor({ state: 'visible', timeout })
  // Let React mount the dashboard component.
  await page.waitForTimeout(800)
}

// ── Scenario A — dashboard always-visible and action-prompt-strip (FR-010) ───
//
// The idle state (phases=[]) is fully exercised by the SddDashboard Vitest
// unit tests (26 tests). The E2E tests prove the dashboard and strip are wired
// into the live app, regardless of whether a pipeline session is active.

test.describe('SDD Phase UX — dashboard always visible', () => {
  test.beforeEach(async ({ page }) => {
    await visitWithoutTour(page, APP_URL)
    await waitForApp(page)
  })

  test('SDD dashboard is always mounted (FR-010: no-session state visible)', async ({ page }) => {
    // spec-006: SddDashboard replaced SddPipelinePanel — always rendered, never collapsed.
    await expect(page.locator('[data-testid="sdd-dashboard"]')).toBeVisible({ timeout: 5000 })
  })

  test('idle rail row visible when no pipeline is bound', async ({ page }) => {
    await expect(page.locator('.sdd-dashboard__idle-row')).toBeVisible({ timeout: 5000 })
  })

  test('action-prompt-strip is present and period-terminated', async ({ page }) => {
    const strip = page.locator('.action-prompt-strip')
    await expect(strip).toBeVisible({ timeout: 5000 })
    // When no pipeline is active the strip says "speckit-specify to start"; when
    // active it reflects current state. Either way it must be a full sentence.
    const text = (await strip.textContent()).trim()
    expect(text.length).toBeGreaterThan(0)
    expect(text.endsWith('.')).toBe(true)
  })
})

// ── Scenario B — six distinct state icons (CSS contract) ─────────────────────
//
// Live icon rendering against injected WS state is covered in sdd-dashboard.spec.js
// (Scenario 2 — Phase rail), which uses the sessionId extraction technique.
// This suite verifies the same STATUS_ICON map is live in the bundle by reading
// the CSS stylesheet — the same way spec-005 verified it.

test.describe('SDD Phase UX — six distinct state icons (CSS contract)', () => {
  test.beforeEach(async ({ page }) => {
    await visitWithoutTour(page, APP_URL)
    await waitForApp(page)
  })

  test('all six status BEM modifier classes are present in the loaded stylesheet', async ({ page }) => {
    const EXPECTED_MODS = [
      'sdd-dashboard__cell--pending',
      'sdd-dashboard__cell--active',
      'sdd-dashboard__cell--awaiting-decision',
      'sdd-dashboard__cell--complete',
      'sdd-dashboard__cell--rejected',
      'sdd-dashboard__cell--iterating',
    ]

    const foundMods = await page.evaluate((mods) => {
      const found = []
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            for (const mod of mods) {
              if (rule.selectorText?.includes(mod) && !found.includes(mod)) {
                found.push(mod)
              }
            }
          }
        } catch {
          // Cross-origin stylesheet — skip.
        }
      }
      return found
    }, EXPECTED_MODS)

    for (const mod of EXPECTED_MODS) {
      expect(foundMods, `CSS modifier class missing: .${mod}`).toContain(mod)
    }
  })

  test('idle row uses ◌ icon in the live bundle (pending baseline)', async ({ page }) => {
    // The idle row is always rendered when no pipeline is active.
    // It always uses the ◌ pending icon — verifies STATUS_ICON['pending'] = '◌' is live.
    const idleIcon = page.locator('.sdd-dashboard__idle-row .sdd-dashboard__cell-icon')
    await expect(idleIcon).toHaveText('◌')
  })
})

// ── Scenario C — dashboard structure and safety ───────────────────────────────

test.describe('SDD Phase UX — dashboard structure', () => {
  test.beforeEach(async ({ page }) => {
    await visitWithoutTour(page, APP_URL)
    await waitForApp(page)
  })

  test('dashboard is always visible at app load (FR-010)', async ({ page }) => {
    await expect(page.locator('[data-testid="sdd-dashboard"]')).toBeVisible({ timeout: 5000 })
  })

  test('no collapse toggle exists (spec-006 removes collapse)', async ({ page }) => {
    // spec-004 had a collapse button; spec-006 removes it — always-visible design.
    await expect(page.locator('.sdd-pipeline-panel__toggle')).not.toBeAttached()
  })

  test('action-prompt-strip text fits in one line (≤ 100 chars)', async ({ page }) => {
    const strip = page.locator('.action-prompt-strip')
    const text = (await strip.textContent()).trim()
    expect(text.length).toBeLessThanOrEqual(100)
  })

  test('unknown/future displayStatus values do not crash the dashboard', async ({ page }) => {
    // Verify the --unknown fallback class is live in the bundle.
    // The STATUS_ICON['unknown'] = '?' fallback is tested in Vitest unit tests;
    // here we confirm the CSS class is actually loaded in the browser.
    const hasUnknownClass = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule.selectorText?.includes('sdd-dashboard__cell--unknown')) {
              return true
            }
          }
        } catch {
          // Cross-origin stylesheet — skip.
        }
      }
      return false
    })
    expect(hasUnknownClass, '.sdd-dashboard__cell--unknown must exist in the stylesheet').toBe(true)
  })

  test('no old SddPipelinePanel or PhaseDecisionCard nodes exist in the DOM', async ({ page }) => {
    // spec-006 deleted these components. Guard against accidental re-introduction.
    await expect(page.locator('.sdd-pipeline-panel')).not.toBeAttached()
    await expect(page.locator('.phase-decision-card')).not.toBeAttached()
    await expect(page.locator('.phase-decision-card-drawer')).not.toBeAttached()
  })
})
