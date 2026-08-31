// E2E tests for SDD Authoritative State & Concise Phase Reports (specs/010).
// Covers: US1 (bar advances on the authoritative phase-event), US2 (per-session
// scoping — a gate in one tab does not appear in another), US3 (the concise
// report card renders with files/scope/decisions and the View-full-output opt-in).
//
// Launch: .\scripts\run-dev-clean.ps1   (dev server on :9999, NEW backend build)
// Run:    npx playwright test tests/e2e/sdd-authoritative-state.spec.js
//
// NOTE: requires the binary built from this branch — the authoritative phase-event
// endpoint and session-scoped gate-check do not exist in older builds.
//
// Article V: real browser events only (locator.click) — never page.evaluate to
//   dispatch synthetic DOM input. (WS message injection mirrors the production
//   socket and is the established technique in sdd-dashboard.spec.js.)
// Article X: terminal content asserted via window.term.buffer.active, never DOM text.

const { test, expect, visitWithoutTour } = require('../fixtures/forge')

const APP_URL = 'http://localhost:9999'

// ── WS-injection harness (mirrors sdd-dashboard.spec.js) ──────────────────────

async function enableWsInjection(page) {
  await page.addInitScript(() => {
    const origFetch = window.fetch
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? ''
      if (url.includes('/api/sdd/status')) {
        try {
          const parsed = new URL(url, location.origin)
          const sessionId = parsed.searchParams.get('sessionId')
          if (sessionId) window.__testSessionId = sessionId
        } catch (e) {}
      }
      return origFetch.apply(this, args)
    }
    const OrigWS = window.WebSocket
    window.WebSocket = class extends OrigWS {
      constructor (...args) {
        super(...args)
        window.__testWS = this
        this.addEventListener('message', (evt) => {
          try {
            const msg = JSON.parse(evt.data)
            if (msg.sessionId && !window.__testSessionId) window.__testSessionId = msg.sessionId
          } catch (e) {}
        })
      }
    }
    window.__wsInject = (msg) => {
      if (!window.__testWS) return false
      window.__testWS.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(msg) }))
      return true
    }
  })
}

async function getSessionId(page, timeout = 8000) {
  await page.waitForFunction(() => !!window.__testSessionId, { timeout })
  return page.evaluate(() => window.__testSessionId)
}

async function visitAndBind(page) {
  await visitWithoutTour(page, APP_URL)
  await page.locator('.xterm').first().waitFor({ state: 'visible', timeout: 20000 })
  await page.locator('[data-testid="sdd-dashboard"]').waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('.new-tab-btn').click()
  await page.waitForTimeout(1500) // let the shell connect + the recovery fetch fire
  return getSessionId(page)
}

// postPhaseEvent drives the REAL authoritative endpoint through the dev proxy.
async function postPhaseEvent(page, body) {
  return page.request.post(`${APP_URL}/api/sdd/phase-event`, { data: body })
}

// ── US3: the concise report card renders (WS injection) ───────────────────────

test.describe('SDD authoritative state — US3 report card', () => {
  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
  })

  test('gate card renders scope, files with +/- counts, and decisions', async ({ page }) => {
    const sessionId = await visitAndBind(page)

    await page.evaluate(({ sessionId }) => {
      window.__wsInject({
        type: 'SDD_PHASE_GATE', sessionId, cardId: 'card-plan', phase: 'plan',
        summary: { headline: 'Plan complete', producedItems: [], flags: [] },
        actions: ['approve', 'reject', 'clarify'],
        reportCard: {
          phase: 'plan', scope: '2 file(s) changed (+45/-2)', totalFiles: 2, filesTruncated: false,
          files: [
            { path: 'specs/feat/plan.md', added: 40, removed: 2 },
            { path: 'specs/feat/research.md', added: 5, removed: 0 },
          ],
          decisions: ['Chose retrofit over rewrite'], runCount: 1,
        },
        artifactPreview: { filePath: 'specs/feat/plan.md', content: '# Plan', totalLines: 1 },
      })
    }, { sessionId })

    const card = page.locator('[data-testid="sdd-report-card"]')
    await expect(card).toBeVisible({ timeout: 10000 })
    await expect(card).toContainText('2 file(s) changed (+45/-2)')
    await expect(card).toContainText('plan.md')
    await expect(card).toContainText('+40/-2')
    await expect(card).toContainText('Chose retrofit over rewrite')
    await expect(card.locator('text=View full output →')).toBeVisible()
  })

  test('a no-op phase shows "No files changed" rather than an empty card', async ({ page }) => {
    const sessionId = await visitAndBind(page)

    await page.evaluate(({ sessionId }) => {
      window.__wsInject({
        type: 'SDD_PHASE_GATE', sessionId, cardId: 'card-validate', phase: 'validate',
        summary: { headline: 'Validate complete', producedItems: [], flags: [] },
        actions: ['approve', 'reject', 'clarify'],
        reportCard: { phase: 'validate', scope: 'No files changed', totalFiles: 0, filesTruncated: false, files: [], decisions: [], runCount: 1 },
      })
    }, { sessionId })

    await expect(page.locator('[data-testid="sdd-report-card"]')).toContainText('No files changed', { timeout: 10000 })
  })
})

// ── US1: the bar advances on the authoritative signal (real endpoint) ─────────

test.describe('SDD authoritative state — US1 bar advances on signal', () => {
  test('started → phase active, complete → awaiting decision', async ({ page }) => {
    const sessionId = await visitAndBind(page)

    // Authoritative "started" must mark the phase active immediately.
    await postPhaseEvent(page, { sessionId, phase: 'specify', event: 'started' })
    await expect(
      page.locator('.sdd-dashboard__cell--active .sdd-dashboard__cell-name')
    ).toContainText('specify', { timeout: 10000 })

    // Authoritative "complete" must open the gate (awaiting decision) without any file-watch wait.
    await postPhaseEvent(page, { sessionId, phase: 'specify', event: 'complete', decisions: ['scoped to MVP'] })
    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).toBeVisible({ timeout: 10000 })
    await expect(
      page.locator('.sdd-dashboard__cell--awaiting-decision .sdd-dashboard__cell-name')
    ).toContainText('specify', { timeout: 5000 })
  })
})

// ── US2: per-session scoping — a gate in tab A does not appear in tab B ────────

test.describe('SDD authoritative state — US2 no cross-session conflation', () => {
  test('a gate opened in one tab does not appear after switching to a new tab', async ({ page }) => {
    const sessionA = await visitAndBind(page)

    // Drive tab A to an open gate via the authoritative endpoint.
    await postPhaseEvent(page, { sessionId: sessionA, phase: 'specify', event: 'started' })
    await postPhaseEvent(page, { sessionId: sessionA, phase: 'specify', event: 'complete', decisions: [] })
    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).toBeVisible({ timeout: 10000 })

    // Open a SECOND tab — it becomes active with its own session and no gate.
    await page.locator('.new-tab-btn').click()
    await page.waitForTimeout(1500)

    // The decision bar must NOT be present for tab B (it must not inherit A's gate).
    await expect(page.locator('.sdd-dashboard__decision-btn--approve')).not.toBeVisible({ timeout: 8000 })
  })
})
