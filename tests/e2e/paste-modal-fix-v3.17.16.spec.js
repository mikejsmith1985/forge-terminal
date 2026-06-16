/**
 * Ctrl+V Paste Fix v3.17.16 - Modal Interference Bug (Playwright)
 *
 * Problem: FeedbackModal's document-level paste listener was intercepting
 * ALL paste events when modal was open, preventing terminal paste.
 *
 * Fix: Modal now checks if paste target is inside modal before handling.
 *
 * Tests:
 * 1. Ctrl+V in terminal works normally (baseline)
 * 2. Ctrl+V in terminal still works when modal is open (the fix)
 * 3. Ctrl+V in active tab doesn't paste to other tabs (multi-tab routing)
 */

const { test, expect, visitWithoutTour, waitForTerminal } = require('../fixtures/forge')

test.describe('Paste Modal Fix v3.17.16', () => {
  test.beforeEach(async ({ page }) => {
    await visitWithoutTour(page, '/')
    await waitForTerminal(page, 30000)
    await page.waitForTimeout(2000)
  })

  test('should paste to terminal normally (baseline)', async ({ page }) => {
    const testText = `baseline-${Date.now()}`

    // Write to clipboard
    await page.evaluate((text) => window.navigator.clipboard.writeText(text), testText)
    console.log('Clipboard written:', testText)

    // Focus terminal and paste
    await page.locator('.xterm-helper-textarea').first().focus()
    await page.waitForTimeout(500)
    await page.keyboard.press('Control+V')
    console.log('Real Ctrl+V pressed')
    await page.waitForTimeout(1500)

    // Verify text appears in terminal by reading the xterm buffer model (Article X)
    const fullText = await page.evaluate(() => {
      const buffer = window.term.buffer.active
      let text = ''
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) {
          text += line.translateToString(true) + '\n'
        }
      }
      return text
    })
    console.log('Terminal buffer:', fullText)
    expect(fullText).toContain(testText)

    await page.screenshot({ path: 'screenshots/v3.17.16-baseline-paste.png' })
  })

  test('should paste to terminal even when feedback modal is open', async ({ page }) => {
    const testText = `modal-open-${Date.now()}`

    // Open feedback modal via keyboard shortcut Ctrl+Shift+F
    await page.keyboard.press('Control+Shift+F')
    await page.waitForTimeout(1000)

    // Verify modal is open
    await expect(page.locator('.modal-overlay')).toBeVisible()
    console.log('Feedback modal opened')

    // Write to clipboard
    await page.evaluate((text) => window.navigator.clipboard.writeText(text), testText)
    console.log('Clipboard written:', testText)

    // Focus terminal (click on it to ensure focus)
    await page.locator('.xterm-helper-textarea').first().click({ force: true })
    await page.locator('.xterm-helper-textarea').first().focus()
    await page.waitForTimeout(500)

    // Paste with Ctrl+V
    await page.keyboard.press('Control+V')
    console.log('Real Ctrl+V pressed with modal open')
    await page.waitForTimeout(1500)

    // Verify text appears in terminal (NOT intercepted by modal) — reads buffer model (Article X)
    const fullText = await page.evaluate(() => {
      const buffer = window.term.buffer.active
      let text = ''
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) {
          text += line.translateToString(true) + '\n'
        }
      }
      return text
    })
    console.log('Terminal buffer with modal open:', fullText)
    expect(fullText).toContain(testText)

    await page.screenshot({ path: 'screenshots/v3.17.16-modal-open-paste.png' })

    // Close modal
    await page.locator('.btn-close').first().click()
  })

  test('should paste only to active tab in multi-tab scenario', async ({ page }) => {
    const testText = `tab-routing-${Date.now()}`

    // Create 3 tabs
    await expect(page.locator('.tab-bar')).toBeAttached()

    // Add second tab
    await page.locator('.tab-plus').click()
    await page.waitForTimeout(1000)

    // Add third tab
    await page.locator('.tab-plus').click()
    await page.waitForTimeout(1000)

    // Verify we have 3 tabs
    await expect(page.locator('.tab')).toHaveCount(3)
    console.log('3 tabs created')

    // Click on middle tab (tab 2) to make it active
    await page.locator('.tab').nth(1).click()
    await page.waitForTimeout(500)

    // Verify tab 2 is active
    await expect(page.locator('.tab').nth(1)).toHaveClass(/active/)
    console.log('Tab 2 is active')

    // Write to clipboard
    await page.evaluate((text) => window.navigator.clipboard.writeText(text), testText)

    // Focus terminal in active tab
    await page.locator('.terminal-wrapper').nth(1).locator('.xterm-helper-textarea').focus()
    await page.waitForTimeout(500)

    // Paste with real Ctrl+V
    await page.keyboard.press('Control+V')
    console.log('Real Ctrl+V pressed in tab 2')
    await page.waitForTimeout(1500)

    // Verify text appears ONLY in tab 2 (active tab) by reading each terminal's buffer (Article X)
    const tabResults = await page.evaluate((searchText) => {
      const terminals = document.querySelectorAll('.terminal-wrapper')
      const results = []

      terminals.forEach((termWrapper, idx) => {
        const terminalInstance = termWrapper.__terminal
        if (terminalInstance) {
          const buffer = terminalInstance.buffer.active
          let fullText = ''
          for (let i = 0; i < buffer.length; i++) {
            const line = buffer.getLine(i)
            if (line) {
              fullText += line.translateToString(true) + '\n'
            }
          }
          results.push({ idx, hasText: fullText.includes(searchText) })
        }
      })

      return results
    }, testText)

    tabResults.forEach(({ idx, hasText }) => {
      console.log(`Tab ${idx + 1} has text: ${hasText}`)
      // Only tab 2 (index 1) should have the text
      if (idx === 1) {
        expect(hasText).toBe(true)
      } else {
        expect(hasText).toBe(false)
      }
    })

    await page.screenshot({ path: 'screenshots/v3.17.16-multi-tab-routing.png' })
  })

  test('should handle 5 consecutive pastes with modal interference', async ({ page }) => {
    const results = []

    for (let i = 0; i < 5; i++) {
      const iteration = i + 1
      const testText = `iter-${iteration}-${Date.now()}`

      // Every other iteration, toggle modal open/closed
      if (iteration % 2 === 0) {
        await page.keyboard.press('Control+Shift+F')
        await page.waitForTimeout(500)
        console.log(`Iteration ${iteration}: Modal opened`)
      } else if (iteration > 1) {
        await page.locator('.btn-close').first().click()
        await page.waitForTimeout(500)
        console.log(`Iteration ${iteration}: Modal closed`)
      }

      // Write to clipboard
      await page.evaluate((text) => window.navigator.clipboard.writeText(text), testText)

      // Focus terminal and paste
      await page.locator('.xterm-helper-textarea').first().click({ force: true })
      await page.locator('.xterm-helper-textarea').first().focus()
      await page.waitForTimeout(300)
      await page.keyboard.press('Control+V')
      await page.waitForTimeout(1000)

      // Verify by reading xterm buffer model (Article X)
      const fullText = await page.evaluate(() => {
        const buffer = window.term.buffer.active
        let text = ''
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i)
          if (line) {
            text += line.translateToString(true) + '\n'
          }
        }
        return text
      })

      const iterTag = `iter-${iteration}`
      const success = fullText.includes(iterTag)
      results.push({ iteration, success })
      console.log(`Iteration ${iteration}: ${success ? 'PASS' : 'FAIL'}`)

      // Clear line
      await page.keyboard.press('Enter')
      await page.waitForTimeout(300)
    }

    // Final verification — require 100% success
    const passCount = results.filter((r) => r.success).length
    console.log(`Final results: ${passCount}/5 passed`)
    expect(passCount).toBe(5)

    // Close modal if open
    const modalCount = await page.locator('.modal-overlay').count()
    if (modalCount > 0) {
      await page.locator('.btn-close').first().click()
    }

    await page.screenshot({ path: 'screenshots/v3.17.16-modal-interference-5x.png' })
  })
})
