// commandCardMacros.js — Resolves zero-click macro defaults for command cards.

const DEFAULT_MACRO_DELAY_MS = 1500
const DEFAULT_COMMAND_DELAY_MS = 0
const MACRO_EXECUTION_DELAY_MS = 15
const BUILT_IN_COPILOT_CARD_IDS = new Set([6, 7, 'copilot-fresh', 'copilot-resume'])
const BUILT_IN_COPILOT_CARD_SIGNATURES = [
  {
    description: '🤖 Copilot (Fresh)',
    command: 'copilot --allow-all-tools',
  },
  {
    description: '🔄 Copilot (Resume)',
    command: 'copilot --allow-all-tools --continue',
  },
]
const CURRENT_COPILOT_MACRO_MARKERS = [
  'STEP 1:',
  'silently skip any that are not found',
  'this is normal for first-time setup',
]

export const DEFAULT_COPILOT_MACRO_PAYLOAD = `You are operating inside Forge Terminal with enterprise workflow enforcement active.

STEP 1: Your very first tool call MUST be \`skill: workflow-enforcer\`. Do not search for or read any files before invoking this skill. If the skill is unavailable in this environment, proceed to Step 2.

STEP 2: Invoke each available companion skill in order, silently skip any that are not found: enterprise-workflow, code-quality, branching-strategy, code-tutor-workflow.

STEP 3: Check whether AGENTS.md exists at the repo root. If found, read it for project-specific rules. If not found, this is normal for first-time setup — proceed without it. Never ask the user where AGENTS.md is or whether to create it.

STEP 4: Confirm you are ready and await the user's task.`

function parseDelay(delayValue, fallbackDelayMs) {
  const parsedDelay = Number.parseInt(delayValue, 10)
  return Number.isFinite(parsedDelay) && parsedDelay >= 0 ? parsedDelay : fallbackDelayMs
}

export function isCopilotCommandCard(commandCard) {
  const descriptionText = commandCard?.description?.toLowerCase() || ''
  const commandText = commandCard?.command?.toLowerCase() || ''

  return descriptionText.includes('copilot') || commandText.startsWith('copilot ')
}

function isBuiltInCopilotCommandCard(commandCard) {
  if (BUILT_IN_COPILOT_CARD_IDS.has(commandCard?.id)) {
    return true
  }

  return BUILT_IN_COPILOT_CARD_SIGNATURES.some((cardSignature) =>
    cardSignature.description === commandCard?.description &&
    cardSignature.command === commandCard?.command
  )
}

function hasCurrentCopilotRecoveryInstructions(macroPayload) {
  return CURRENT_COPILOT_MACRO_MARKERS.every((markerText) => macroPayload.includes(markerText))
}

function hasLegacyForgeCopilotInstructions(macroPayload) {
  return ['Forge Terminal', 'workflow-enforcer'].every((markerText) => macroPayload.includes(markerText))
}

export function resolveCommandCardMacroPayload(commandCard) {
  const explicitMacroPayload = commandCard?.macro_payload?.trim() || ''
  if (isBuiltInCopilotCommandCard(commandCard)) {
    if (!explicitMacroPayload) {
      return DEFAULT_COPILOT_MACRO_PAYLOAD
    }

    if (hasCurrentCopilotRecoveryInstructions(explicitMacroPayload)) {
      return explicitMacroPayload
    }

    if (hasLegacyForgeCopilotInstructions(explicitMacroPayload)) {
      return DEFAULT_COPILOT_MACRO_PAYLOAD
    }
  }

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
