// E2E tests for Recovery-First Worktrees (specs/013). Covers the UI-observable guarantees added
// by this feature: the per-tab "Isolate this tab" control renders on the main checkout (US3 /
// FR-007), and the worktree collision offer appears on an SDD_WORKTREE_COLLISION push and is
// opt-in — "Stay shared" dismisses it with no side effect (FR-003 / C11).
//
// The substantive "opening a tab creates ZERO directories" and "recovery re-attaches" guarantees
// are proven end-to-end against REAL git by the Go integration suite
// (cmd/forge/sdd_worktree_integration_test.go):
//   go test -tags integration ./cmd/forge/...
//     TestResolveWorkspace_ConcurrentBindDoesNotProvision_RealGit  (zero directories on a bind)
//     TestProvisionWorktreeOnRequest_RealGit                       (explicit opt-in → exactly one)
// That is where worktree-on-disk assertions belong (mirroring worktree-concurrency.spec.js); this
// spec proves the frontend surfaces the recovery-first opt-in the backend now requires.
//
// Launch: .\scripts\run-dev-clean.ps1   (dev server on :9999, NEW backend build)
// Run:    npx playwright test tests/e2e/worktree-recovery.spec.js
//
// Article V: real browser events only (locator.click / page.keyboard). WS message injection
// mirrors the production socket and is the established technique in sdd-dashboard.spec.js.

const { test, expect, visitWithoutTour } = require('../fixtures/forge')

const APP_URL = 'http://localhost:9999'

// ── WS-injection harness (mirrors worktree-concurrency.spec.js) ───────────────

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

// visitAndBind opens a fresh tab (always on the main checkout) and returns ITS session id —
// captured from the new tab's own /api/sdd/bind POST. This is deterministic even when the app
// restored other tabs on boot (whose WS traffic would otherwise win a first-message race).
async function visitAndBind(page) {
  await visitWithoutTour(page, APP_URL)
  await page.locator('.xterm').first().waitFor({ state: 'visible', timeout: 20000 })
  await page.locator('[data-testid="sdd-dashboard"]').waitFor({ state: 'visible', timeout: 15000 })
  const bindReq = page.waitForRequest(
    (r) => r.url().includes('/api/sdd/bind') && r.method() === 'POST',
    { timeout: 20000 }
  )
  await page.locator('.new-tab-btn').click()
  const sessionId = (await bindReq).postDataJSON().sessionId
  await page.waitForTimeout(500) // let useSddGate settle on the new active session.
  return sessionId
}

// collisionMsg builds the SDD_WORKTREE_COLLISION offer the backend pushes when another active
// pipeline already runs in the repo (specs/013 FR-003).
function collisionMsg(sessionId) {
  return {
    type: 'SDD_WORKTREE_COLLISION',
    sessionId,
    repoRoot: 'C:/repo',
    message: 'This repository already has an active SDD pipeline. Open this tab in an isolated worktree to avoid collisions?',
  }
}

test.describe('Recovery-first worktrees — opt-in UI (specs/013)', () => {
  test.beforeEach(async ({ page }) => {
    await enableWsInjection(page)
    await page.addInitScript((fnSource) => {
      // eslint-disable-next-line no-eval
      window.__collisionMsg = eval('(' + fnSource + ')')
    }, collisionMsg.toString())
  })

  // US3 / FR-007 — the proactive per-tab opt-in control is present on the main checkout.
  test('shows the "Isolate this tab" control on the main checkout', async ({ page }) => {
    await visitAndBind(page)
    await expect(page.locator('[data-testid="sdd-isolate-tab"]')).toBeVisible({ timeout: 10000 })
  })

  // FR-007 — clicking the control issues the explicit POST /api/sdd/worktree (the ONLY create
  // path). We intercept the request to prove the wiring without mutating a real worktree.
  test('clicking "Isolate this tab" POSTs /api/sdd/worktree', async ({ page }) => {
    await visitAndBind(page)
    let posted = null
    await page.route('**/api/sdd/worktree', async (route) => {
      posted = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isolated: true, worktreePath: 'C:/repo/.forge/worktrees/wt1', branch: 'forge/wt-x' }) })
    })
    await page.locator('[data-testid="sdd-isolate-tab"]').click()
    await expect.poll(() => posted).not.toBeNull()
    expect(posted).toHaveProperty('sessionId')
  })

  // FR-003 / C11 — the collision offer appears on the WS push and "Stay shared" dismisses it with
  // no provisioning (the opt-in, recovery-first default).
  test('collision offer appears and "Stay shared" dismisses it without creating anything', async ({ page }) => {
    const sessionId = await visitAndBind(page)

    let worktreePosts = 0
    await page.route('**/api/sdd/worktree', async (route) => {
      worktreePosts += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isolated: true }) })
    })

    await page.evaluate(({ sessionId }) => window.__wsInject(window.__collisionMsg(sessionId)), { sessionId })

    const prompt = page.locator('[data-testid="sdd-collision-prompt"]')
    await expect(prompt).toBeVisible({ timeout: 10000 })

    await page.locator('[data-testid="sdd-collision-dismiss"]').click()
    await expect(prompt).toHaveCount(0)
    expect(worktreePosts).toBe(0) // dismiss must NOT provision (C11: stay shared, create nothing).
  })

  // FR-003 — confirming the collision offer issues the explicit provision request.
  test('confirming the collision offer POSTs /api/sdd/worktree', async ({ page }) => {
    const sessionId = await visitAndBind(page)
    let posted = false
    await page.route('**/api/sdd/worktree', async (route) => {
      posted = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isolated: true, worktreePath: 'C:/repo/.forge/worktrees/wt1', branch: 'forge/wt-x' }) })
    })

    await page.evaluate(({ sessionId }) => window.__wsInject(window.__collisionMsg(sessionId)), { sessionId })
    await page.locator('[data-testid="sdd-collision-confirm"]').click()
    await expect.poll(() => posted).toBe(true)
  })
})
