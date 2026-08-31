// Unit tests for ActionPromptStrip and its deriveActionPrompt pure function.
// T010 (Red) — fails until T011 creates ActionPromptStrip.jsx.
import { render, screen } from '@testing-library/react'
import ActionPromptStrip, { deriveActionPrompt, PROMPT_UNKNOWN } from './ActionPromptStrip'

const PHASE_NAMES = ['specify', 'clarify', 'plan', 'validate', 'implement']

function makePhases(overrides = {}) {
  return PHASE_NAMES.map((name, idx) => ({
    phase: name,
    order: idx + 1,
    displayStatus: overrides[name] ?? 'pending',
    runCount: 0,
  }))
}

describe('deriveActionPrompt', () => {
  it('returns "Pipeline complete." when all phases are complete', () => {
    const phases = makePhases({
      specify: 'complete', clarify: 'complete', plan: 'complete',
      validate: 'complete', implement: 'complete',
    })
    expect(deriveActionPrompt(phases, false)).toBe('Pipeline complete.')
  })

  it('returns iterating prompt when card is open and any phase is iterating', () => {
    const phases = makePhases({ specify: 'complete', clarify: 'iterating' })
    expect(deriveActionPrompt(phases, true)).toBe(
      'Approve this iteration, or Reject to try again.'
    )
  })

  it('returns first-run prompt when card is open and no iterating phase', () => {
    const phases = makePhases({ specify: 'awaiting-decision' })
    expect(deriveActionPrompt(phases, true)).toBe(
      'Approve to continue, Reject to restart this phase, or Clarify to redirect.'
    )
  })

  it('returns retry prompt when a phase is rejected', () => {
    const phases = makePhases({ specify: 'complete', clarify: 'rejected' })
    expect(deriveActionPrompt(phases, false)).toBe(
      'Run /speckit-clarify to retry this phase.'
    )
  })

  it('returns running prompt when a phase is active', () => {
    const phases = makePhases({ specify: 'active' })
    expect(deriveActionPrompt(phases, false)).toBe('Specify is running…')
  })

  it('returns continue prompt pointing to the first pending phase', () => {
    const phases = makePhases({ specify: 'complete', clarify: 'complete' })
    expect(deriveActionPrompt(phases, false)).toBe('Run /speckit-plan to continue.')
  })

  it('returns start prompt when phases is empty', () => {
    expect(deriveActionPrompt([], false)).toBe(
      'Run /speckit-specify to start a new feature.'
    )
  })

  it('returns start prompt when phases is null (null-safety guard)', () => {
    // phases can be null during a React re-render race on session switch — must not throw.
    expect(deriveActionPrompt(null, false)).toBe(
      'Run /speckit-specify to start a new feature.'
    )
  })

  it('returns unknown-state fallback for an unrecognised pipeline state', () => {
    // PROMPT_UNKNOWN is the exported constant for the unreachable fallback branch.
    // We verify the constant exists and has the correct value.
    expect(typeof PROMPT_UNKNOWN).toBe('string')
    expect(PROMPT_UNKNOWN).toBe('Unexpected pipeline state. Check the terminal.')
  })

  it('output is always ≤ 100 characters', () => {
    const scenarios = [
      { phases: makePhases({ specify: 'active' }), isCardOpen: false },
      { phases: makePhases({ specify: 'rejected' }), isCardOpen: false },
      { phases: makePhases({ specify: 'awaiting-decision' }), isCardOpen: true },
      { phases: makePhases({ specify: 'iterating' }), isCardOpen: true },
      { phases: [], isCardOpen: false },
    ]
    scenarios.forEach(({ phases, isCardOpen }) => {
      const result = deriveActionPrompt(phases, isCardOpen)
      expect(result.length, `"${result}" is too long`).toBeLessThanOrEqual(100)
    })
  })
})

describe('ActionPromptStrip', () => {
  it('renders the derived prompt string', () => {
    const phases = makePhases({ specify: 'active' })
    render(<ActionPromptStrip phases={phases} isCardOpen={false} />)
    expect(screen.getByText('Specify is running…')).toBeInTheDocument()
  })

  it('has the action-prompt-strip class', () => {
    const phases = makePhases({ specify: 'active' })
    const { container } = render(<ActionPromptStrip phases={phases} isCardOpen={false} />)
    expect(container.querySelector('.action-prompt-strip')).not.toBeNull()
  })

  it('renders start prompt with empty phases', () => {
    render(<ActionPromptStrip phases={[]} isCardOpen={false} />)
    expect(screen.getByText('Run /speckit-specify to start a new feature.')).toBeInTheDocument()
  })

  it('renders without crashing when phases is null (null-safety guard)', () => {
    // null can arrive briefly during a session-switch re-render; the component must not throw.
    render(<ActionPromptStrip phases={null} isCardOpen={false} />)
    expect(screen.getByText('Run /speckit-specify to start a new feature.')).toBeInTheDocument()
  })
})
