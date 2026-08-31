/**
 * Playwright E2E Tests: Tab Theme Controls
 *
 * Tests the ability to control color themes and modes per tab:
 * 1. Right-click context menu theme selection
 * 2. Settings > Tab Controls with per-tab defaults
 * 3. Separate terminal/ribbon theme controls
 * 4. Visual diagram display
 */

const { test, expect, exec, visitWithoutTour } = require('../fixtures/forge')

test.describe('Tab Theme Controls', () => {
  test.beforeEach(async ({ page }) => {
    // Start Forge in a clean state
    await exec('go run cmd/forge/main.go').catch(() => {})
    await page.waitForTimeout(3000)
    await visitWithoutTour(page, 'http://localhost:8333')
    await page.waitForTimeout(2000)
  })

  test.afterEach(async () => {
    // Clean up
    await exec('taskkill /F /IM forge.exe').catch(() => {})
  })

  test.describe('Right-Click Context Menu Theme Selection', () => {
    test('should show theme submenu when right-clicking a tab', async ({ page }) => {
      // Right-click on the first tab
      await page.locator('.tab').first().click({ button: 'right' })

      // Context menu should appear
      await expect(page.locator('.tab-context-menu')).toBeVisible()

      // Should have a "Theme" option
      await expect(page.locator('.tab-context-menu').getByText('Theme')).toBeAttached()
    })

    test('should show all 10 themes in submenu', async ({ page }) => {
      await page.locator('.tab').first().click({ button: 'right' })
      await page.locator('.tab-context-menu').getByText('Theme').click()

      // Should show submenu with all themes
      const themes = [
        'Molten Metal', 'Deep Ocean', 'Forest', 'Midnight', 'Rose', 'Arctic',
        'High Contrast Dark', 'High Contrast Light', 'High Contrast Blue', 'High Contrast Yellow',
      ]

      for (const theme of themes) {
        await expect(page.locator('.theme-submenu').getByText(theme)).toBeAttached()
      }
    })

    test('should allow selecting theme + mode for a tab', async ({ page }) => {
      await page.locator('.tab').first().click({ button: 'right' })
      await page.locator('.tab-context-menu').getByText('Theme').click()
      await page.locator('.theme-submenu').getByText('Deep Ocean').click()

      // Should show mode selector (Dark/Light)
      await expect(page.locator('.mode-selector')).toBeVisible()
      await page.locator('.mode-selector').getByText('Dark').click()

      // Tab should update with new theme
      await expect(page.locator('.tab').first()).toHaveAttribute('data-theme', 'ocean')
      await expect(page.locator('.tab').first()).toHaveAttribute('data-mode', 'dark')
    })

    test('should persist theme selection across page reload', async ({ page }) => {
      // Set a theme
      await page.locator('.tab').first().click({ button: 'right' })
      await page.locator('.tab-context-menu').getByText('Theme').click()
      await page.locator('.theme-submenu').getByText('Rose').click()
      await page.locator('.mode-selector').getByText('Light').click()

      // Reload page
      await page.reload()
      await page.waitForTimeout(2000)

      // Theme should persist
      await expect(page.locator('.tab').first()).toHaveAttribute('data-theme', 'rose')
      await expect(page.locator('.tab').first()).toHaveAttribute('data-mode', 'light')
    })
  })

  test.describe('Settings Tab Controls', () => {
    test.beforeEach(async ({ page }) => {
      // Open Settings modal
      await page.locator('[aria-label="Settings"]').click()
      await expect(page.locator('.settings-modal')).toBeVisible()
    })

    test('should have a "Tab Controls" tab in Settings', async ({ page }) => {
      await expect(page.locator('.settings-tabs').getByText('Tab Controls')).toBeAttached()
    })

    test('should show global preset options', async ({ page }) => {
      await page.locator('.settings-tabs').getByText('Tab Controls').click()

      // Should show preset options
      await expect(page.getByText('Global Presets')).toBeAttached()
      await expect(page.getByText('Auto-cycle (alternating dark/light)')).toBeAttached()
      await expect(page.getByText('Dark mode only')).toBeAttached()
      await expect(page.getByText('Light mode only')).toBeAttached()
    })

    test('should show per-tab explicit defaults (1-20)', async ({ page }) => {
      await page.locator('.settings-tabs').getByText('Tab Controls').click()

      // Should show 20 tab slots
      await expect(page.locator('.tab-default-row')).toHaveCount(20)

      // Each should have theme and mode selectors
      await expect(page.locator('.tab-default-row').first().locator('select[name="theme"]')).toBeAttached()
      await expect(page.locator('.tab-default-row').first().locator('select[name="mode"]')).toBeAttached()
    })

    test('should allow setting different theme for terminal vs ribbon', async ({ page }) => {
      await page.locator('.settings-tabs').getByText('Tab Controls').click()

      // Should have separate controls for terminal and ribbon
      await expect(page.getByText('Terminal Theme')).toBeAttached()
      await expect(page.getByText('Control Ribbon Theme')).toBeAttached()

      // Should be able to set different themes
      await page.locator('select[name="terminalTheme"]').selectOption('molten')
      await page.locator('select[name="terminalMode"]').selectOption('dark')
      await page.locator('select[name="ribbonTheme"]').selectOption('ocean')
      await page.locator('select[name="ribbonMode"]').selectOption('light')

      // Save and verify
      await page.getByText('Save').click()
      await page.reload()
      await page.waitForTimeout(2000)

      // Re-open settings and verify persistence
      await page.locator('[aria-label="Settings"]').click()
      await page.locator('.settings-tabs').getByText('Tab Controls').click()
      await expect(page.locator('select[name="terminalTheme"]')).toHaveValue('molten')
      await expect(page.locator('select[name="ribbonTheme"]')).toHaveValue('ocean')
    })

    test('should display visual diagram explaining auto-cycle behavior', async ({ page }) => {
      await page.locator('.settings-tabs').getByText('Tab Controls').click()

      // Should show a visual diagram
      await expect(page.locator('.theme-diagram')).toBeAttached()
      await expect(page.locator('.theme-diagram')).toBeVisible()

      // Should show the alternating pattern
      await expect(page.locator('.theme-diagram').getByText('Tab 1')).toBeAttached()
      await expect(page.locator('.theme-diagram').getByText('Dark')).toBeAttached()
      await expect(page.locator('.theme-diagram').getByText('Tab 2')).toBeAttached()
      await expect(page.locator('.theme-diagram').getByText('Light')).toBeAttached()
    })

    test('should apply per-tab defaults when creating new tabs', async ({ page }) => {
      await page.locator('.settings-tabs').getByText('Tab Controls').click()

      // Set Tab 2 to use Rose theme in light mode
      await page.locator('.tab-default-row').nth(1).locator('select[name="theme"]').selectOption('rose')
      await page.locator('.tab-default-row').nth(1).locator('select[name="mode"]').selectOption('light')
      await page.getByText('Save').click()

      // Close settings
      await page.locator('.settings-modal').locator('[aria-label="Close"]').click()

      // Create a new tab (should be Tab 2)
      await page.locator('.new-tab-btn').click()

      // Verify Tab 2 has Rose theme in light mode
      await expect(page.locator('.tab').nth(1)).toHaveAttribute('data-theme', 'rose')
      await expect(page.locator('.tab').nth(1)).toHaveAttribute('data-mode', 'light')
    })
  })

  test.describe('Terminal vs Ribbon Theme Split', () => {
    test('should allow terminal dark mode with ribbon light mode', async ({ page }) => {
      // Open settings
      await page.locator('[aria-label="Settings"]').click()
      await page.locator('.settings-tabs').getByText('Tab Controls').click()

      // Set terminal to dark, ribbon to light
      await page.locator('input[name="splitThemes"]').check()
      await page.locator('select[name="terminalMode"]').selectOption('dark')
      await page.locator('select[name="ribbonMode"]').selectOption('light')
      await page.getByText('Save').click()

      // Verify terminal is dark
      await expect(page.locator('.forge-terminal')).toHaveAttribute('data-mode', 'dark')

      // Verify ribbon is light
      await expect(page.locator('.app-sidebar')).toHaveAttribute('data-mode', 'light')
    })

    test('should use global setting when split is disabled', async ({ page }) => {
      await page.locator('[aria-label="Settings"]').click()
      await page.locator('.settings-tabs').getByText('Tab Controls').click()

      // Ensure split is disabled
      await page.locator('input[name="splitThemes"]').uncheck()

      // Terminal and ribbon should use same theme/mode
      const terminalMode = await page.locator('.forge-terminal').getAttribute('data-mode')
      await expect(page.locator('.app-sidebar')).toHaveAttribute('data-mode', terminalMode)
    })
  })

  test.describe('Theme Persistence', () => {
    test('should save theme settings to localStorage', async ({ page }) => {
      await page.locator('.tab').first().click({ button: 'right' })
      await page.locator('.tab-context-menu').getByText('Theme').click()
      await page.locator('.theme-submenu').getByText('Forest').click()
      await page.locator('.mode-selector').getByText('Dark').click()

      // Verify localStorage
      const sessions = await page.evaluate(() => {
        return JSON.parse(window.localStorage.getItem('sessions') || '{}')
      })
      expect(sessions.tabs[0].colorTheme).toBe('forest')
      expect(sessions.tabs[0].mode).toBe('dark')
    })

    test('should restore all 20 tab defaults from backend on reload', async ({ page }) => {
      // Set defaults for tabs 1-5
      await page.locator('[aria-label="Settings"]').click()
      await page.locator('.settings-tabs').getByText('Tab Controls').click()

      for (let i = 0; i < 5; i++) {
        await page.locator('.tab-default-row').nth(i).locator('select[name="theme"]').selectOption('midnight')
        await page.locator('.tab-default-row').nth(i).locator('select[name="mode"]').selectOption('light')
      }

      await page.getByText('Save').click()
      await page.reload()
      await page.waitForTimeout(2000)

      // Re-open and verify
      await page.locator('[aria-label="Settings"]').click()
      await page.locator('.settings-tabs').getByText('Tab Controls').click()

      for (let i = 0; i < 5; i++) {
        await expect(page.locator('.tab-default-row').nth(i).locator('select[name="theme"]')).toHaveValue('midnight')
        await expect(page.locator('.tab-default-row').nth(i).locator('select[name="mode"]')).toHaveValue('light')
      }
    })
  })
})
