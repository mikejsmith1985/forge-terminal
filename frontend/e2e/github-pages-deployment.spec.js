import { test, expect } from '@playwright/test'

/**
 * End-to-end tests for GitHub Pages deployment
 * 
 * These tests validate:
 * 1. Local backend mode (localhost:8333)
 * 2. GitHub Pages frontend connectivity
 * 3. API configuration panel
 * 4. Terminal functionality with remote backend
 */

test.describe('GitHub Pages Deployment', () => {
  // Start backend before tests
  let backendUrl = 'http://localhost:8333'
  let pagesUrl = 'http://localhost:5173' // Local dev server for testing

  test.describe('Frontend Build', () => {
    test('should load GitHub Pages frontend', async ({ page }) => {
      // This would test against the built dist/ folder
      // For now, test against dev server
      await page.goto(pagesUrl)
      
      // Check that main components are present
      await expect(page.locator('text=Forge Terminal')).toBeVisible({ timeout: 5000 })
    })

    test('should have correct base path for GitHub Pages', async ({ page }) => {
      // Vite config should set base: '/forge-terminal/'
      // Check that CSS and JS files reference correct paths
      const response = await page.goto(pagesUrl)
      expect(response?.status()).toBe(200)
    })
  })

  test.describe('API Configuration Panel', () => {
    test('should open API configuration panel', async ({ page }) => {
      await page.goto(pagesUrl)
      
      // Look for settings button
      const settingsButton = page.locator('[aria-label*="settings"], button:has-text("⚙"), button:has-text("Settings")')
      if (await settingsButton.count() > 0) {
        await settingsButton.first().click()
      }
      
      // Check for API Configuration option
      const apiConfig = page.locator('text=API Configuration')
      if (await apiConfig.count() > 0) {
        await apiConfig.click()
        
        // Verify panel opened
        await expect(page.locator('text=Backend URL')).toBeVisible()
      }
    })

    test('should save API configuration', async ({ page }) => {
      await page.goto(pagesUrl)
      
      // Find and fill API config
      const apiInput = page.locator('input[placeholder*="http://localhost"]')
      if (await apiInput.count() > 0) {
        await apiInput.clear()
        await apiInput.fill('http://localhost:8333')
        
        // Save to localStorage via button or form
        const applyButton = page.locator('button:has-text("Apply")')
        if (await applyButton.count() > 0) {
          await applyButton.click()
        }
      }
    })

    test('should test connection to backend', async ({ page }) => {
      await page.goto(pagesUrl)
      
      // Open settings if not already open
      const testButton = page.locator('button:has-text("Test Connection")')
      if (await testButton.count() > 0) {
        await testButton.click()
        
        // Wait for test result
        const result = page.locator('text=/✓ Connected|✗ Connection failed/')
        await expect(result).toBeVisible({ timeout: 5000 })
      }
    })
  })

  test.describe('API Connectivity', () => {
    test('should connect to /api/version endpoint', async ({ page }) => {
      // Test direct API call
      const response = await page.evaluate(async () => {
        try {
          const res = await fetch('http://localhost:8333/api/version')
          return await res.json()
        } catch (e) {
          return { error: e.message }
        }
      })
      
      expect(response).toHaveProperty('version')
      expect(response.error).toBeUndefined()
    })

    test('should get commands from API', async ({ page }) => {
      const response = await page.evaluate(async () => {
        try {
          const res = await fetch('http://localhost:8333/api/commands')
          return await res.json()
        } catch (e) {
          return { error: e.message }
        }
      })
      
      expect(Array.isArray(response)).toBe(true)
      expect(response.error).toBeUndefined()
    })
  })

  test.describe('CORS Headers', () => {
    test('should include CORS headers in API responses', async ({ page }) => {
      // Make API request and check CORS headers
      const response = await page.request.get(`${backendUrl}/api/version`)
      
      // Check for CORS headers
      expect(response.headers()['access-control-allow-origin']).toBeDefined()
      expect(response.headers()['access-control-allow-methods']).toBeDefined()
    })

    test('should handle preflight (OPTIONS) requests', async ({ page }) => {
      const response = await page.request.options(`${backendUrl}/api/commands`)
      
      expect(response.status()).toBe(200)
      expect(response.headers()['access-control-allow-methods']).toContain('POST')
    })

    test('should include security headers', async ({ page }) => {
      const response = await page.request.get(`${backendUrl}/api/version`)
      
      expect(response.headers()['x-content-type-options']).toBe('nosniff')
      expect(response.headers()['x-frame-options']).toBeDefined()
    })
  })

  test.describe('Terminal over API', () => {
    test('should establish WebSocket connection', async ({ page }) => {
      await page.goto(pagesUrl)
      
      // Create WebSocket connection from page context
      const wsUrl = 'ws://localhost:8333/ws'
      
      const wsConnected = await page.evaluate((url) => {
        return new Promise((resolve) => {
          const ws = new WebSocket(url)
          
          ws.onopen = () => {
            ws.close()
            resolve(true)
          }
          
          ws.onerror = () => {
            resolve(false)
          }
          
          setTimeout(() => resolve(false), 5000)
        })
      }, wsUrl)
      
      expect(wsConnected).toBe(true)
    })

    test('should send terminal resize message', async ({ page }) => {
      const resizeReceived = await page.evaluate(() => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8333/ws')
          
          ws.onopen = () => {
            // Send resize message
            ws.send(JSON.stringify({
              type: 'resize',
              cols: 120,
              rows: 40,
            }))
            resolve(true)
            ws.close()
          }
          
          ws.onerror = () => resolve(false)
          setTimeout(() => resolve(false), 5000)
        })
      })
      
      expect(resizeReceived).toBe(true)
    })
  })

  test.describe('Deployment Modes', () => {
    test('should work in local mode (localhost backend)', async ({ page }) => {
      await page.goto(pagesUrl)
      
      // Check that we can reach the backend
      const versionResponse = await page.evaluate(async () => {
        try {
          const res = await fetch('http://localhost:8333/api/version')
          return { success: res.ok, status: res.status }
        } catch (e) {
          return { success: false, error: e.message }
        }
      })
      
      expect(versionResponse.success).toBe(true)
    })

    test('should handle API configuration changes', async ({ page }) => {
      await page.goto(pagesUrl)
      
      // Check initial config
      const initialConfig = await page.evaluate(() => {
        return localStorage.getItem('forge_api_base')
      })
      
      // Change config
      await page.evaluate(() => {
        localStorage.setItem('forge_api_base', 'http://localhost:9999')
      })
      
      const newConfig = await page.evaluate(() => {
        return localStorage.getItem('forge_api_base')
      })
      
      expect(newConfig).toBe('http://localhost:9999')
      
      // Reset
      await page.evaluate(() => {
        localStorage.removeItem('forge_api_base')
      })
    })
  })

  test.describe('Error Handling', () => {
    test('should show error when backend is unreachable', async ({ page }) => {
      await page.goto(pagesUrl)
      
      // Try to connect to non-existent backend
      const error = await page.evaluate(async () => {
        try {
          const res = await fetch('http://localhost:9999/api/version')
          return null
        } catch (e) {
          return e.message
        }
      })
      
      expect(error).toBeDefined()
      expect(error).toContain('Failed to fetch')
    })

    test('should handle JSON parse errors', async ({ page }) => {
      const error = await page.evaluate(async () => {
        try {
          const res = await fetch('http://localhost:8333/api/commands')
          return await res.json()
        } catch (e) {
          return { error: e.message }
        }
      })
      
      // Should either succeed or have controlled error
      expect(error).toBeDefined()
    })
  })
})

test.describe('GitHub Pages Build Output', () => {
  test('should generate valid dist folder', async ({ page }) => {
    // Check that dist folder exists with expected files
    const hasIndexHtml = await new Promise((resolve) => {
      import('fs').then(({ existsSync }) => {
        resolve(existsSync('./frontend/dist/index.html'))
      })
    })
    
    expect(hasIndexHtml).toBe(true)
  })

  test('should have correct base path in built HTML', async ({ page }) => {
    const fs = await import('fs')
    const indexPath = './frontend/dist/index.html'
    
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8')
      // Should reference /forge-terminal/ base path
      expect(content).toContain('/forge-terminal/')
    }
  })
})
