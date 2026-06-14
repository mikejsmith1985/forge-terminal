// Tests for the SDD phase decision card: it must render a scannable summary of a
// completed Spec Kit phase (status, headline, produced items, flag chips) and a
// button per available action, invoking onAction with the chosen action.
import { fireEvent, render, screen } from '@testing-library/react'

import PhaseDecisionCard from './PhaseDecisionCard'

const buildSummary = (overrides = {}) => ({
  headline: 'Plan ready · 3 contracts · 0 open clarifications',
  producedItems: ['plan.md', 'research.md', 'data-model.md', 'quickstart.md'],
  flags: [{ kind: 'unchecked-checklist', label: '2 checklist items unchecked', severity: 'warn' }],
  ...overrides,
})

const renderCard = (overrides = {}) => {
  const props = {
    phase: 'plan',
    summary: buildSummary(),
    actions: ['approve', 'reject', 'clarify'],
    onAction: vi.fn(),
    isOpen: true,
    ...overrides,
  }
  render(<PhaseDecisionCard {...props} />)
  return props
}

describe('PhaseDecisionCard', () => {
  it('returns null when isOpen is false', () => {
    const { container } = render(
      <PhaseDecisionCard
        phase="plan"
        summary={buildSummary()}
        actions={['approve', 'reject', 'clarify']}
        onAction={vi.fn()}
        isOpen={false}
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders the phase name as a status header', () => {
    renderCard({ phase: 'plan' })

    // Target the heading specifically so the "Plan ready" headline does not match.
    expect(screen.getByRole('heading', { name: 'plan' })).toBeInTheDocument()
  })

  it('renders the summary headline', () => {
    renderCard()

    expect(
      screen.getByText('Plan ready · 3 contracts · 0 open clarifications')
    ).toBeInTheDocument()
  })

  it('renders every produced item', () => {
    renderCard()

    expect(screen.getByText('plan.md')).toBeInTheDocument()
    expect(screen.getByText('research.md')).toBeInTheDocument()
    expect(screen.getByText('data-model.md')).toBeInTheDocument()
    expect(screen.getByText('quickstart.md')).toBeInTheDocument()
  })

  it('renders a chip per flag', () => {
    renderCard({
      summary: buildSummary({
        flags: [
          { kind: 'unchecked-checklist', label: '2 checklist items unchecked', severity: 'warn' },
          { kind: 'open-clarification', label: '1 open clarification', severity: 'block' },
        ],
      }),
    })

    expect(screen.getByText('2 checklist items unchecked')).toBeInTheDocument()
    expect(screen.getByText('1 open clarification')).toBeInTheDocument()
  })

  it('shows a clean no-flags state when flags is empty', () => {
    renderCard({ summary: buildSummary({ flags: [] }) })

    expect(screen.getByText(/no flags/i)).toBeInTheDocument()
  })

  it('renders a button per action', () => {
    renderCard({ actions: ['approve', 'reject', 'clarify'] })

    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clarify/i })).toBeInTheDocument()
  })

  it('calls onAction with "approve" when Approve is clicked', () => {
    const { onAction } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: /approve/i }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith('approve')
  })

  it('calls onAction with "reject" when Reject is clicked', () => {
    const { onAction } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: /reject/i }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith('reject')
  })
})
