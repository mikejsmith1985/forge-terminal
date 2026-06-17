// Unit tests for SddPipelinePanel.
// Tests verify rendering, status icons, collapse toggle, awaiting-decision badge, and
// spec-005 additions: iterating icon, six-status BEM classes, ×N counter, idle row.
import { render, screen, fireEvent, within } from '@testing-library/react'
import SddPipelinePanel from './SddPipelinePanel'

const PHASE_NAMES = ['specify', 'clarify', 'plan', 'validate', 'implement']

function makePhases(overrides = {}, runCountOverrides = {}) {
  return PHASE_NAMES.map((name, idx) => ({
    phase: name,
    order: idx + 1,
    displayStatus: overrides[name] ?? 'pending',
    artifactPath: '',
    decidedAt: null,
    runCount: runCountOverrides[name] ?? 0,
  }))
}

describe('SddPipelinePanel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders nothing when isVisible is false', () => {
    const { container } = render(<SddPipelinePanel phases={[]} isVisible={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when phases array is empty and isVisible is false', () => {
    const { container } = render(<SddPipelinePanel phases={[]} isVisible={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders 5 phase rows when given a full phases array', () => {
    const phases = makePhases()
    const { container } = render(<SddPipelinePanel phases={phases} isVisible={true} />)
    // Scope to the rows container so the regex doesn't match the action prompt footer.
    const rows = container.querySelector('.sdd-pipeline-panel__rows')
    for (const name of PHASE_NAMES) {
      expect(within(rows).getByText(new RegExp(name, 'i'))).toBeInTheDocument()
    }
  })

  it('shows the pending icon (◌) for pending phases', () => {
    const phases = makePhases()
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    // 5 pending phases → 5 ◌ icons
    const icons = screen.getAllByText('◌')
    expect(icons.length).toBe(5)
  })

  it('shows the complete icon (✓) for complete phases', () => {
    const phases = makePhases({ specify: 'complete', clarify: 'complete' })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getAllByText('✓').length).toBe(2)
  })

  it('shows the awaiting-decision icon (⏳) for awaiting-decision phases', () => {
    const phases = makePhases({ plan: 'awaiting-decision' })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('⏳')).toBeInTheDocument()
  })

  it('shows the rejected icon (⚠) for rejected phases', () => {
    const phases = makePhases({ clarify: 'rejected' })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('⚠')).toBeInTheDocument()
  })

  it('shows the active icon (⟳) for active phases', () => {
    const phases = makePhases({ plan: 'active' })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('⟳')).toBeInTheDocument()
  })

  it('collapses to a header row when the toggle button is clicked', () => {
    const phases = makePhases()
    const { container } = render(<SddPipelinePanel phases={phases} isVisible={true} />)

    // Expanded by default — phase rows visible (scope to rows to avoid matching action prompt)
    const rows = container.querySelector('.sdd-pipeline-panel__rows')
    for (const name of PHASE_NAMES) {
      expect(within(rows).getByText(new RegExp(name, 'i'))).toBeInTheDocument()
    }

    const toggle = screen.getByRole('button', { name: /pipeline|sdd|collapse|phases/i })
    fireEvent.click(toggle)

    // After collapse, the rows container is gone; phase name spans are not rendered.
    expect(container.querySelector('.sdd-pipeline-panel__rows')).toBeNull()
  })

  it('shows a badge on the toggle when a phase is awaiting-decision while collapsed', () => {
    const phases = makePhases({ plan: 'awaiting-decision' })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)

    // Collapse the panel
    const toggle = screen.getByRole('button', { name: /pipeline|sdd|collapse|phases/i })
    fireEvent.click(toggle)

    // A badge (count or indicator) should be visible in the collapsed header
    expect(screen.getByTestId('sdd-panel-badge')).toBeInTheDocument()
  })

  it('persists collapsed state to localStorage', () => {
    const phases = makePhases()
    const { unmount } = render(<SddPipelinePanel phases={phases} isVisible={true} />)
    const toggle = screen.getByRole('button', { name: /pipeline|sdd|collapse|phases/i })
    fireEvent.click(toggle)
    unmount()

    expect(localStorage.getItem('sdd_panel_collapsed')).toBe('true')
  })

  // ── T007: spec-005 additions ─────────────────────────────────────────────

  it('(a) shows the iterating icon (↻) for iterating phases', () => {
    const phases = makePhases({ plan: 'iterating' })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('↻')).toBeInTheDocument()
  })

  it('(b) applies the correct BEM modifier class for all six displayStatus values', () => {
    const allStatuses = ['pending', 'active', 'awaiting-decision', 'complete', 'rejected', 'iterating']
    allStatuses.forEach((status) => {
      const phases = [{ phase: 'specify', order: 1, displayStatus: status, artifactPath: '', decidedAt: null, runCount: 0 }]
      const { container, unmount } = render(<SddPipelinePanel phases={phases} isVisible={true} />)
      const row = container.querySelector(`.sdd-pipeline-panel__row--${status}`)
      expect(row, `expected BEM class for status "${status}"`).not.toBeNull()
      unmount()
    })
  })

  it('(c) shows a different icon after displayStatus changes (class swap visible)', () => {
    const phases = makePhases({ specify: 'active' })
    const { rerender } = render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('⟳')).toBeInTheDocument()

    const updatedPhases = makePhases({ specify: 'complete' })
    rerender(<SddPipelinePanel phases={updatedPhases} isVisible={true} />)
    expect(screen.queryByText('⟳')).not.toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('(d) renders ? icon and --unknown class for an unrecognised displayStatus', () => {
    const phases = [{ phase: 'specify', order: 1, displayStatus: 'some-future-status', artifactPath: '', decidedAt: null, runCount: 0 }]
    const { container } = render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('?')).toBeInTheDocument()
    expect(container.querySelector('.sdd-pipeline-panel__row--unknown')).not.toBeNull()
  })

  // ── T009b: FR-010 idle indicator ─────────────────────────────────────────

  it('renders a compact idle row when phases is empty and isVisible is true', () => {
    render(<SddPipelinePanel phases={[]} isVisible={true} />)
    expect(screen.getByText(/no active feature/i)).toBeInTheDocument()
  })

  it('still renders nothing when isVisible is false even with empty phases', () => {
    const { container } = render(<SddPipelinePanel phases={[]} isVisible={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  // ── T015: ActionPromptStrip in panel footer ───────────────────────────────

  it('renders an action-prompt-strip in the panel footer', () => {
    const phases = makePhases({ specify: 'active' })
    const { container } = render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(container.querySelector('.action-prompt-strip')).not.toBeNull()
  })

  it('shows the running prompt when a phase is active', () => {
    const phases = makePhases({ clarify: 'active' })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('Clarify is running…')).toBeInTheDocument()
  })

  it('shows start prompt when all phases are pending (no pipeline started)', () => {
    const phases = makePhases()
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('Run /speckit-specify to continue.')).toBeInTheDocument()
  })

  // ── T017: US3 ×N counter tests ────────────────────────────────────────────

  it('renders no counter when runCount is 0', () => {
    const phases = makePhases({ specify: 'complete' }, { specify: 0 })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.queryByText(/×/)).not.toBeInTheDocument()
  })

  it('renders no counter when runCount is 1', () => {
    const phases = makePhases({ specify: 'complete' }, { specify: 1 })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.queryByText(/×/)).not.toBeInTheDocument()
  })

  it('renders ×2 counter when runCount is 2', () => {
    const phases = makePhases({ specify: 'complete' }, { specify: 2 })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('×2')).toBeInTheDocument()
  })

  it('renders ×3 counter when runCount is 3', () => {
    const phases = makePhases({ specify: 'complete' }, { specify: 3 })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('×3')).toBeInTheDocument()
  })

  it('renders the counter in a separate span with the run-count class', () => {
    const phases = makePhases({ specify: 'complete' }, { specify: 2 })
    const { container } = render(<SddPipelinePanel phases={phases} isVisible={true} />)
    const counter = container.querySelector('.sdd-pipeline-panel__run-count')
    expect(counter).not.toBeNull()
    expect(counter?.textContent).toBe('×2')
  })
})
