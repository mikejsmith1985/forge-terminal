/**
 * Playwright Test: Terminology Audit (quick instruction → persistent instruction)
 *
 * This test verifies that all "quick instruction" references have been replaced
 * with "persistent instruction" across the UI and functionality.
 *
 * Following constitution Article X: Verification & Proof
 */

const { test, expect, exec } = require('../fixtures/forge')

test.describe('Terminology Audit Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:9999')
    await page.waitForTimeout(2000) // Allow app to initialize
  })

  test('should verify API endpoint changed to /api/persistent-instruction', async ({ page }) => {
    // Test the new endpoint exists
    const response = await page.request.get('http://localhost:9999/api/persistent-instruction')
    expect(response.status()).toBe(200)
    console.log('✓ New API endpoint /api/persistent-instruction works')
  })

  test('should verify old API endpoint no longer exists', async ({ page }) => {
    // Test the old endpoint is gone
    const response = await page.request.get('http://localhost:9999/api/quick-instruction', {
      failOnStatusCode: false
    })
    expect(response.status()).toBe(404)
    console.log('✓ Old API endpoint /api/quick-instruction removed')
  })

  test('should verify CSS classes use "persistent-instruction"', async ({ page }) => {
    // Open Forge Assist to render the UI
    await page.keyboard.press('Control+/')
    await page.waitForTimeout(500)

    // Verify new CSS classes exist in the DOM or stylesheet
    const { foundPersistent, foundQuick } = await page.evaluate(() => {
      const stylesheets = Array.from(window.document.styleSheets)
      let foundPersistent = false
      let foundQuick = false

      stylesheets.forEach(sheet => {
        try {
          const rules = Array.from(sheet.cssRules || [])
          rules.forEach(rule => {
            if (rule.selectorText) {
              if (rule.selectorText.includes('persistent-instruction')) {
                foundPersistent = true
              }
              if (rule.selectorText.includes('quick-instruction')) {
                foundQuick = true
              }
            }
          })
        } catch (e) {
          // CORS errors expected for external stylesheets
        }
      })

      return { foundPersistent, foundQuick }
    })

    expect(foundPersistent).toBe(true)
    expect(foundQuick).toBe(false)
    console.log('✓ CSS classes use "persistent-instruction", not "quick-instruction"')
  })

  test('should verify tour step uses "persistent-instruction" terminology', async ({ page }) => {
    // Tour steps are defined in frontend/src/config/tourSteps.js
    const { stdout: content } = await exec('type frontend\\src\\config\\tourSteps.js')

    expect(content).toContain('persistent-instruction-intro')
    expect(content).toContain('.persistent-instruction-collapsed')
    expect(content).toContain('Persistent Instructions')
    expect(content).not.toContain('quick-instruction-intro')
    expect(content).not.toContain('.quick-instruction-collapsed')
    console.log('✓ Tour steps use "persistent instruction" terminology')
  })

  test('should capture visual proof of terminology changes', async ({ page }) => {
    // Open Forge Assist
    await page.keyboard.press('Control+/')
    await page.waitForTimeout(1000)
    await expect(page.locator('.forge-assist-modal')).toBeVisible()

    // Take screenshot showing the UI with updated terminology
    await page.screenshot({ path: 'screenshots/terminology-audit-forge-assist-ui.png' })

    // Look for any persistent instruction UI elements
    const hasPersistentBtn = await page.locator('[data-testid="persistent-instructions-btn"]').count() > 0

    if (hasPersistentBtn) {
      await expect(page.locator('[data-testid="persistent-instructions-btn"]')).toBeAttached()
      await page.locator('[data-testid="persistent-instructions-btn"]').screenshot({
        path: 'screenshots/terminology-audit-persistent-btn.png'
      })
      console.log('✓ Found persistent-instructions-btn (correct naming)')
    }

    // Verify NO quick instruction buttons exist
    const hasQuickBtn = await page.locator('[data-testid="quick-instructions-btn"]').count() > 0
    expect(hasQuickBtn).toBe(false)
    console.log('✓ No quick-instructions-btn found (correctly removed)')
  })

  test('should verify backend handler file was renamed', async ({ page }) => {
    // Verify the new handler file exists
    const { stdout: content } = await exec('type cmd\\forge\\handlers_persistent_instruction.go')

    expect(content).toContain('PersistentInstructionConfig')
    expect(content).toContain('handleGetPersistentInstruction')
    expect(content).toContain('persistent-instruction.json')
    expect(content).not.toContain('QuickInstructionConfig')
    console.log('✓ Backend handler uses "persistent instruction" terminology')
  })

  test('should verify main.go uses new API route', async ({ page }) => {
    const { stdout: content } = await exec('type cmd\\forge\\main.go')

    expect(content).toContain('/api/persistent-instruction')
    expect(content).toContain('handleGetPersistentInstruction')
    expect(content).not.toContain('/api/quick-instruction')
    console.log('✓ main.go uses /api/persistent-instruction route')
  })

  test('should verify App.jsx uses new variable names', async ({ page }) => {
    const { stdout: content } = await exec('type frontend\\src\\App.jsx')

    expect(content).toContain('showPersistentInstruction')
    expect(content).toContain('setShowPersistentInstruction')
    expect(content).toContain('[PersistentInstruction]')
    expect(content).not.toContain('showQuickInstruction')
    expect(content).not.toContain('[QuickInstruction]')
    console.log('✓ App.jsx uses "persistent instruction" terminology')
  })
})
