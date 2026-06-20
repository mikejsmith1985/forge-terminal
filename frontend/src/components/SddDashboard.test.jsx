// Unit tests for SddDashboard and ClarifyModal (spec-006).
// Covers: smoke render, idle state, phase rail cells, decision bar, clarify flow, detail strip.
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SddDashboard, { ClarifyModal } from './SddDashboard'

// Minimal phase fixture matching PhaseStatusEntry shape.
const makePhase = (overrides = {}) => ({
  phase: 'plan',
  displayStatus: 'pending',
  runCount: 1,
  artifactPath: '',
  ...overrides,
})

const SIX_PHASES = [
  makePhase({ phase: 'specify',  displayStatus: 'complete', artifactPath: 'specs/feat/spec.md' }),
  makePhase({ phase: 'clarify',  displayStatus: 'complete' }),
  makePhase({ phase: 'plan',     displayStatus: 'awaiting-decision', runCount: 1 }),
  makePhase({ phase: 'tasks',    displayStatus: 'pending' }),
  makePhase({ phase: 'validate', displayStatus: 'pending' }),
  makePhase({ phase: 'implement',displayStatus: 'pending' }),
]

// Helper: wrap phaseSummaries as a ref so tests mimic the hook.
function DashboardFixture(props) {
  const phaseSummaries = useRef(props.summaries ?? {})
  return (
    <SddDashboard
      phases={props.phases ?? []}
      featureName={props.featureName ?? ''}
      phaseSummaries={phaseSummaries}
      isCardOpen={props.isCardOpen ?? false}
      card={props.card ?? null}
      decisionError={props.decisionError ?? null}
      isSubmitting={props.isSubmitting ?? false}
      isHookInstalled={props.isHookInstalled ?? true}
      onAction={props.onAction ?? vi.fn()}
      onDismiss={props.onDismiss ?? vi.fn()}
      onFileOpen={props.onFileOpen ?? vi.fn()}
      onAwaitingPhaseClick={props.onAwaitingPhaseClick ?? vi.fn()}
    />
  )
}

// ── Smoke test ───────────────────────────────────────────────────────────────

