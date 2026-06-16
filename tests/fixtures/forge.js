// forge.js — Playwright fixtures and helpers for Forge Terminal E2E tests.
// Translates the 8 custom Cypress commands from cypress/support/e2e.js to Playwright.
// Import `test` and `expect` from this module instead of '@playwright/test' to get the
// auto-tour-skip fixture pre-wired in every test.
const { test: baseTest, expect } = require('@playwright/test')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(execFile)

// exec — runs a shell command and returns { stdout, stderr }.
// Translates cy.exec() which ran via the Cypress task server.
async function exec(command) {
  return execAsync('cmd.exe', ['/c', command])
}

// skipTour — sets the two localStorage keys that prevent the welcome tour modal.
// Call before page.goto() to ensure it fires on the first load.
async function skipTour(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('forge_tour_completed', 'v3.4.0')
    window.localStorage.setItem('forge_tour_version', 'v999.0.0')
  })
}

// visitWithoutTour — navigate to a URL with the tour disabled via localStorage.
// Translates cy.visitWithoutTour(url).
async function visitWithoutTour(page, url = '/') {
  await page.addInitScript(() => {
    window.localStorage.setItem('tour_disabled', 'true')
  })
  await page.goto(url)
}

// waitForTerminal — waits for the xterm element and for window.term to be ready.
// Translates cy.waitForTerminal(timeout).
async function waitForTerminal(page, timeout = 30000) {
  await page.locator('.xterm').waitFor({ timeout })
  // Dismiss the Skip Tour button if it appears.
  const skipButton = page.locator('button:has-text("Skip Tour")')
  const isSkipVisible = await skipButton.isVisible().catch(() => false)
  if (isSkipVisible) {
    await skipButton.click({ force: true })
    await page.waitForTimeout(500)
  }
  // Wait until window.term is available and its buffer is active.
  await page.waitForFunction(
    () => window.term && window.term.buffer && window.term.buffer.active,
    { timeout }
  )
}

// getTerminalOutput — returns the last `lineCount` lines from the xterm buffer.
// Translates cy.getTerminalOutput(lineCount). Per Article X: reads the buffer model,
// never DOM text.
async function getTerminalOutput(page, lineCount = 10) {
  return page.evaluate((count) => {
    if (!window.term) throw new Error('Terminal not exposed on window.term')
    const buffer = window.term.buffer.active
    const lines = []
    const startLine = Math.max(0, buffer.length - count)
    for (let i = startLine; i < buffer.length; i++) {
      const line = buffer.getLine(i)
      if (line) lines.push(line.translateToString(true))
    }
    return lines.join('\n')
  }, lineCount)
}

// terminalType — types text into the terminal using real keyboard events.
// Translates cy.terminalType(text) which used cypress-real-events realType().
async function terminalType(page, text) {
  await page.locator('.xterm-helper-textarea').pressSequentially(text)
}

// terminalPaste — fires a real Ctrl+V into the terminal.
// Translates cy.terminalPaste() which used realPress(['Control', 'V']).
async function terminalPaste(page) {
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.press('Control+V')
}

// terminalEnter — sends the Enter key to the terminal.
// Translates cy.terminalEnter().
async function terminalEnter(page) {
  await page.locator('.xterm-helper-textarea').press('Enter')
}

// terminalShouldContain — polls the xterm buffer until `text` appears or `timeout` expires.
// Translates cy.terminalShouldContain(text, { timeout }). Per Article X: reads the buffer
// model, never the DOM canvas.
async function terminalShouldContain(page, text, options = {}) {
  const { timeout = 10000 } = options
  await expect.poll(
    () =>
      page.evaluate(() => {
        if (!window.term) return ''
        const buffer = window.term.buffer.active
        let fullText = ''
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i)
          if (line) fullText += line.translateToString(true) + '\n'
        }
        return fullText
      }),
    { timeout }
  ).toContain(text)
}

// waitForConnection — waits until window.__FORGE_APP__.isConnected() returns true.
// Translates cy.waitForConnection(timeout).
async function waitForConnection(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const app = window.__FORGE_APP__
      return app && app.isConnected && app.isConnected()
    },
    { timeout }
  )
}

// Extended test fixture: tour is auto-disabled in every test via addInitScript.
// Import `test` from this module to inherit this behaviour without boilerplate.
const test = baseTest.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('tour_disabled', 'true')
    })
    await use(page)
  },
})

module.exports = {
  test,
  expect,
  exec,
  skipTour,
  visitWithoutTour,
  waitForTerminal,
  getTerminalOutput,
  terminalType,
  terminalPaste,
  terminalEnter,
  terminalShouldContain,
  waitForConnection,
}
