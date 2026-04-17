// commandCardMacros.js — Resolves zero-click macro defaults for command cards.

const DEFAULT_MACRO_DELAY_MS = 1500
const DEFAULT_COMMAND_DELAY_MS = 0
const MACRO_EXECUTION_DELAY_MS = 15

export const DEFAULT_COPILOT_MACRO_PAYLOAD = `You are operating inside Forge Terminal with enterprise workflow enforcement active.
Begin by checking for AGENTS.md at the repository root as your first filesystem action.
If AGENTS.md exists, read it first and then invoke \`skill: workflow-enforcer\` immediately.
Load the full skill chain before any code analysis or file edits: workflow-enforcer -> enterprise-workflow -> code-quality -> branching-strategy -> code-tutor-workflow.
If AGENTS.md, .github/copilot-instructions.md, or the workflow scaffolding is missing, create the missing workflow files and setup needed for this repository yourself so the workflow can be followed.
Do not stop to ask the user where AGENTS.md is if it is missing from the repo root.
After the workflow path exists, continue with the task and confirm readiness.`

function parseDelay(delayValue, fallbackDelayMs) {
  const parsedDelay = Number.parseInt(delayValue, 10)
  return Number.isFinite(parsedDelay) && parsedDelay >= 0 ? parsedDelay : fallbackDelayMs
}

export function isCopilotCommandCard(commandCard) {
  const descriptionText = commandCard?.description?.toLowerCase() || ''
  const commandText = commandCard?.command?.toLowerCase() || ''

  return descriptionText.includes('copilot') || commandText.startsWith('copilot ')
}

export function resolveCommandCardMacroPayload(commandCard) {
  const explicitMacroPayload = commandCard?.macro_payload?.trim() || ''
  if (explicitMacroPayload) {
    return explicitMacroPayload
  }

  if (isCopilotCommandCard(commandCard)) {
    return DEFAULT_COPILOT_MACRO_PAYLOAD
  }

  return ''
}

export function buildCommandCardExecutionPlan(commandCard) {
  return {
    commandText: commandCard?.command || '',
    commandDelayMs: parseDelay(commandCard?.delay, DEFAULT_COMMAND_DELAY_MS),
    macroPayload: resolveCommandCardMacroPayload(commandCard),
    macroDelayMs: parseDelay(commandCard?.macro_delay, DEFAULT_MACRO_DELAY_MS),
    macroExecutionDelayMs: MACRO_EXECUTION_DELAY_MS,
  }
}
