// E2E proof for "cd commands appear in tabs I never typed in"
// (fix/hidden-tab-directory-restore-cd).
//
// THE BUG: ForgeTerminal's socket-open handler restored a hidden tab's saved working
// directory by typing `cd "<dir>"` into the shell. Its only escape hatch was
// `wasReconnection`, which is true ONLY for a socket that dropped and retried. A page
// reload or app restart opens a *first-attempt* socket that the server answers with
// SESSION_REATTACHED — so the guard passed and the `cd` was typed into a shell that was
// already in that directory. The shell echoed it, so switching to a background tab
// revealed commands nobody had typed (and a CLI agent in that tab took the text as input).
//
// THE FIX: the decision moved into utils/directoryRestore.js, is re-evaluated at the
// moment the command would be sent (SESSION_REATTACHED arrives AFTER the socket opens),
// and refuses to send for any reattached session.
//
// THE PROOF (deterministic):
//   1. A WebSocket send-spy records every `cd`-shaped frame the page sends. After a
//      reload — the exact reattach case — ZERO such frames are sent.
//   2. Article X corroboration: the previously-hidden tab's own xterm buffer model
//      (window.term.buffer.active) carries no `cd` in the output written after recovery.
// Pre-fix, the hidden tab sends one `cd "<dir>"\r` ~800ms after the reload, so assertion 1
// is Red on the old build and Green on the fixed build.
//
// Launch: .\run-dev-clean.ps1   (dev server on :9999, NEW build)
// Run:    npx playwright test tests/e2e/hidden-tab-no-cd-injection.spec.js
//
// Article V: real browser events only (locator.click), never synthetic dispatch.

const { test, expect } = require('../fixtures/forge')

const APP_URL = 'http://localhost:9999'

// The restore fires 800ms after the socket opens; wait comfortably past it before
// asserting that nothing was sent.
const PAST_RESTORE_DELAY_MS = 3000

// Matches the directory-restore command in every shell form Forge emits:
// `cd "C:\..."`, `cd /d "D:\..."`, `cd ~/projects`.
const CD_COMMAND_PATTERN = /^cd (\/d )?["~]/

// installCdFrameSpy records every cd-shaped frame the page writes to any WebSocket.
// It reinstalls on each navigation, so after a reload the log holds only post-reload sends.
async function installCdFrameSpy(page) {
  await page.addInitScript((patternSource) => {
    // Exposes window.term (the xterm instance) so the buffer model can be read.
    window.Cypress = true
    const cdPattern = new RegExp(patternSource)
    window.__cdFrames = []
    const originalSend = WebSocket.prototype.send
    WebSocket.prototype.send = function sendWithCdSpy(payload) {
      if (typeof payload === 'string' && cdPattern.test(payload)) {
        window.__cdFrames.push({ url: this.url, payload })
      }
      return originalSend.call(this, payload)
    }
  }, CD_COMMAND_PATTERN.source)
}

// readActiveBufferTail returns the last `lineCount` lines of the ACTIVE terminal from the
// xterm buffer model — the only sanctioned way to read terminal output (Article X).
async function readActiveBufferTail(page, lineCount = 40) {
  return page.evaluate((count) => {
    const buffer = window.term.buffer.active
    const lines = []
    for (let lineIndex = Math.max(0, buffer.length - count); lineIndex < buffer.length; lineIndex++) {
      const line = buffer.getLine(lineIndex)
      if (line) lines.push(line.translateToString(true))
    }
    return lines.join('\n')
  }, lineCount)
}

test.describe('Hidden tabs are never sent a cd they did not ask for', () => {
  test('a reattached hidden tab receives no injected cd after a reload', async ({ page }) => {
    await installCdFrameSpy(page)

    await page.goto(APP_URL)
    await page.locator('.xterm').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForFunction(() => window.term && window.term.buffer && window.term.buffer.active, {
      timeout: 20000,
    })

    // Open a second tab so the first one is hidden and has a remembered directory —
    // exactly the tab the developer later switches back to and finds a stray `cd` in.
    await page.locator('.new-tab-btn').click()
    await page.waitForTimeout(2000) // let the new tab mount, open its socket, and settle

    // Reload. Every tab's shell stays alive on the backend, so each socket is a
    // first-attempt connection answered with SESSION_REATTACHED — the case the old
    // `wasReconnection` guard failed to cover.
    await page.reload()
    await page.locator('.xterm').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForFunction(() => window.term && window.term.buffer && window.term.buffer.active, {
      timeout: 20000,
    })
    await page.waitForTimeout(PAST_RESTORE_DELAY_MS)

    // Guarantee 1 — nothing cd-shaped was written to ANY socket by the app itself.
    const cdFrames = await page.evaluate(() => window.__cdFrames)
    expect(cdFrames, `unexpected cd injected: ${JSON.stringify(cdFrames)}`).toEqual([])

    // Guarantee 2 (Article X) — switch to the recovered hidden tab and read its own
    // buffer: the output written since recovery holds no `cd`.
    const tabs = page.locator('[data-testid="tab-item"], .tab-item')
    if (await tabs.count() > 1) {
      await tabs.first().click()
      await page.waitForTimeout(1000)
      const bufferTail = await readActiveBufferTail(page)
      expect(bufferTail).not.toMatch(/(^|\s)cd (\/d )?["~]/m)
    }
  })
})
