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
    onDismiss: vi.fn(),
    decisionError: null,
    isSubmitting: false,
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

  it('does not call onAction when Clarify is clicked; reveals clarify input mode', () => {
    const { onAction } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: /clarify/i }))

    // Clarify is a two-step interaction: clicking it must not advance the gate.
    expect(onAction).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('disables Confirm while the clarify textarea is empty or whitespace', () => {
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: /clarify/i }))

    // Empty by default.
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()

    // Whitespace-only must also keep Confirm disabled (backend rejects empty clarify).
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
  })

  it('calls onAction with "clarify" and the trimmed steer when Confirm is clicked', () => {
    const { onAction } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: /clarify/i }))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  tighten the auth scope  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith('clarify', 'tighten the auth scope')
  })

  it('returns to the normal actions without calling onAction when Cancel is clicked', () => {
    const { onAction } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: /clarify/i }))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'some steer' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onAction).not.toHaveBeenCalled()
    // Back to the normal action buttons; the clarify input is gone.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^clarify$/i })).toBeInTheDocument()
  })

  it('clears the textarea when re-entering clarify mode after Cancel', () => {
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: /clarify/i }))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'discarded steer' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    fireEvent.click(screen.getByRole('button', { name: /clarify/i }))
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('calls onDismiss (and not onAction) when the dismiss control is clicked', () => {
    const { onAction, onDismiss } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('calls onDismiss when Escape is pressed', () => {
    const { onDismiss } = renderCard()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders the decision error and keeps the dismiss control enabled', () => {
    renderCard({ decisionError: 'Decision request failed: 500' })

    expect(screen.getByText(/decision request failed: 500/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeEnabled()
  })

  it('disables Approve but keeps Dismiss enabled while submitting', () => {
    renderCard({ isSubmitting: true })

    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeEnabled()
  })

  // ── US3: artifact preview section ─────────────────────────────────────

  it('renders no artifact preview section when artifactPreview is null', () => {
    const { container } = render(
      <PhaseDecisionCard
        phase="plan"
        summary={buildSummary()}
        actions={['approve']}
        onAction={vi.fn()}
        onDismiss={vi.fn()}
        isOpen
        artifactPreview={null}
      />
    )

    expect(container.querySelector('.phase-decision-card-artifact')).toBeNull()
  })

  it('renders the fallback when artifactPreview has empty content', () => {
    renderCard({
      artifactPreview: { content: '', filePath: '/path/to/spec.md', totalLines: 0, isTruncated: false },
    })

    expect(screen.getByText(/artifact not yet available/i)).toBeInTheDocument()
    expect(document.querySelector('.phase-decision-card-artifact-pre')).toBeNull()
  })

  it('renders a collapsed details element with artifact content', () => {
    renderCard({
      artifactPreview: {
        content: '# Spec\nLine one\nLine two',
        filePath: '/path/to/spec.md',
        totalLines: 3,
        isTruncated: false,
      },
    })

    const details = document.querySelector('.phase-decision-card-artifact')
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute('open')
    expect(document.querySelector('.phase-decision-card-artifact-pre')).toBeInTheDocument()
    expect(screen.getByText(/# Spec/)).toBeInTheDocument()
  })

  it('shows truncation notice when isTruncated is true', () => {
    renderCard({
      artifactPreview: {
        content: 'first 200 lines…',
        filePath: '/path/to/plan.md',
        totalLines: 350,
        isTruncated: true,
      },
    })

    expect(screen.getByText(/350/)).toBeInTheDocument()
    expect(document.querySelector('.phase-decision-card-artifact-truncated')).toBeInTheDocument()
  })
})
