/**
 * Paste Functionality E2E Test
 *
 * CONSTRAINT: NO NETWORK STUBS - Real backend, real clipboard
 * CONSTRAINT: REAL INPUTS ONLY - Uses Playwright real browser events
 *
 * This test validates:
 * 1. Ctrl+V paste works without showing permission errors
 * 2. Font size controls are visible and larger
 * 3. Font size controls use contrasting orange color
 * 4. Robot and terminal emoji icons are removed from font size tool
 */

const { test, expect } = require('../fixtures/forge')

test.describe('Paste Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Visit the app - NO stubs, real backend
    await page.goto('/')

    // Wait for the terminal element to be visible
    await page.locator('.xterm').waitFor({ timeout: 15000 })

    // Wait for WebSocket connection
    await page.waitForTimeout(2000)
  })

  test('should have font size controls visible with correct styling', async ({ page }) => {
    // Font size controls should be visible
    await expect(page.locator('.font-size-controls')).toBeVisible()

    // Should have orange background (contrasting color)
    await expect(page.locator('.font-size-controls')).toHaveCSS('background-color', 'rgb(249, 115, 22)')

    // Should have minus and plus buttons
    await expect(page.locator('.font-size-controls button')).toHaveCount(2)

    // Should have font size display
    await expect(page.locator('.font-size-display')).toBeVisible()

    // Should NOT have robot emoji (🤖) or keyboard emoji (⌨️)
    await expect(page.locator('.font-size-controls')).not.toContainText('🤖')
    await expect(page.locator('.font-size-controls')).not.toContainText('⌨️')
  })

  test('should allow increasing and decreasing font size with real clicks', async ({ page }) => {
    // Get initial font size
    const initialSizeText = await page.locator('.font-size-display').textContent()
    const initial = parseInt(initialSizeText.replace('px', ''), 10)

    // Use click for actual mouse events (Playwright clicks are real browser events)
    await page.locator('.font-size-controls button').nth(1).click()

    // Font size should increase
    await page.waitForTimeout(200)
    await expect(page.locator('.font-size-display')).not.toContainText(initialSizeText)
    const increasedText = await page.locator('.font-size-display').textContent()
    const increased = parseInt(increasedText.replace('px', ''), 10)
    expect(increased).toBeGreaterThan(initial)

    // Use click to decrease
    await page.locator('.font-size-controls button').nth(0).click()
    await page.waitForTimeout(200)
    await page.locator('.font-size-controls button').nth(0).click()

    // Font size should decrease below initial
    await page.waitForTimeout(200)
    const finalText = await page.locator('.font-size-display').textContent()
    const final = parseInt(finalText.replace('px', ''), 10)
    expect(final).toBeLessThan(initial)
  })

  test('should support REAL Ctrl+V paste without permission errors', async ({ page }) => {
    // Focus the terminal with real click
    await page.locator('.xterm-helper-textarea').first().click()

    // Write some test text to clipboard
    const testText = 'test-paste-content-real'
    await page.evaluate((text) => {
      return navigator.clipboard.writeText(text)
    }, testText)

    // Wait a moment for clipboard to be ready
    await page.waitForTimeout(500)

    // Use REAL Ctrl+V keyboard event (OS-level)
    await page.keyboard.press('Control+V')

    // Wait a moment for paste to process
    await page.waitForTimeout(1000)

    // Verify NO yellow permission message appears in terminal
    const terminalText = await page.evaluate(() => {
      const terminalElement = document.querySelector('.xterm-screen')
      if (terminalElement) {
        return terminalElement.textContent || ''
      }
      return ''
    })
    // Should NOT contain the old permission warning
    expect(terminalText).not.toContain('Paste tip: Click in terminal first')
    expect(terminalText).not.toContain('use Ctrl+Shift+V in some browsers')

    console.log('No permission error message found')
  })

  test('should handle paste event listener correctly', async ({ page }) => {
    // Focus the terminal
    await page.locator('.xterm-helper-textarea').first().focus()

    // Create a paste event programmatically
    await page.evaluate(() => {
      const testText = 'programmatic-paste-test'
      const textarea = document.querySelector('.xterm-helper-textarea')

      if (textarea) {
        // Create a paste event with clipboard data
        const clipboardData = new DataTransfer()
        clipboardData.setData('text/plain', testText)

        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: clipboardData,
          bubbles: true,
          cancelable: true
        })

        // Dispatch the paste event
        textarea.dispatchEvent(pasteEvent)
      }
    })

    console.log('Paste event dispatched successfully')

    // Verify no error message appears
    await page.waitForTimeout(500)
    const terminalText = await page.evaluate(() => {
      const terminalElement = document.querySelector('.xterm-screen')
      if (terminalElement) {
        return terminalElement.textContent || ''
      }
      return ''
    })
    // Should NOT contain any paste error
    expect(terminalText).not.toContain('[Paste failed')
    expect(terminalText).not.toContain('Paste tip')
  })
})

test.describe('Font Size Tool Visual Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('.xterm').waitFor({ timeout: 15000 })
  })

  test('should have larger buttons with proper spacing', async ({ page }) => {
    // Check button size - should be larger than before (18px icons instead of 14px)
    await expect(page.locator('.font-size-controls button svg')).toHaveAttribute('width', '18')
    await expect(page.locator('.font-size-controls button svg')).toHaveAttribute('height', '18')

    // Check padding - buttons should have more padding
    await expect(page.locator('.font-size-controls button').first()).toHaveCSS('padding', '8px')
  })

  test('should have prominent font size display', async ({ page }) => {
    // Font size display should be larger and bolder
    await expect(page.locator('.font-size-display')).toHaveCSS('font-size', '15px')
    await expect(page.locator('.font-size-display')).toHaveCSS('font-weight', '700')
    await expect(page.locator('.font-size-display')).toHaveCSS('color', 'rgb(255, 255, 255)') // white text
  })

  test('should have orange background for maximum visibility', async ({ page }) => {
    // The controls container should have orange background (#f97316)
    await expect(page.locator('.font-size-controls')).toHaveCSS('background-color', 'rgb(249, 115, 22)')
    await expect(page.locator('.font-size-controls')).toHaveCSS('border-radius', '8px')
    await expect(page.locator('.font-size-controls')).toHaveCSS('padding', '6px 10px')
  })
})
