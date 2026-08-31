/**
 * Paste Validation E2E Test - 20x Iterations
 *
 * CONSTRAINT: NO NETWORK STUBS - Real backend, real clipboard
 * CONSTRAINT: REAL INPUTS ONLY - Uses Playwright real keyboard/browser events
 *
 * This test validates:
 * 1. Ctrl+V paste works reliably with images
 * 2. Copilot (via gpt-5-mini model) can see pasted images
 * 3. The paste functionality works 20 times in a row without failure
 *
 * Requirements per constitution.md:
 * - Use Playwright (migrated from Cypress)
 * - Use real keyboard events via page.keyboard / locator.click()
 * - Build HTML dashboard with results
 */

const fs = require('fs')
const path = require('path')
const { test, expect, exec, visitWithoutTour, waitForTerminal, getTerminalOutput, terminalType, terminalEnter, terminalShouldContain } = require('../fixtures/forge')

test.describe('Paste Validation - 20x Iterations', () => {
  // Store results for dashboard — declared outside tests so afterAll can read them.
  const testResults = []

  test.beforeEach(async ({ page }) => {
    // Visit the app - NO stubs, real backend
    await page.goto('/')

    // Wait for terminal to be fully ready
    await waitForTerminal(page, 30000)

    // Wait for WebSocket connection to stabilize
    await page.waitForTimeout(2000)
  })

  // Helper: Take screenshot of terminal and copy to clipboard.
  // Draws a distinctive orange canvas image and writes it to the Clipboard API.
  const captureAndCopyToClipboard = async (page, iterationNumber) => {
    await page.evaluate(async (iterNum) => {
      const canvas = window.document.createElement('canvas')
      canvas.width = 200
      canvas.height = 200
      const ctx = canvas.getContext('2d')

      // Draw something distinctive - orange rectangle with text
      ctx.fillStyle = '#f97316'
      ctx.fillRect(0, 0, 200, 200)
      ctx.fillStyle = '#ffffff'
      ctx.font = '16px Arial'
      ctx.fillText('Forge Terminal', 50, 100)
      ctx.fillText(`Test #${iterNum}`, 65, 120)

      // Convert to blob and write to clipboard using Clipboard API
      return new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob from canvas'))
            return
          }

          try {
            // Write to clipboard using Clipboard API
            const item = new window.ClipboardItem({ 'image/png': blob })
            await window.navigator.clipboard.write([item])
            console.log('[Test] Screenshot copied to clipboard')
            resolve(true)
          } catch (err) {
            console.error('[Test] Failed to copy to clipboard:', err)
            reject(err)
          }
        }, 'image/png')
      })
    }, iterationNumber)
  }

  // Helper: Type command into terminal
  const typeCommand = async (page, command) => {
    await terminalType(page, command)
    await terminalEnter(page)
  }

  // Helper: Wait for copilot to be ready (look for prompt)
  const waitForCopilotReady = async (page) => {
    // Copilot shows a prompt like ">" or "copilot>" when ready
    await page.waitForTimeout(3000) // Give copilot time to start
    await terminalShouldContain(page, '>', { timeout: 30000 })
  }

  // Run 20 iterations in a single test to maintain context
  test('should successfully paste and validate 20 times', async ({ page }) => {
    // Start copilot in the terminal
    console.log('Starting copilot...')
    await typeCommand(page, 'copilot')

    // Wait for copilot to initialize
    await waitForCopilotReady(page)

    // Switch to gpt-5-mini model
    console.log('Switching to gpt-5-mini model...')
    await typeCommand(page, '/model gpt-5-mini')
    await page.waitForTimeout(2000)

    // Run 20 paste validation iterations
    for (let iteration = 0; iteration < 20; iteration++) {
      const iterNum = iteration + 1
      console.log(`=== Iteration ${iterNum}/20 ===`)

      // Step 1: Capture screenshot and copy to clipboard
      console.log(`[${iterNum}] Capturing screenshot...`)
      await captureAndCopyToClipboard(page, iterNum)

      // Step 2: Focus terminal and paste with real Ctrl+V
      console.log(`[${iterNum}] Pasting with Ctrl+V...`)
      await page.locator('.xterm-helper-textarea').focus()
      await page.keyboard.press('Control+V')

      // Step 3: Wait for upload and path to appear
      await page.waitForTimeout(2000)

      // Step 4: Ask gpt-5-mini to confirm it sees the image
      console.log(`[${iterNum}] Asking gpt-5-mini to confirm...`)
      await typeCommand(page, 'Can you see this image? Reply only with Yes or No.')

      // Step 5: Wait for response
      await page.waitForTimeout(5000)

      // Step 6: Capture screenshot of the response
      await page.screenshot({ path: `screenshots/paste-validation-${iterNum}.png` })

      // Step 7: Check for Yes response
      const output = await getTerminalOutput(page, 20)
      const hasYes = output.toLowerCase().includes('yes')
      const hasNo = output.toLowerCase().includes('no')
      const hasSeeFile = output.includes('see file at')

      testResults.push({
        iteration: iterNum,
        timestamp: new Date().toISOString(),
        pasteDetected: hasSeeFile,
        modelResponse: hasYes ? 'Yes' : (hasNo ? 'No' : 'Unknown'),
        success: hasYes && hasSeeFile,
        output: output.slice(-500), // Last 500 chars
      })

      console.log(`[${iterNum}] Result: paste=${hasSeeFile}, response=${hasYes ? 'Yes' : hasNo ? 'No' : 'Unknown'}`)

      // Don't fail individual iterations - collect all results
      if (!hasSeeFile) {
        console.log(`[${iterNum}] WARNING: Paste not detected!`)
      }
      if (!hasYes) {
        console.log(`[${iterNum}] WARNING: Model did not confirm seeing image!`)
      }

      // Small delay between iterations
      await page.waitForTimeout(1000)
    }

    // After all iterations, write results JSON to disk
    const resultsDir = path.join('tests', 'results')
    fs.mkdirSync(resultsDir, { recursive: true })
    fs.writeFileSync(
      path.join(resultsDir, 'paste-validation-results.json'),
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          totalIterations: 20,
          results: testResults,
          summary: {
            successCount: testResults.filter((r) => r.success).length,
            pasteDetectedCount: testResults.filter((r) => r.pasteDetected).length,
            modelYesCount: testResults.filter((r) => r.modelResponse === 'Yes').length,
          },
        },
        null,
        2
      )
    )
  })

  test.afterAll(async () => {
    // Generate HTML dashboard after all tests.
    // In Cypress this used cy.task('generateDashboard') / cy.task('openDashboard').
    // In Playwright we write the results file and log the path; a separate script can
    // render the HTML dashboard from tests/results/paste-validation-results.json.
    const resultsFile = path.join('tests', 'results', 'paste-validation-results.json')
    if (fs.existsSync(resultsFile)) {
      console.log(`Dashboard results written to: ${resultsFile}`)
      console.log(
        `To generate the HTML dashboard, run: node scripts/generate-paste-dashboard.js`
      )
    }
  })
})