describe('SddDashboard', () => {
  it('renders without crashing when passed no props', () => {
    const phaseSummaries = { current: {} }
    render(
      <SddDashboard
        phases={[]}
        featureName=""
        phaseSummaries={phaseSummaries}
        isCardOpen={false}
        card={null}
        decisionError={null}
        isSubmitting={false}
        onAction={vi.fn()}
        onDismiss={vi.fn()}
        onFileOpen={vi.fn()}
      />
    )
    expect(screen.getByTestId('sdd-dashboard')).toBeInTheDocument()
  })

  // ── Idle state ────────────────────────────────────────────────────────────

  it('shows idle row when phases is empty', () => {
    const { container } = render(<DashboardFixture phases={[]} />)
    // The idle rail row has its own BEM class distinct from ActionPromptStrip.
    expect(container.querySelector('.sdd-dashboard__idle-row')).toBeInTheDocument()
  })

  it('shows "No active feature" in header when featureName is empty', () => {
    render(<DashboardFixture phases={[]} featureName="" />)
    expect(screen.getAllByText(/No active feature/).length).toBeGreaterThan(0)
  })

  it('shows the feature name in the header when provided', () => {
    render(<DashboardFixture phases={SIX_PHASES} featureName="auth-refresh" />)
    expect(screen.getByText('auth-refresh')).toBeInTheDocument()
  })

  // ── Phase rail cells ─────────────────────────────────────────────────────

  it('renders all 6 phase cells when phases are provided', () => {
    render(<DashboardFixture phases={SIX_PHASES} />)
    expect(screen.getByText('specify')).toBeInTheDocument()
    expect(screen.getByText('clarify')).toBeInTheDocument()
    expect(screen.getByText('plan')).toBeInTheDocument()
    expect(screen.getByText('tasks')).toBeInTheDocument()
    expect(screen.getByText('validate')).toBeInTheDocument()
    expect(screen.getByText('implement')).toBeInTheDocument()
  })

  it('shows ×N badge on a phase with runCount >= 2', () => {
    const phases = [makePhase({ phase: 'plan', displayStatus: 'iterating', runCount: 3 })]
    render(<DashboardFixture phases={phases} />)
    expect(screen.getByText('×3')).toBeInTheDocument()
  })

  it('does not show ×N badge when runCount is 1', () => {
    const phases = [makePhase({ phase: 'plan', displayStatus: 'awaiting-decision', runCount: 1 })]
    render(<DashboardFixture phases={phases} />)
    expect(screen.queryByText(/×/)).not.toBeInTheDocument()
  })

  it('clicking a complete cell toggles the detail strip open', () => {
    const summary = { headline: 'Spec ready', producedItems: ['spec.md'], flags: [] }
    render(<DashboardFixture phases={SIX_PHASES} summaries={{ specify: summary }} />)

    // specify cell is complete — clicking it should show the detail strip.
    const specifyCell = screen.getByRole('button', { name: /specify/ })
    fireEvent.click(specifyCell)

    expect(screen.getByText('Spec ready')).toBeInTheDocument()
    expect(screen.getByText('spec.md')).toBeInTheDocument()
  })

  it('clicking an already-selected complete cell collapses the detail strip', () => {
    const summary = { headline: 'Spec ready', producedItems: ['spec.md'], flags: [] }
    render(<DashboardFixture phases={SIX_PHASES} summaries={{ specify: summary }} />)

    const specifyCell = screen.getByRole('button', { name: /specify/ })
    fireEvent.click(specifyCell) // open
    fireEvent.click(specifyCell) // close

    expect(screen.queryByText('Spec ready')).not.toBeInTheDocument()
  })

  it('pending cells are not interactive (no role=button)', () => {
    const phases = [makePhase({ phase: 'validate', displayStatus: 'pending' })]
    render(<DashboardFixture phases={phases} />)
    // The pending cell should have no button role.
    expect(screen.queryByRole('button', { name: /validate/ })).not.toBeInTheDocument()
  })

  it('awaiting-decision cell is interactive (has role=button)', () => {
    // A phase with a pending gate must be clickable so the developer can demand-pull
    // the gate card when the WebSocket event was missed (e.g. after reconnection).
    const phases = [makePhase({ phase: 'plan', displayStatus: 'awaiting-decision' })]
    render(<DashboardFixture phases={phases} />)
    expect(screen.getByRole('button', { name: /plan/ })).toBeInTheDocument()
  })

  it('clicking an awaiting-decision cell calls onAwaitingPhaseClick', () => {
    const onAwaitingPhaseClick = vi.fn()
    render(
      <DashboardFixture
        phases={SIX_PHASES}
        onAwaitingPhaseClick={onAwaitingPhaseClick}
      />
    )
    // plan is the awaiting-decision phase in SIX_PHASES.
    const planCell = screen.getByRole('button', { name: /plan/ })
    fireEvent.click(planCell)

    expect(onAwaitingPhaseClick).toHaveBeenCalledTimes(1)
  })

  it('clicking an awaiting-decision cell does not open the detail strip', () => {
    // The detail strip shows artifacts for completed phases. Clicking an awaiting
    // phase should trigger the gate-card demand pull, not open an artifact strip.
    const onAwaitingPhaseClick = vi.fn()
    render(
      <DashboardFixture
        phases={SIX_PHASES}
        summaries={{ plan: { headline: 'Plan ready', producedItems: [], flags: [] } }}
        onAwaitingPhaseClick={onAwaitingPhaseClick}
      />
    )
    const planCell = screen.getByRole('button', { name: /plan/ })
    fireEvent.click(planCell)

    expect(screen.queryByText('Plan ready')).not.toBeInTheDocument()
  })

  // ── Detail strip ─────────────────────────────────────────────────────────

  it('shows No artifacts produced when producedItems is empty', () => {
    const summary = { headline: 'Done', producedItems: [], flags: [] }
    render(<DashboardFixture phases={SIX_PHASES} summaries={{ specify: summary }} />)

    const specifyCell = screen.getByRole('button', { name: /specify/ })
    fireEvent.click(specifyCell)

    expect(screen.getByText('No artifacts produced')).toBeInTheDocument()
  })

  it('calls onFileOpen with the artifact when "View artifact" is clicked', () => {
    const onFileOpen = vi.fn()
    const summary = { headline: 'Spec ready', producedItems: ['spec.md'], flags: [] }
    render(
      <DashboardFixture
        phases={SIX_PHASES}
        summaries={{ specify: summary }}
        onFileOpen={onFileOpen}
      />
    )
    const specifyCell = screen.getByRole('button', { name: /specify/ })
    fireEvent.click(specifyCell)

    const viewBtn = screen.getByText('View artifact →')
    fireEvent.click(viewBtn)

    expect(onFileOpen).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'specs/feat/spec.md' })
    )
  })

  // ── Decision bar ─────────────────────────────────────────────────────────

  it('does not render the decision bar when isCardOpen is false', () => {
    render(<DashboardFixture phases={SIX_PHASES} isCardOpen={false} card={null} />)
    expect(screen.queryByText('Approve')).not.toBeInTheDocument()
  })

  it('renders Approve, Reject, Clarify buttons when isCardOpen is true', () => {
    const card = { phase: 'plan', cardId: 'c1', sessionId: 's1', actions: ['approve', 'reject', 'clarify'] }
    render(<DashboardFixture phases={SIX_PHASES} isCardOpen card={card} />)
    expect(screen.getByText('Approve')).toBeInTheDocument()
    expect(screen.getByText('Reject')).toBeInTheDocument()
    expect(screen.getByText('Clarify')).toBeInTheDocument()
  })

  it('calls onAction("approve") when Approve is clicked', () => {
    const onAction = vi.fn()
    const card = { phase: 'plan', cardId: 'c1', sessionId: 's1', actions: ['approve', 'reject', 'clarify'] }
    render(<DashboardFixture phases={SIX_PHASES} isCardOpen card={card} onAction={onAction} />)

    fireEvent.click(screen.getByText('Approve'))

    expect(onAction).toHaveBeenCalledWith('approve')
  })

  it('calls onAction("reject") when Reject is clicked', () => {
    const onAction = vi.fn()
    const card = { phase: 'plan', cardId: 'c1', sessionId: 's1', actions: ['approve', 'reject', 'clarify'] }
    render(<DashboardFixture phases={SIX_PHASES} isCardOpen card={card} onAction={onAction} />)

    fireEvent.click(screen.getByText('Reject'))

    expect(onAction).toHaveBeenCalledWith('reject')
  })

  it('disables decision buttons while isSubmitting', () => {
    const card = { phase: 'plan', cardId: 'c1', sessionId: 's1', actions: ['approve', 'reject', 'clarify'] }
    render(<DashboardFixture phases={SIX_PHASES} isCardOpen card={card} isSubmitting />)

    expect(screen.getByText('Approve').closest('button')).toBeDisabled()
    expect(screen.getByText('Reject').closest('button')).toBeDisabled()
  })

  it('shows decisionError when provided', () => {
    const card = { phase: 'plan', cardId: 'c1', sessionId: 's1', actions: ['approve'] }
    render(
      <DashboardFixture
        phases={SIX_PHASES}
        isCardOpen
        card={card}
        decisionError="Decision request failed: 500"
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('500')
  })

  // ── Clarify flow ─────────────────────────────────────────────────────────

  it('Clarify button opens the ClarifyModal dialog', () => {
    const card = { phase: 'plan', cardId: 'c1', sessionId: 's1', actions: ['clarify'] }
    render(<DashboardFixture phases={SIX_PHASES} isCardOpen card={card} />)

    fireEvent.click(screen.getByText('Clarify'))

    // The <dialog> element should be present in the DOM.
    expect(document.querySelector('.sdd-dashboard__clarify-dialog')).toBeInTheDocument()
  })
})

