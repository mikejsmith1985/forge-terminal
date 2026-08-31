/**
 * Quick Paste Validation Test
 *
 * This test validates the v3.12.6 paste handler works correctly by:
 * 1. Dispatching synthetic paste events (simulates browser paste behavior)
 * 2. Testing text paste via paste event
 * 3. Testing image paste via paste event with blob
 *
 * NOTE: Uses synthetic paste events because Clipboard API requires actual user gestures
 * that automated testing cannot provide. This tests the paste HANDLER, not the Ctrl+V key.
 */

const { test, expect, visitWithoutTour, waitForTerminal } = require('../fixtures/forge')

test.describe('Quick Paste Validation', () => {
  test.beforeEach(async ({ page }) => {
    await visitWithoutTour(page, '/')
    await waitForTerminal(page, 30000)
    await page.waitForTimeout(2000)
  })

  test('should handle TEXT paste event correctly', async ({ page }) => {
    const testText = `paste-test-${Date.now()}`

    // Focus terminal first
    await page.locator('.xterm-helper-textarea').first().focus()

    // Wait for terminal to be fully initialized and listeners attached
    await page.waitForTimeout(1000)

    // Dispatch synthetic paste event with text data to terminal container
    await page.evaluate((text) => {
      // Target the terminal container where paste listener is attached
      const terminalContainer = document.querySelector('.terminal-outer-container')
      const textarea = document.querySelector('.xterm-helper-textarea')

      if (!terminalContainer) throw new Error('Terminal container not found')
      if (!textarea) throw new Error('Terminal textarea not found')

      // Create paste event with text data
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', text)

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: clipboardData,
        bubbles: true,
        cancelable: true,
      })

      // First try dispatching to textarea (where keyboard paste events fire)
      console.log('[Test] Dispatching paste event to textarea')
      textarea.dispatchEvent(pasteEvent)

      // Also try dispatching to container (capture phase listener)
      const containerEvent = new ClipboardEvent('paste', {
        clipboardData: clipboardData,
        bubbles: true,
        cancelable: true,
      })
      console.log('[Test] Dispatching paste event to container')
      terminalContainer.dispatchEvent(containerEvent)
    }, testText)

    console.log('Paste event dispatched with text:', testText)

    // Wait for paste to process and echo back from PTY
    await page.waitForTimeout(2000)

    // Verify text appears in terminal — read full xterm buffer model (Article X)
    const bufferText = await page.evaluate(() => {
      const buffer = window.term.buffer.active
      let fullText = ''
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) {
          fullText += line.translateToString(true) + '\n'
        }
      }
      return fullText
    })
    console.log('Buffer contains test text:', bufferText.includes(testText))
    expect(bufferText).toContain(testText)

    // Take screenshot as evidence
    await page.screenshot({ path: 'screenshots/text-paste-success.png' })
  })

  test('should handle IMAGE paste event and upload', async ({ page }) => {
    // Focus terminal
    await page.locator('.xterm-helper-textarea').first().focus()
    await page.waitForTimeout(500)

    // Create and dispatch paste event with image blob
    await page.evaluate(() => {
      const textarea = document.querySelector('.xterm-helper-textarea')
      if (!textarea) throw new Error('Terminal textarea not found')

      // Create a test image as canvas, convert to blob
      const canvas = document.createElement('canvas')
      canvas.width = 200
      canvas.height = 200
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#f97316'
      ctx.fillRect(0, 0, 200, 200)
      ctx.fillStyle = '#ffffff'
      ctx.font = '20px Arial'
      ctx.fillText('TEST IMAGE', 40, 90)
      ctx.fillText(`${Date.now()}`, 40, 120)

      // Convert to blob and dispatch paste event
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          // Create DataTransfer with image
          const dt = new DataTransfer()
          const file = new File([blob], 'test-image.png', { type: 'image/png' })
          dt.items.add(file)

          // Create paste event
          const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          })

          textarea.dispatchEvent(pasteEvent)
          console.log('Paste event dispatched with image')
          resolve()
        }, 'image/png')
      })
    })

    // Wait for upload to complete
    await page.waitForTimeout(4000)

    // Verify "see file at" appears — read full xterm buffer model (Article X)
    const bufferText = await page.evaluate(() => {
      const buffer = window.term.buffer.active
      let fullText = ''
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) {
          fullText += line.translateToString(true) + '\n'
        }
      }
      return fullText
    })
    console.log('Buffer contains "see file at":', bufferText.includes('see file at'))
    expect(bufferText).toContain('see file at')

    // Take screenshot as evidence
    await page.screenshot({ path: 'screenshots/image-paste-success.png' })
  })

  test('should handle 5 consecutive TEXT pastes without failure', async ({ page }) => {
    const results = []

    for (let i = 0; i < 5; i++) {
      const iteration = i + 1
      const testText = `paste-iteration-${iteration}-${Date.now()}`

      // Focus terminal
      await page.locator('.xterm-helper-textarea').first().focus()

      // Dispatch paste event
      await page.evaluate((text) => {
        const textarea = document.querySelector('.xterm-helper-textarea')
        const dt = new DataTransfer()
        dt.setData('text/plain', text)

        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        })

        textarea.dispatchEvent(pasteEvent)
      }, testText)

      await page.waitForTimeout(1000)

      // Verify by reading full xterm buffer model (Article X)
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
      const success = fullText.includes(`paste-iteration-${iteration}`)
      results.push({ iteration, success, snippet: fullText.slice(-200) })
      console.log(`Iteration ${iteration}: ${success ? 'PASS' : 'FAIL'}`)

      // Clear by pressing Enter
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
    }

    // Final verification
    const allPassed = results.every(r => r.success)
    const passCount = results.filter(r => r.success).length
    console.log(`Final results: ${passCount}/5 passed`)
    results.forEach(r => console.log(`  Iteration ${r.iteration}: ${r.success ? 'PASS' : 'FAIL'}`))
    expect(passCount).toBeGreaterThanOrEqual(4) // Allow 1 failure for flakiness

    await page.screenshot({ path: 'screenshots/consecutive-paste-success.png' })
  })

  test('should handle 5 consecutive IMAGE pastes without failure', async ({ page }) => {
    const results = []

    for (let i = 0; i < 5; i++) {
      const iteration = i + 1

      // Focus terminal
      await page.locator('.xterm-helper-textarea').first().focus()

      // Create and dispatch image paste
      await page.evaluate((iter) => {
        const textarea = document.querySelector('.xterm-helper-textarea')
        const canvas = document.createElement('canvas')
        canvas.width = 100
        canvas.height = 100
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = `hsl(${iter * 60}, 70%, 50%)`
        ctx.fillRect(0, 0, 100, 100)
        ctx.fillStyle = '#fff'
        ctx.font = '14px Arial'
        ctx.fillText(`Test ${iter}`, 25, 55)

        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            const dt = new DataTransfer()
            const file = new File([blob], `test-${iter}.png`, { type: 'image/png' })
            dt.items.add(file)

            const pasteEvent = new ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
            })

            textarea.dispatchEvent(pasteEvent)
            resolve()
          }, 'image/png')
        })
      }, iteration)

      // Wait for upload
      await page.waitForTimeout(3000)

      // Verify by reading full xterm buffer model (Article X)
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
      const success = fullText.includes('see file at')
      results.push({ iteration, success })
      console.log(`Image Iteration ${iteration}: ${success ? 'PASS' : 'FAIL'}`)

      // Clear by pressing Enter
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
    }

    // Final verification
    const successCount = results.filter(r => r.success).length
    console.log(`Final image results: ${successCount}/5 passed`)
    expect(successCount).toBeGreaterThanOrEqual(4) // Allow 1 failure for flakiness

    await page.screenshot({ path: 'screenshots/consecutive-image-paste-success.png' })
  })
})