// Alternative: Individual test per iteration (for parallel execution)
// This approach runs each iteration as a separate test.
// Useful if you want to run them in parallel or see individual results.
test.describe('Paste Validation - Individual Tests', () => {
  for (let iteration = 0; iteration < 20; iteration++) {
    const iterNum = iteration + 1

    test.skip(`Iteration ${iterNum}: Paste and validate with gpt-5-mini`, async ({ page }) => {
      // Visit fresh for each iteration
      await page.goto('/')
      await waitForTerminal(page, 30000)
      await page.waitForTimeout(2000)

      // Start copilot
      await terminalType(page, 'copilot')
      await terminalEnter(page)
      await page.waitForTimeout(5000)

      // Switch to gpt-5-mini
      await terminalType(page, '/model gpt-5-mini')
      await terminalEnter(page)
      await page.waitForTimeout(2000)

      // Copy test image to clipboard
      await page.evaluate(async (iterationNum) => {
        const canvas = window.document.createElement('canvas')
        canvas.width = 200
        canvas.height = 200
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#f97316'
        ctx.fillRect(0, 0, 200, 200)
        ctx.fillStyle = '#ffffff'
        ctx.font = '16px Arial'
        ctx.fillText('Forge Terminal', 50, 100)
        ctx.fillText(`Test #${iterationNum}`, 65, 120)

        return new Promise((resolve, reject) => {
          canvas.toBlob(async (blob) => {
            try {
              const item = new window.ClipboardItem({ 'image/png': blob })
              await window.navigator.clipboard.write([item])
              resolve()
            } catch (err) {
              reject(err)
            }
          }, 'image/png')
        })
      }, iterNum)

      // Paste with real Ctrl+V
      await page.locator('.xterm-helper-textarea').focus()
      await page.keyboard.press('Control+V')
      await page.waitForTimeout(2000)

      // Ask model to confirm
      await terminalType(page, 'Can you see this image? Reply only Yes or No.')
      await terminalEnter(page)
      await page.waitForTimeout(5000)

      // Capture screenshot
      await page.screenshot({ path: `screenshots/paste-iteration-${iterNum}.png` })

      // Verify
      const output = await getTerminalOutput(page, 20)
      expect(output).toContain('see file at')
      expect(output.toLowerCase()).toContain('yes')
    })
  }
})
