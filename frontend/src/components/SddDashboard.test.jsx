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
      binding={props.binding ?? null}
      verification={props.verification ?? null}
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
      collisionPrompt={props.collisionPrompt ?? null}
      onRequestWorktree={props.onRequestWorktree ?? vi.fn()}
      onDismissCollision={props.onDismissCollision ?? vi.fn()}
    />
  )
}

// ── Verification verdict chip (specs/012 US4) ────────────────────────────────

describe('SddDashboard verification verdict (specs/012 US4)', () => {
  it('shows a blocked verdict with its reason so the developer sees WHY a phase is stuck', () => {
    render(<DashboardFixture
      phases={SIX_PHASES}
      verification={{ decision: 'block', blockReason: 'no failing test was recorded before implementation (TDD Red→Green required)' }}
    />)
    const chip = screen.getByTestId('sdd-verification')
    expect(chip.textContent).toContain('Phase blocked')
    expect(chip.textContent).toContain('failing test')
  })

  it('shows a UX block reason verbatim', () => {
    render(<DashboardFixture
      phases={SIX_PHASES}
      verification={{ decision: 'block', blockReason: 'user-facing change needs a passing Playwright UX result (grep/curl/HTTP-status do not count)' }}
    />)
    expect(screen.getByTestId('sdd-verification').textContent).toContain('Playwright UX result')
  })

  it('renders no chip for a plain pass (no news is good news)', () => {
    render(<DashboardFixture phases={SIX_PHASES} verification={{ decision: 'pass' }} />)
    expect(screen.queryByTestId('sdd-verification')).toBeNull()
  })

  it('renders no chip when there is no verdict', () => {
    render(<DashboardFixture phases={SIX_PHASES} verification={null} />)
    expect(screen.queryByTestId('sdd-verification')).toBeNull()
  })

  it('surfaces an audited bypass so it is never silent', () => {
    render(<DashboardFixture phases={SIX_PHASES} verification={{ decision: 'pass', bypassed: true }} />)
    expect(screen.getByTestId('sdd-verification').textContent).toContain('bypassed')
  })
})

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

// ── Phase report card (specs/010 US3) ─────────────────────────────────────────

