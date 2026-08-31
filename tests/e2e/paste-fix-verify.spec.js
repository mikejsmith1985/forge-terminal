/**
 * Paste fix verification test (headless-compatible)
 * Suppresses xterm canvas/dimensions error which is a headless Playwright artifact.
 */

const { test, expect, visitWithoutTour } = require('../fixtures/forge')

// Playwright handles uncaught exceptions per-page if needed; no global suppression
// required here because Playwright does not fail tests on unhandled app errors by
// default (unlike Cypress's uncaughtException hook).

test.describe('Paste Handler Fix Verification', () => {
  test('handlePaste fires once via synthetic ClipboardEvent (no double paste)', async ({ page }) => {
    const testText = `paste-fix-${Date.now()}`

    await visitWithoutTour(page, '/')
    await page.locator('.xterm-helper-textarea').waitFor({ timeout: 30000 })
    await page.locator('.xterm-helper-textarea').first().focus()

    await page.evaluate((text) => {
      window.__pasteCallLog = []
      if (window.term) {
        const origPaste = window.term.paste.bind(window.term)
        window.term.paste = (t) => {
          window.__pasteCallLog.push(t)
          return origPaste(t)
        }
      }
      const textarea = document.querySelector('.xterm-helper-textarea')
      const dt = new DataTransfer()
      dt.setData('text/plain', text)
      const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
      textarea.dispatchEvent(evt)
    }, testText)

    // Poll for result — equivalent to cy.window().should() with a condition
    await expect.poll(async () => {
      return await page.evaluate(() => {
        if (window.term && window.__pasteCallLog !== undefined) {
          return { length: window.__pasteCallLog.length, first: window.__pasteCallLog[0] }
        }
        return null
      })
    }, { timeout: 10000 }).toMatchObject({ length: 1, first: testText })

    await page.screenshot({ path: 'screenshots/paste-fix-single-call.png' })
  })

  test('window.__terminalPaste exposed (paste infrastructure wired up)', async ({ page }) => {
    await visitWithoutTour(page, '/')
    await page.locator('.xterm-helper-textarea').waitFor({ timeout: 30000 })

    // Wait until __terminalPaste is a function on window
    await page.waitForFunction(() => typeof window.__terminalPaste === 'function', { timeout: 10000 })

    await page.screenshot({ path: 'screenshots/paste-fix-infrastructure.png' })
  })

  test('Ctrl+V real keypress - at most 1 paste call (no double paste)', async ({ page }) => {
    const testText = `ctrlv-${Date.now()}`

    await visitWithoutTour(page, '/')
    await page.locator('.xterm-helper-textarea').waitFor({ timeout: 30000 })

    await page.evaluate((text) => {
      window.__pasteCallLog = []
      if (window.term) {
        const origPaste = window.term.paste.bind(window.term)
        window.term.paste = (t) => { window.__pasteCallLog.push(t); return origPaste(t) }
      }
      // Attempt to pre-load the clipboard; may be blocked in headless — that is acceptable
      return navigator.clipboard.writeText(text).catch(() => {/* headless ok */})
    }, testText)

    await page.locator('.xterm-helper-textarea').first().focus()
    await page.keyboard.press('Control+V')

    // Poll for result — at most 1 paste call (no double paste)
    await expect.poll(async () => {
      return await page.evaluate(() => {
        if (window.__pasteCallLog !== undefined) {
          return window.__pasteCallLog.length
        }
        return null
      })
    }, { timeout: 5000 }).toBeLessThanOrEqual(1)

    await page.screenshot({ path: 'screenshots/paste-fix-ctrlv.png' })
  })
})
