/**
 * E2E Test: Forge Assist Button Layout at Multiple Viewports
 *
 * Tests button overlap at various screen sizes to reproduce user's issue
 */

const { test, expect, visitWithoutTour } = require('../fixtures/forge')

const viewports = [
  { width: 1920, height: 1080, name: 'Desktop HD' },
  { width: 1280, height: 720, name: 'Default' },
  { width: 1024, height: 768, name: 'Tablet' },
  { width: 800, height: 600, name: 'Small' },
]

viewports.forEach(viewport => {
  test.describe(`at ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport before visiting
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await visitWithoutTour(page, 'http://localhost:3005')
      await expect(page.locator('.terminal-container')).toBeVisible()

      // Dismiss tour if present (auto-fixture sets tour_disabled, but guard against
      // any tour tooltip that may appear before localStorage takes effect)
      const tourTooltipCount = await page.locator('.tour-tooltip').count()
      if (tourTooltipCount > 0) {
        await page.locator('.tour-tooltip button').filter({ hasText: 'Skip' }).click()
      }
    })

    test('buttons should not overlap', async ({ page }) => {
      // Open Forge Assist
      await page.keyboard.press('Control+/')

      // Wait for modal
      await page.locator('.forge-assist-modal').waitFor({ timeout: 5000 })
      await expect(page.locator('.forge-assist-modal')).toBeVisible()

      // Collect bounding rects for all buttons in the header in a single evaluate call
      const buttonRects = await page.locator('.forge-assist-header button').evaluateAll(buttons =>
        buttons.map((btn, index) => {
          const rect = btn.getBoundingClientRect()
          return {
            index,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            text: btn.textContent.trim(),
          }
        })
      )

      // Check for overlaps between each consecutive pair of buttons
      for (let i = 0; i < buttonRects.length - 1; i++) {
        const current = buttonRects[i]
        const next = buttonRects[i + 1]

        console.log(`Button ${i}: ${current.text} (${current.left}-${current.right})`)
        console.log(`Button ${i + 1}: ${next.text} (${next.left}-${next.right})`)

        // Assert no overlap: current.right should be <= next.left
        expect(
          current.right,
          `${current.text} should not overlap ${next.text}`
        ).toBeLessThanOrEqual(next.left)
      }

      // Take screenshot
      await page.screenshot({ path: `screenshots/buttons-${viewport.name}-${viewport.width}x${viewport.height}.png` })
    })

    test('modal should fit in viewport', async ({ page }) => {
      // Open Forge Assist
      await page.keyboard.press('Control+/')

      // Wait for modal
      await page.locator('.forge-assist-modal').waitFor({ timeout: 5000 })
      await expect(page.locator('.forge-assist-modal')).toBeVisible()

      // Read the modal's bounding rect
      const rect = await page.locator('.forge-assist-modal').evaluate(modal => {
        const r = modal.getBoundingClientRect()
        return { right: r.right, bottom: r.bottom, width: r.width, height: r.height }
      })

      expect(rect.right).toBeLessThanOrEqual(viewport.width)
      expect(rect.bottom).toBeLessThanOrEqual(viewport.height)

      console.log(`Modal size: ${rect.width}x${rect.height}`)
      console.log(`Viewport: ${viewport.width}x${viewport.height}`)
    })
  })
})
