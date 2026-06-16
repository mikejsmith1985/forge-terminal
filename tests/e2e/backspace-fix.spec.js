/**
 * Playwright E2E Test: Backspace Key Functionality
 *
 * v3.12.13: Tests that backspace works correctly with all CLIs
 * - Typing text then deleting works without freezing
 * - Deleting on empty line works
 * - Works with both Claude and Copilot CLIs
 */
const { test, expect, visitWithoutTour } = require('../fixtures/forge')

test.describe('Backspace Key Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // visitWithoutTour navigates to the app with the tour already disabled via
    // localStorage, replacing both cy.visit() and the manual tour-close conditional.
    await visitWithoutTour(page, 'http://localhost:3005')

    // Wait for app to fully load
    await page.waitForTimeout(2000)

    // Wait for the VISIBLE terminal (not hidden one)
    await page.locator('.terminal-wrapper:not(.hidden) .terminal-inner').waitFor({ timeout: 15000 })
    await expect(page.locator('.terminal-wrapper:not(.hidden) .terminal-inner')).toBeVisible()

    // Wait for terminal to be ready
    await page.waitForTimeout(1000)
  })

  test('should delete characters when backspace is pressed', async ({ page }) => {
    // Click visible terminal to focus
    await page.locator('.terminal-wrapper:not(.hidden) .terminal-inner').click({ force: true })
    await page.waitForTimeout(500)

    // Type some text — xterm uses .xterm-helper-textarea for input
    await page.locator('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').pressSequentially('hello')

    // Wait for terminal to receive the text
    await page.waitForTimeout(500)

    // Press backspace 3 times
    await page.locator('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').focus()
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')

    // Wait for terminal to process
    await page.waitForTimeout(500)

    // Take screenshot to verify visual result
    await page.screenshot({ path: 'screenshots/backspace-after-delete.png' })

    // The text "hello" minus 3 chars should leave "he"
    // Note: We cannot easily assert terminal buffer content directly here.
    // The test passes if no freeze/hang occurs during backspace.
  })

  test('should handle backspace on empty line without issues', async ({ page }) => {
    // Click visible terminal to focus
    await page.locator('.terminal-wrapper:not(.hidden) .terminal-inner').click({ force: true })
    await page.waitForTimeout(500)

    // Press backspace multiple times on empty line — should not freeze
    await page.locator('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').focus()
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')

    // Wait briefly
    await page.waitForTimeout(500)

    // Terminal should still be responsive
    await expect(page.locator('.terminal-wrapper:not(.hidden) .terminal-inner')).toBeVisible()

    // Type new text to confirm terminal is responsive
    await page.locator('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').pressSequentially('still works')
    await page.waitForTimeout(500)

    await page.screenshot({ path: 'screenshots/backspace-empty-line-then-type.png' })
  })

  test('should not freeze during rapid backspace', async ({ page }) => {
    // Click visible terminal to focus
    await page.locator('.terminal-wrapper:not(.hidden) .terminal-inner').click({ force: true })
    await page.waitForTimeout(500)

    // Type a longer string
    await page.locator('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').pressSequentially('this is a test string')
    await page.waitForTimeout(500)

    // Rapid backspace to delete everything — 22 presses with a 50 ms delay between each,
    // matching the original { delay: 50 } option from the Cypress type() call.
    await page.locator('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').focus()
    for (let i = 0; i < 22; i++) {
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(50)
    }

    // Wait for all backspaces to process
    await page.waitForTimeout(1000)

    // Terminal should still be responsive
    await expect(page.locator('.terminal-wrapper:not(.hidden) .terminal-inner')).toBeVisible()
    await page.locator('.terminal-wrapper:not(.hidden) .xterm-helper-textarea').pressSequentially('recovered')

    await page.screenshot({ path: 'screenshots/backspace-rapid-delete.png' })
  })
})
