// E2E proof that Forge opens straight into the workspace with no license.
//
// THE CHANGE: Forge used to check for a license at startup and, without one,
// replaced the whole UI with a "license required" screen while every API route
// answered 402. Licensing is removed: the workspace loads for everyone, and the
// Forge Companion card offers mobile access as a free switch, not an upgrade.
//
// THE PROOF:
//   1. The page never calls /api/license/*, and no license screen is shown.
//   2. A terminal renders and its xterm buffer model (window.term.buffer.active)
//      is live, so the workspace itself loaded (Article X).
//   3. Opening the Forge Companion card with a real click shows the enable switch
//      and no upgrade, paid, or subscription wording.
//
// Launch: .\run-dev-clean.ps1   (dev server on :9999, NEW build)
// Run:    npx playwright test tests/e2e/no-license-required.spec.js
//
// Article V: real browser events only (locator.click), never synthetic dispatch.

const { test, expect } = require('../fixtures/forge')

const APP_URL = 'http://localhost:9999'

// Generous because the first terminal spawns a real shell on a cold dev build.
const TERMINAL_READY_TIMEOUT_MS = 20000

test('Forge opens the workspace with no license', async ({ page }) => {
  // Exposes window.term (the xterm instance) so the buffer model can be read.
  await page.addInitScript(() => { window.Cypress = true })

  const licenseRequests = []
  page.on('request', request => {
    if (request.url().includes('/api/license')) licenseRequests.push(request.url())
  })

  await page.goto(APP_URL)

  await expect(page.locator('.xterm').first()).toBeVisible({ timeout: TERMINAL_READY_TIMEOUT_MS })
  await expect.poll(
    () => page.evaluate(() => Boolean(window.term && window.term.buffer.active)),
    { timeout: TERMINAL_READY_TIMEOUT_MS },
  ).toBe(true)

  await expect(page.getByText(/license required|activate.*license|license key/i)).toHaveCount(0)
  expect(licenseRequests).toEqual([])
})

test('Forge Companion offers mobile access as a free switch', async ({ page }) => {
  await page.goto(APP_URL)

  // The Companion card lives in the sidebar's MCP view.
  await page.locator('.sidebar-view-tab[title="MCP"]').click()
  const companionHeader = page.locator('.companion-access-card .cac-header')
  await companionHeader.scrollIntoViewIfNeeded()
  await companionHeader.click()

  const companionCard = page.locator('.companion-access-card')
  await expect(companionCard.getByText(/Enable Mobile Access|Disable/).first()).toBeVisible()
  await expect(companionCard.getByText(/upgrade|paid add-on|subscription/i)).toHaveCount(0)
})
