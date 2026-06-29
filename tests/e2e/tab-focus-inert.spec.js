// E2E proof for the recovered-tab focus race (fix/recovery-tab-id-collision-focus-race).
//
// THE BUG: on session restore every tab's xterm mounts in parallel. A non-visible
// tab's `.xterm-helper-textarea` could win the focus race and silently swallow the
// user's keystrokes — most visibly the numeric prompt of a CLI in a recovered tab,
// which is why it surfaced as "can't type numbers". Two prior band-aid fixes did not
// hold.
//
// THE FIX (root cause): a non-visible tab's terminal-wrapper is marked `inert`, so it
// is removed from focus and keyboard handling entirely. A hidden tab can therefore
// NEVER receive focus or keystrokes, regardless of mount timing.
//
// THE PROOF (deterministic, Article X — reads window.term.buffer.active, not the DOM):
//   1. The non-active tab's wrapper carries the `inert` attribute; the active one does not.
//   2. Programmatically focusing the hidden tab's textarea is a no-op (inert blocks it).
//   3. A digit typed with the real keyboard lands in the ACTIVE tab's buffer.
// Pre-fix, step 2 succeeds (focus moves to the hidden textarea) and step 3 fails (the
// digit goes to the hidden PTY, never appearing in the active buffer) — so this spec is
// Red on the old build and Green on the fixed build.
//
// Launch: .\scripts\run-dev-clean.ps1   (dev server on :9999, NEW build)
// Run:    npx playwright test tests/e2e/tab-focus-inert.spec.js
//
// Article V: real browser events only (page.keyboard / locator.click).

const { test, expect } = require('../fixtures/forge')

const APP_URL = 'http://localhost:9999'

test.describe('Recovered-tab focus race — hidden tabs are inert (cannot steal keystrokes)', () => {
  test.beforeEach(async ({ page }) => {
    // Expose window.term for the buffer-model read, and disable the welcome tour.
    await page.addInitScript(() => {
      window.Cypress = true
      window.localStorage.setItem('tour_disabled', 'true')
    })
  })

  test('a hidden tab is inert and the active tab receives the typed digit', async ({ page }) => {
    await page.goto(APP_URL)
    await page.locator('.xterm').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForFunction(() => window.term && window.term.buffer && window.term.buffer.active, {
      timeout: 20000,
    })

    // Open a second tab. It becomes the active tab; the first tab is now hidden.
    await page.locator('.new-tab-btn').click()
    await page.waitForTimeout(1500) // let the new tab mount and open its socket

    // Guarantee 1 — EVERY hidden wrapper is inert, and the single active one is not.
    // (The dev instance may restore several tabs, which is exactly the multi-tab
    // recovery state this fix targets — so assert over all of them, not a fixed count.)
    const hiddenWrappers = page.locator('.terminal-wrapper.hidden')
    const hiddenCount = await hiddenWrappers.count()
    expect(hiddenCount).toBeGreaterThan(0)
    for (let wrapperIndex = 0; wrapperIndex < hiddenCount; wrapperIndex++) {
      await expect(hiddenWrappers.nth(wrapperIndex)).toHaveAttribute('inert', '')
    }
    const activeWrappers = page.locator('.terminal-wrapper:not(.hidden)')
    await expect(activeWrappers).toHaveCount(1)
    await expect(activeWrappers.first()).not.toHaveAttribute('inert', '')

    // Guarantee 2 — focusing the hidden tab's textarea is a no-op (inert blocks focus),
    // so a hidden tab can never win the focus race that this fix targets.
    const hiddenTextareaFocused = await page.evaluate(() => {
      const hiddenWrapper = document.querySelector('.terminal-wrapper.hidden')
      const hiddenTextarea = hiddenWrapper?.querySelector('.xterm-helper-textarea')
      if (!hiddenTextarea) return 'no-hidden-textarea'
      hiddenTextarea.focus()
      return document.activeElement === hiddenTextarea
    })
    expect(hiddenTextareaFocused).toBe(false)

    // Guarantee 3 — a digit typed with the real keyboard lands in the ACTIVE tab's
    // buffer (window.term tracks the most-recently-mounted = active terminal).
    const uniqueDigits = '314159'
    await page.locator('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').focus()
    await page.keyboard.type(uniqueDigits)

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const buffer = window.term.buffer.active
            let fullText = ''
            for (let lineIndex = 0; lineIndex < buffer.length; lineIndex++) {
              const line = buffer.getLine(lineIndex)
              if (line) fullText += line.translateToString(true) + '\n'
            }
            return fullText
          }),
        { timeout: 8000 }
      )
      .toContain(uniqueDigits)
  })
})
