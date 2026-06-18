// ActionPromptStrip renders exactly one sentence that tells the developer what to do now.
// The sentence is derived purely from the current pipeline state (phases array + isCardOpen).
// specs/005-sdd-phase-ux, US2.
import './ActionPromptStrip.css'

// Named prompt constants — one per priority-ordered condition (data-model.md).
const PROMPT_COMPLETE    = 'Pipeline complete.'
const PROMPT_ITERATING   = 'Approve this iteration, or Reject to try again.'
const PROMPT_FIRST_GATE  = 'Approve to continue, Reject to restart this phase, or Clarify to redirect.'
const PROMPT_RUNNING     = (phase) => `${capitalise(phase)} is running…`
export const PROMPT_UNKNOWN = 'Unexpected pipeline state. Check the terminal.'

// START_COMMAND maps a phase name to the speckit command that starts it.
const START_COMMAND = {
  specify:   '/speckit-specify',
  clarify:   '/speckit-clarify',
  plan:      '/speckit-plan',
  tasks:     '/speckit-tasks',
  validate:  '/speckit-analyze',
  implement: '/speckit-implement',
}

function capitalise(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str
}

/**
 * deriveActionPrompt returns exactly one sentence describing the next action.
 * Priority order (first match wins) matches data-model.md §ActionPrompt.
 *
 * @param {Array}   phases     PhaseStatusEntry[] from SDD_PHASE_STATUS WebSocket event
 * @param {boolean} isCardOpen whether a gate card is currently open
 * @returns {string}
 */
export function deriveActionPrompt(phases, isCardOpen) {
  if (phases.length === 0) {
    return 'Run /speckit-specify to start a new feature.'
  }

  const allComplete = phases.every((p) => p.displayStatus === 'complete')
  if (allComplete) return PROMPT_COMPLETE

  if (isCardOpen) {
    const isIterating = phases.some((p) => p.displayStatus === 'iterating')
    return isIterating ? PROMPT_ITERATING : PROMPT_FIRST_GATE
  }

  const rejected = phases.find((p) => p.displayStatus === 'rejected')
  if (rejected) {
    const cmd = START_COMMAND[rejected.phase] ?? `/speckit-${rejected.phase}`
    return `Run ${cmd} to retry this phase.`
  }

  const active = phases.find((p) => p.displayStatus === 'active')
  if (active) return PROMPT_RUNNING(active.phase)

  const firstPending = phases.find((p) => p.displayStatus === 'pending')
  if (firstPending) {
    const cmd = START_COMMAND[firstPending.phase] ?? `/speckit-${firstPending.phase}`
    return `Run ${cmd} to continue.`
  }

  return PROMPT_UNKNOWN
}

/**
 * ActionPromptStrip renders a single-sentence action directive in a styled paragraph.
 *
 * @param {{ phases: Array, isCardOpen: boolean }} props
 */
export default function ActionPromptStrip({ phases = [], isCardOpen = false }) {
  const prompt = deriveActionPrompt(phases, isCardOpen)
  return <p className="action-prompt-strip">{prompt}</p>
}
