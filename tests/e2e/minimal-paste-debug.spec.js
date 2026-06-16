/**
 * Minimal Paste Debug Test (Playwright)
 * Tests if paste works via multiple approaches
 */

const { test, expect, visitWithoutTour, waitForTerminal } = require('../fixtures/forge')

test.describe('Minimal Paste Debug', () => {
  test('should paste text via xterm.paste() directly', async ({ page }) => {
    await visitWithoutTour(page, '/')
    await waitForTerminal(page, 30000)
    await page.waitForTimeout(2000)

    const testText = `direct-paste-${Date.now()}`

    // Use xterm's built-in paste method via window.term
    await page.evaluate((text) => {
      expect(window.term, 'window.term should exist').toBeTruthy()
      expect(typeof window.term.paste, 'term.paste should be a function').toBe('function')

      console.log('[Test] Calling win.term.paste() with:', text)
      window.term.paste(text)
    }, testText)

    await page.waitForTimeout(1000)

    // Verify paste worked
    const fullText = await page.evaluate(() => {
      const buffer = window.term.buffer.active
      let output = ''
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) output += line.translateToString(true) + '\n'
      }
      return output
    })

    console.log('[Test] Terminal buffer:', fullText)
    expect(fullText).toContain(testText)

    await page.screenshot({ path: 'screenshots/direct-paste-test.png' })
  })

  test('should paste text via synthetic paste event on document', async ({ page }) => {
    await visitWithoutTour(page, '/')
    await waitForTerminal(page, 30000)
    await page.waitForTimeout(2000)

    const testText = `paste-event-${Date.now()}`

    // Focus terminal
    await page.locator('.xterm-helper-textarea').first().focus()
    await page.waitForTimeout(500)

    // Dispatch paste event to document (our fallback listener)
    await page.evaluate((text) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', text)

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      })

      console.log('[Test] Dispatching paste event to document')
      document.dispatchEvent(pasteEvent)
    }, testText)

    await page.waitForTimeout(2000)

    // Verify paste worked
    const fullText = await page.evaluate(() => {
      const buffer = window.term.buffer.active
      let output = ''
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) output += line.translateToString(true) + '\n'
      }
      return output
    })

    console.log('[Test] Terminal buffer:', fullText)
    expect(fullText).toContain(testText)

    await page.screenshot({ path: 'screenshots/paste-event-test.png' })
  })

  test('should paste text via Ctrl+V with realPress', async ({ page }) => {
    await visitWithoutTour(page, '/')
    await waitForTerminal(page, 30000)
    await page.waitForTimeout(2000)

    const testText = `ctrlv-test-${Date.now()}`

    // Focus terminal
    await page.locator('.xterm-helper-textarea').first().focus()
    await page.waitForTimeout(500)

    // Write to clipboard using Clipboard API
    await page.evaluate(async (text) => {
      try {
        await navigator.clipboard.writeText(text)
        console.log('[Test] Wrote to clipboard via API:', text)
      } catch (e) {
        // Fallback: use execCommand
        const input = document.createElement('textarea')
        input.value = text
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
        console.log('[Test] Wrote to clipboard via execCommand:', text)
      }
    }, testText)

    await page.waitForTimeout(500)

    // Focus terminal again
    await page.locator('.xterm-helper-textarea').first().focus()
    await page.waitForTimeout(500)

    // Use page.keyboard.press for Ctrl+V — Playwright keyboard events are real browser events
    await page.keyboard.press('Control+V')

    await page.waitForTimeout(2000)

    // Verify paste worked
    const fullText = await page.evaluate(() => {
      const buffer = window.term.buffer.active
      let output = ''
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) output += line.translateToString(true) + '\n'
      }
      return output
    })

    console.log('[Test] Terminal buffer after Ctrl+V:', fullText)
    expect(fullText).toContain(testText)

    await page.screenshot({ path: 'screenshots/ctrlv-realpress-test.png' })
  })
})
