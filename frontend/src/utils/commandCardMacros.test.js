// commandCardMacros.test.js — Guards the command-card zero-click macro fallback rules.

import { buildCommandCardExecutionPlan, DEFAULT_COPILOT_MACRO_PAYLOAD, resolveCommandCardMacroPayload } from './commandCardMacros'

describe('commandCardMacros', () => {
  it('keeps an explicit macro payload unchanged', () => {
    const macroPayload = resolveCommandCardMacroPayload({
      description: 'Custom card',
      command: 'echo hello',
      macro_payload: 'echo injected',
    })

    expect(macroPayload).toBe('echo injected')
  })

  it('falls back to the default copilot macro payload when stored payload is blank', () => {
    const macroPayload = resolveCommandCardMacroPayload({
      description: '🤖 Copilot (Fresh)',
      command: 'copilot --allow-all-tools',
      macro_payload: '',
    })

    expect(macroPayload).toBe(DEFAULT_COPILOT_MACRO_PAYLOAD)
    expect(macroPayload).toContain('AGENTS.md')
    expect(macroPayload).toContain('workflow-enforcer')
    expect(macroPayload).toContain('create the missing workflow files')
  })

  it('does not inject a fallback macro for non-copilot cards', () => {
    const macroPayload = resolveCommandCardMacroPayload({
      description: 'Plain command',
      command: 'npm test',
      macro_payload: '',
    })

    expect(macroPayload).toBe('')
  })

  it('builds a normalized execution plan with default macro delay', () => {
    const executionPlan = buildCommandCardExecutionPlan({
      description: '🔄 Copilot (Resume)',
      command: 'copilot --allow-all-tools --continue',
      delay: '250',
      macro_delay: '',
      macro_payload: '',
    })

    expect(executionPlan.commandText).toBe('copilot --allow-all-tools --continue')
    expect(executionPlan.commandDelayMs).toBe(250)
    expect(executionPlan.macroDelayMs).toBe(1500)
    expect(executionPlan.macroExecutionDelayMs).toBe(15)
    expect(executionPlan.macroPayload).toBe(DEFAULT_COPILOT_MACRO_PAYLOAD)
  })

  it('preserves macro execution even when the primary command is blank', () => {
    const executionPlan = buildCommandCardExecutionPlan({
      description: 'Macro only bootstrap',
      command: '   ',
      macro_payload: 'echo bootstrap',
      macro_delay: '200',
    })

    expect(executionPlan.commandText.trim()).toBe('')
    expect(executionPlan.macroPayload).toBe('echo bootstrap')
    expect(executionPlan.macroDelayMs).toBe(200)
  })
})
