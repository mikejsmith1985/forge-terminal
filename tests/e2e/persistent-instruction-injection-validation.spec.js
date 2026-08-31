/**
 * Playwright Test: Persistent Instruction Injection Validation
 *
 * Following constitution Article X: Deterministic Verification & Proof
 *
 * This test validates that persistent instructions are actually injected into
 * LLM commands by reading the xterm.js buffer (NOT the DOM).
 */

const { test, expect } = require('../fixtures/forge')

test.describe('Persistent Instruction Injection - Deterministic Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:9999')
    await page.waitForTimeout(3000) // Allow app to fully initialize
  })

  test('should inject persistent instruction into copilot command', async ({ page }) => {
    // Step 1: Configure persistent instruction via API
    const testInstruction = 'INJECTED_CONTEXT_VALIDATION_TEST_12345'

    const apiResponse = await page.request.post('http://localhost:9999/api/persistent-instruction', {
      data: {
        enabled: true,
        template: testInstruction
      }
    })
    expect(apiResponse.status()).toBe(200)
    const responseBody = await apiResponse.json()
    expect(responseBody.status).toBe('success')
    console.log('API config saved')

    // Step 2: Get WebSocket connection and send PROMPT_INJECTION_CONFIG
    await page.evaluate((instruction) => {
      // Access the WebSocket connection
      const wsMap = window.wsConnections
      if (!wsMap || wsMap.size === 0) {
        throw new Error('No WebSocket connections found')
      }

      const ws = Array.from(wsMap.values())[0]

      // Send persistent instruction config via WebSocket
      const config = {
        type: 'PROMPT_INJECTION_CONFIG',
        enabled: true,
        instruction: instruction
      }

      ws.send(JSON.stringify(config))
    }, testInstruction)
    console.log('Sent WebSocket config')

    // Wait for config to be processed
    await page.waitForTimeout(1000)

    // Step 3: Type a copilot command (but DON'T press enter yet)
    await page.locator('.xterm-helper-textarea').first().focus()
    await page.locator('.xterm-helper-textarea').first().pressSequentially('echo "BEFORE_INJECTION"', { delay: 50 })

    // Step 4: Read terminal buffer BEFORE enter (baseline)
    const bufferBefore = await page.evaluate(() => {
      const term = window.terminalInstances?.[Object.keys(window.terminalInstances)[0]]?.terminal
      if (!term) {
        throw new Error('Terminal instance not found')
      }

      const lines = []
      for (let i = 0; i < term.buffer.active.length; i++) {
        const line = term.buffer.active.getLine(i)
        if (line) {
          lines.push(line.translateToString(true))
        }
      }
      return lines
    })
    console.log('Buffer before Enter:', bufferBefore.join('\n'))

    // Step 5: Press Enter
    await page.locator('.xterm-helper-textarea').first().press('Enter')

    // Wait for command to execute
    await page.waitForTimeout(500)

    // Step 6: Read terminal buffer AFTER enter
    const bufferAfter = await page.evaluate(() => {
      const term = window.terminalInstances?.[Object.keys(window.terminalInstances)[0]]?.terminal

      const lines = []
      for (let i = 0; i < term.buffer.active.length; i++) {
        const line = term.buffer.active.getLine(i)
        if (line) {
          lines.push(line.translateToString(true))
        }
      }
      return lines
    })
    console.log('Buffer after Enter:', bufferAfter.join('\n'))

    // Verify the command was executed
    const bufferAfterText = bufferAfter.join('\n')
    expect(bufferAfterText).toContain('BEFORE_INJECTION')
    console.log('Command executed (baseline test)')

    // Step 7: Now test with ACTUAL LLM command
    await page.waitForTimeout(1000)

    await page.locator('.xterm-helper-textarea').first().focus()
    await page.locator('.xterm-helper-textarea').first().fill('')
    await page.locator('.xterm-helper-textarea').first().pressSequentially('copilot test prompt', { delay: 50 })

    await page.waitForTimeout(500)

    // Step 8: Press Enter for copilot command
    await page.locator('.xterm-helper-textarea').first().press('Enter')

    // Wait for injection to happen
    await page.waitForTimeout(2000)

    // Step 9: Read buffer to verify injection happened
    const finalBuffer = await page.evaluate(() => {
      const term = window.terminalInstances?.[Object.keys(window.terminalInstances)[0]]?.terminal

      const lines = []
      for (let i = 0; i < term.buffer.active.length; i++) {
        const line = term.buffer.active.getLine(i)
        if (line) {
          lines.push(line.translateToString(true))
        }
      }
      return lines
    })

    const finalBufferText = finalBuffer.join('\n')
    console.log('Final buffer:', finalBufferText)

    // CRITICAL VALIDATION: Check if the injected context appears in the buffer.
    // This proves the backend modified the command before sending to PTY.
    if (finalBufferText.includes('INJECTED_CONTEXT_VALIDATION_TEST_12345')) {
      console.log('INJECTION SUCCESSFUL: Context found in terminal buffer')
    } else {
      console.log('INJECTION FAILED: Context NOT found in terminal buffer')
      console.log('Buffer contents:', finalBufferText)
      throw new Error('Persistent instruction was NOT injected into copilot command')
    }
  })

  test('should NOT inject into regular shell commands', async ({ page }) => {
    // Configure persistent instruction
    const testInstruction = 'THIS_SHOULD_NOT_APPEAR'

    await page.request.post('http://localhost:9999/api/persistent-instruction', {
      data: {
        enabled: true,
        template: testInstruction
      }
    })

    // Send WebSocket config
    await page.evaluate((instruction) => {
      const ws = Array.from(window.wsConnections.values())[0]
      ws.send(JSON.stringify({
        type: 'PROMPT_INJECTION_CONFIG',
        enabled: true,
        instruction: instruction
      }))
    }, testInstruction)

    await page.waitForTimeout(1000)

    // Type a regular shell command (NOT an LLM command)
    await page.locator('.xterm-helper-textarea').first().focus()
    await page.locator('.xterm-helper-textarea').first().pressSequentially('echo "Regular command"', { delay: 50 })
    await page.locator('.xterm-helper-textarea').first().press('Enter')

    await page.waitForTimeout(500)

    // Verify injection did NOT happen
    const bufferText = await page.evaluate(() => {
      const term = window.terminalInstances?.[Object.keys(window.terminalInstances)[0]]?.terminal

      const lines = []
      for (let i = 0; i < term.buffer.active.length; i++) {
        const line = term.buffer.active.getLine(i)
        if (line) {
          lines.push(line.translateToString(true))
        }
      }
      return lines.join('\n')
    })

    // Should NOT contain the injection
    expect(bufferText).not.toContain('THIS_SHOULD_NOT_APPEAR')
    console.log('Regular command was NOT modified (correct behavior)')
  })
})
