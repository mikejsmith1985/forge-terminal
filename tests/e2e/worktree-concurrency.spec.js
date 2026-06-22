// E2E tests for Automated Worktrees for Concurrent Same-Repo Pipelines (specs/011).
// Covers the UI-observable guarantees: the per-tab worktree binding indicator renders
// when a pipeline is isolated (US3 / FR-007) and is absent on the main checkout
// (SC-007 — the single-pipeline case is visually unchanged).
//
// The provisioning, isolation, safe-cleanup, and restart-discovery behaviours are
// proven end-to-end against REAL git by the Go integration suite
// (cmd/forge/sdd_worktree_integration_test.go, internal/git/worktree_integration_test.go):
//   go test -tags integration ./cmd/forge/... ./internal/git/...
// That is where worktree-on-disk assertions belong; this spec proves the frontend
// surfaces the binding the backend reports.
//
// Launch: .\scripts\run-dev-clean.ps1   (dev server on :9999, NEW backend build)
// Run:    npx playwright test tests/e2e/worktree-concurrency.spec.js
//
// Article V: real browser events only. WS message injection mirrors the production
//   socket and is the established technique in sdd-dashboard.spec.js.

const { test, expect, visitWithoutTour } = require('../fixtures/forge')

const APP_URL = 'http://localhost:9999'

// ── WS-injection harness (mirrors sdd-authoritative-state.spec.js) ────────────

async function enableWsInjection(page) {
  await page.addInitScript(() => {
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
  await page.waitForTimeout(1500)
  return getSessionId(page)
}

// statusWithBinding builds an SDD_PHASE_STATUS message carrying a worktree binding.
function statusWithBinding(sessionId, binding) {
  return {
    type: 'SDD_PHASE_STATUS',
    sessionId,
    feature: 'feat',
    phases: [{ phase: 'plan', displayStatus: 'pending', runCount: 1, artifactPath: '' }],
    binding,
  }
}

// ── US3 / FR-007: the worktree binding indicator ──────────────────────────────

test.describe('SDD worktree concurrency — binding indicator', () => {
  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
  })

  test('shows "worktree: <branch>" when the tab runs in an isolated worktree', async ({ page }) => {
    const sessionId = await visitAndBind(page)

    await page.evaluate(({ sessionId }) => {
      window.__wsInject(window.__statusWithBinding(sessionId, {
        isolated: true,
        branch: 'feature/011-worktree-concurrency',
        worktreePath: 'C:/repo/.forge/worktrees/wt1',
        baseBranch: 'main',
      }))
    }, { sessionId })

    const indicator = page.locator('[data-testid="sdd-worktree-indicator"]')
    await expect(indicator).toBeVisible({ timeout: 10000 })
    await expect(indicator).toContainText('feature/011-worktree-concurrency')
  })

  test('shows no indicator on the main checkout (single-pipeline unchanged, SC-007)', async ({ page }) => {
    const sessionId = await visitAndBind(page)

    await page.evaluate(({ sessionId }) => {
      window.__wsInject(window.__statusWithBinding(sessionId, { isolated: false }))
    }, { sessionId })

    // Give the render a beat, then assert the indicator never appears.
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="sdd-worktree-indicator"]')).toHaveCount(0)
  })
})

// Expose the message builder inside the page context for the injections above.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((fnSource) => {
    // eslint-disable-next-line no-eval
    window.__statusWithBinding = eval('(' + fnSource + ')')
  }, statusWithBinding.toString())
})
