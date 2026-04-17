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

  it('replaces stale copilot macro payloads with the current recovery instructions', () => {
    const macroPayload = resolveCommandCardMacroPayload({
      description: '🤖 Copilot (Fresh)',
      command: 'copilot --allow-all-tools',
      macro_payload: `You are operating inside Forge Terminal with enterprise workflow enforcement active.
Begin by reading AGENTS.md — do this now as your very first action.
After reading it, invoke \`skill: workflow-enforcer\` immediately.
Load the full skill chain before any code analysis or file edits: workflow-enforcer -> enterprise-workflow -> code-quality -> branching-strategy -> code-tutor-workflow.
Confirm you have read AGENTS.md and are ready.`,
    })

    expect(macroPayload).toBe(DEFAULT_COPILOT_MACRO_PAYLOAD)
    expect(macroPayload).toContain('If any named companion skills are unavailable')
  })

  it('does not inject a fallback macro for non-copilot cards', () => {
    const macroPayload = resolveCommandCardMacroPayload({
      description: 'Plain command',
      command: 'npm test',
      macro_payload: '',
    })

    expect(macroPayload).toBe('')
  })

  it('preserves custom macros for user-created copilot cards', () => {
    const macroPayload = resolveCommandCardMacroPayload({
      id: 42,
      description: 'My Custom Copilot Setup',
      command: 'copilot --allow-all-tools --sandbox',
      macro_payload: 'Custom instructions for my repo workflow',
    })

    expect(macroPayload).toBe('Custom instructions for my repo workflow')
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