// ── ClarifyModal unit tests ───────────────────────────────────────────────────

describe('ClarifyModal', () => {
  // jsdom does not implement showModal/close on <dialog>.
  // The showModal stub also sets `open` so the dialog's children become accessible.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function() {
      this.setAttribute('open', '')
    })
    HTMLDialogElement.prototype.close = vi.fn(function() {
      this.removeAttribute('open')
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a textarea and disabled Confirm when closed (isOpen=false)', () => {
    render(
      <ClarifyModal isOpen={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(document.querySelector('.sdd-dashboard__clarify-dialog')).toBeInTheDocument()
    expect(screen.getByText('Confirm').closest('button')).toBeDisabled()
  })

  it('Confirm button becomes enabled once text is entered', () => {
    render(
      <ClarifyModal isOpen onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Narrow to auth module' } })

    expect(screen.getByText('Confirm').closest('button')).not.toBeDisabled()
  })

  it('calls onConfirm with the trimmed steer text when Confirm is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ClarifyModal isOpen onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '  Narrow scope  ' } })
    fireEvent.click(screen.getByText('Confirm'))

    expect(onConfirm).toHaveBeenCalledWith('Narrow scope')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(
      <ClarifyModal isOpen onConfirm={vi.fn()} onCancel={onCancel} />
    )
    fireEvent.click(screen.getByText('Cancel'))

    expect(onCancel).toHaveBeenCalled()
  })

  it('does not call onConfirm when text is blank', () => {
    const onConfirm = vi.fn()
    render(
      <ClarifyModal isOpen onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    // Confirm button is disabled so click won't fire onConfirm.
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '   ' } })
    expect(screen.getByText('Confirm').closest('button')).toBeDisabled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls showModal when isOpen changes from false to true', () => {
    const { rerender } = render(
      <ClarifyModal isOpen={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled()

    rerender(<ClarifyModal isOpen onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
  })

  it('calls close() when isOpen changes to false', () => {
    const { rerender } = render(
      <ClarifyModal isOpen onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    rerender(<ClarifyModal isOpen={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
  })
})

// ── HookInstallBanner tests ───────────────────────────────────────────────────

describe('HookInstallBanner', () => {
  it('is hidden when isHookInstalled=true (default)', () => {
    render(<DashboardFixture phases={[]} isHookInstalled={true} />)
    expect(screen.queryByTestId('hook-install-banner')).toBeNull()
  })

  it('is visible when isHookInstalled=false', () => {
    render(<DashboardFixture phases={[]} isHookInstalled={false} />)
    expect(screen.getByTestId('hook-install-banner')).toBeTruthy()
    expect(screen.getByText(/install-sdd-hook\.ps1/i)).toBeTruthy()
  })

  it('disappears after the dismiss button is clicked', () => {
    render(<DashboardFixture phases={[]} isHookInstalled={false} />)
    const dismissBtn = screen.getByLabelText('Dismiss hook install banner')
    fireEvent.click(dismissBtn)
    expect(screen.queryByTestId('hook-install-banner')).toBeNull()
  })

  it('copy button text resets to "Copy command" after 2s', async () => {
    // Mock clipboard to avoid jsdom permission errors.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<DashboardFixture phases={[]} isHookInstalled={false} />)
    const copyBtn = screen.getByText('Copy command')
    fireEvent.click(copyBtn)

    await waitFor(() => expect(screen.getByText('Copied!')).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith('.\\scripts\\install-sdd-hook.ps1')
  })
})
