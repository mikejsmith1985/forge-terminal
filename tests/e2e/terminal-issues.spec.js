// Playwright test to reproduce terminal issues
const { test, expect, visitWithoutTour } = require('../fixtures/forge')

test.describe('Terminal Issues - v3.17.5', () => {
  test.beforeEach(async ({ page }) => {
    await visitWithoutTour(page, 'http://localhost:9999')
    await page.waitForTimeout(2000)
  })

  test('Test 1: Terminal text cut-off when switching tabs', async ({ page }) => {
    console.log('Creating 3 terminal tabs')

    // Wait for initial terminal
    await expect(page.locator('.terminal')).toBeVisible({ timeout: 10000 })

    // Create tab 2
    await page.locator('button[title="New Terminal Tab"]').click()
    await page.waitForTimeout(1000)

    // Create tab 3
    await page.locator('button[title="New Terminal Tab"]').click()
    await page.waitForTimeout(1000)

    // Get tab buttons — assert at least 3 exist
    const tabCount = await page.locator('.tab-button').count()
    expect(tabCount).toBeGreaterThanOrEqual(3)

    // Switch to tab 2
    await page.locator('.tab-button').nth(1).click()
    await page.waitForTimeout(500)

    // Switch back to tab 1
    await page.locator('.tab-button').nth(0).click()
    await page.waitForTimeout(500)

    // Check terminal dimensions — terminal should start at left edge of container
    const rect = await page.locator('.terminal').evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { width: r.width, left: r.left }
    })
    console.log(`Terminal width: ${rect.width}, left: ${rect.left}`)
    expect(rect.left, 'Terminal should not be shifted left').toBeLessThan(20)

    // Take screenshot
    await page.screenshot({ path: 'screenshots/tab-switch-cutoff.png' })
  })

  test('Test 2: Ctrl+V paste functionality', async ({ page }) => {
    console.log('Testing Ctrl+V paste')

    // Wait for terminal
    await expect(page.locator('.terminal')).toBeVisible({ timeout: 10000 })

    // Focus terminal textarea
    await page.locator('.xterm-helper-textarea').first().focus()
    await page.waitForTimeout(500)

    // Set clipboard data and simulate a paste event on the focused textarea
    const testText = 'echo "test paste"'
    await page.evaluate((text) => {
      const textarea = document.querySelector('.xterm-helper-textarea')
      if (!textarea) return
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      })
      pasteEvent.clipboardData.setData('text/plain', text)
      textarea.dispatchEvent(pasteEvent)
    }, testText)

    await page.waitForTimeout(1000)

    // Check browser console for paste-related logs
    console.log('Check browser console for paste-related logs')

    // Take screenshot
    await page.screenshot({ path: 'screenshots/ctrl-v-paste.png' })
  })

  test('Test 3: Measure terminal dimensions after tab switch', async ({ page }) => {
    console.log('Measuring terminal dimensions')

    // Create multiple tabs
    await expect(page.locator('.terminal')).toBeVisible({ timeout: 10000 })
    await page.locator('button[title="New Terminal Tab"]').click()
    await page.waitForTimeout(1000)
    await page.locator('button[title="New Terminal Tab"]').click()
    await page.waitForTimeout(1000)

    // Measure tab 1 initially
    await page.locator('.tab-button').nth(0).click()
    await page.waitForTimeout(500)

    const initialRect = await page.locator('.terminal').first().evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { width: r.width, left: r.left }
    })
    console.log(`Initial - Width: ${initialRect.width}, Left: ${initialRect.left}`)

    // Switch to tab 2
    await page.locator('.tab-button').nth(1).click()
    await page.waitForTimeout(500)

    // Switch back to tab 1
    await page.locator('.tab-button').nth(0).click()
    await page.waitForTimeout(500)

    // Measure again — dimensions should be consistent
    const afterRect = await page.locator('.terminal').first().evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { width: r.width, left: r.left }
    })
    console.log(`After switch - Width: ${afterRect.width}, Left: ${afterRect.left}`)

    expect(Math.abs(afterRect.width - initialRect.width), 'Width should be consistent').toBeLessThan(5)
    expect(Math.abs(afterRect.left - initialRect.left), 'Left position should be consistent').toBeLessThan(5)

    // Take screenshot
    await page.screenshot({ path: 'screenshots/terminal-dimensions.png' })
  })
})