describe('SddDashboard report card', () => {
  const gateCard = (reportCard, artifactPreview = null) => ({
    type: 'SDD_PHASE_GATE',
    sessionId: 'sess-1',
    cardId: 'card-plan',
    phase: 'plan',
    actions: ['approve', 'reject', 'clarify'],
    reportCard,
    artifactPreview,
  })

  it('renders scope, files with +/- counts, and decisions as grouped bullets', () => {
    const card = gateCard({
      phase: 'plan',
      scope: '2 file(s) changed (+45/-2)',
      totalFiles: 2,
      filesTruncated: false,
      files: [
        { path: 'specs/feat/plan.md', added: 40, removed: 2 },
        { path: 'specs/feat/research.md', added: 5, removed: 0 },
      ],
      decisions: ['Chose retrofit over rewrite'],
      runCount: 1,
    })

    render(<DashboardFixture phases={SIX_PHASES} isCardOpen card={card} />)

    expect(screen.getByTestId('sdd-report-card')).toBeInTheDocument()
    expect(screen.getByText('2 file(s) changed (+45/-2)')).toBeInTheDocument()
    expect(screen.getByText('plan.md')).toBeInTheDocument()
    expect(screen.getByText('+40/-2')).toBeInTheDocument()
    expect(screen.getByText('Chose retrofit over rewrite')).toBeInTheDocument()
  })

  it('shows "+N more" when the file list is truncated', () => {
    const card = gateCard({
      phase: 'implement', scope: '10 file(s) changed (+100/-0)',
      totalFiles: 10, filesTruncated: true,
      files: Array.from({ length: 8 }, (_, i) => ({ path: `f${i}.go`, added: 10, removed: 0 })),
      decisions: [], runCount: 1,
    })

    render(<DashboardFixture phases={SIX_PHASES} isCardOpen card={card} />)

    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('shows magnitude-unavailable files and offers View full output', () => {
    const onFileOpen = vi.fn()
    const card = gateCard(
      {
        phase: 'plan', scope: '1 file(s) changed', totalFiles: 1, filesTruncated: false,
        files: [{ path: 'assets/logo.png', added: null, removed: null }],
        decisions: [], runCount: 1,
      },
      { filePath: 'specs/feat/plan.md', content: '# Plan', totalLines: 1 }
    )

    render(<DashboardFixture phases={SIX_PHASES} isCardOpen card={card} onFileOpen={onFileOpen} />)

    expect(screen.getByText('±?')).toBeInTheDocument()
    fireEvent.click(screen.getByText('View full output →'))
    expect(onFileOpen).toHaveBeenCalledWith({ path: 'specs/feat/plan.md', name: 'plan.md' })
  })

  it('does not render the report card when the gate has none', () => {
    render(<DashboardFixture phases={SIX_PHASES} isCardOpen card={gateCard(null)} />)
    expect(screen.queryByTestId('sdd-report-card')).not.toBeInTheDocument()
  })

  it('renders without crashing when files or decisions are null (Go nil-slice serialised as JSON null)', () => {
    // A Go nil []sddFileChange or []string serialises as JSON null, not [].
    // JS destructuring defaults only guard undefined, so null must be handled explicitly.
    const card = gateCard({
      phase: 'specify',
      scope: 'No files changed',
      totalFiles: 0,
      filesTruncated: false,
      files: null,      // the crash scenario: Go nil slice → JSON null
      decisions: null,  // same
      runCount: 1,
    })
    expect(() => render(<DashboardFixture phases={SIX_PHASES} isCardOpen card={card} />)).not.toThrow()
    expect(screen.getByTestId('sdd-report-card')).toBeInTheDocument()
  })
})

// ── Worktree binding indicator (specs/011, US3 / FR-007) ──────────────────────

describe('SddDashboard worktree indicator', () => {
  it('shows the worktree branch when the tab runs in an isolated worktree', () => {
    render(
      <DashboardFixture
        phases={SIX_PHASES}
        binding={{ isolated: true, branch: 'feature/011-worktree-concurrency', worktreePath: 'C:/repo/.forge/worktrees/wt1' }}
      />
    )
    const indicator = screen.getByTestId('sdd-worktree-indicator')
    expect(indicator).toBeInTheDocument()
    expect(indicator).toHaveTextContent('feature/011-worktree-concurrency')
  })

  it('renders no indicator on the main checkout (single-pipeline case unchanged, SC-007)', () => {
    render(<DashboardFixture phases={SIX_PHASES} binding={null} />)
    expect(screen.queryByTestId('sdd-worktree-indicator')).not.toBeInTheDocument()
  })

  it('renders no indicator when binding is present but not isolated', () => {
    render(<DashboardFixture phases={SIX_PHASES} binding={{ isolated: false }} />)
    expect(screen.queryByTestId('sdd-worktree-indicator')).not.toBeInTheDocument()
  })
})

// ── Recovery-first opt-in UI (specs/013 US3) ──────────────────────────────────

describe('SddDashboard recovery-first opt-in (specs/013)', () => {
  it('shows the "Isolate this tab" control on the main checkout (FR-007)', () => {
    render(<DashboardFixture phases={SIX_PHASES} binding={null} />)
    expect(screen.getByTestId('sdd-isolate-tab')).toBeInTheDocument()
  })

  it('hides the isolate control once the tab is already isolated (no double-isolate)', () => {
    render(<DashboardFixture phases={SIX_PHASES} binding={{ isolated: true, branch: 'forge/wt-x' }} />)
    expect(screen.queryByTestId('sdd-isolate-tab')).not.toBeInTheDocument()
  })

  it('clicking the isolate control calls onRequestWorktree (the explicit create path)', () => {
    const onRequestWorktree = vi.fn()
    render(<DashboardFixture phases={SIX_PHASES} binding={null} onRequestWorktree={onRequestWorktree} />)
    fireEvent.click(screen.getByTestId('sdd-isolate-tab'))
    expect(onRequestWorktree).toHaveBeenCalledTimes(1)
  })

  it('renders the collision offer when one is pending (FR-003)', () => {
    render(<DashboardFixture phases={SIX_PHASES} collisionPrompt={{ repoRoot: 'C:/repo', message: 'This repository already has an active SDD pipeline.' }} />)
    const prompt = screen.getByTestId('sdd-collision-prompt')
    expect(prompt).toBeInTheDocument()
    expect(prompt.textContent).toContain('active SDD pipeline')
  })

  it('renders no collision offer when none is pending', () => {
    render(<DashboardFixture phases={SIX_PHASES} collisionPrompt={null} />)
    expect(screen.queryByTestId('sdd-collision-prompt')).not.toBeInTheDocument()
  })

  it('confirming the offer calls onRequestWorktree; "Stay shared" calls onDismissCollision (C11)', () => {
    const onRequestWorktree = vi.fn()
    const onDismissCollision = vi.fn()
    render(
      <DashboardFixture
        phases={SIX_PHASES}
        collisionPrompt={{ repoRoot: 'C:/repo', message: 'collision' }}
        onRequestWorktree={onRequestWorktree}
        onDismissCollision={onDismissCollision}
      />
    )
    fireEvent.click(screen.getByTestId('sdd-collision-confirm'))
    expect(onRequestWorktree).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('sdd-collision-dismiss'))
    expect(onDismissCollision).toHaveBeenCalledTimes(1)
  })
})
