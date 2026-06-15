// Unit tests for SddPipelinePanel (T018 — Red phase: fails until T013 creates the component).
// Tests verify rendering, status icons, collapse toggle, and awaiting-decision badge behaviour.
import { render, screen, fireEvent } from '@testing-library/react'
import SddPipelinePanel from './SddPipelinePanel'

const PHASE_NAMES = ['specify', 'clarify', 'plan', 'validate', 'implement']

function makePhases(overrides = {}) {
  return PHASE_NAMES.map((name, idx) => ({
    phase: name,
    order: idx + 1,
    displayStatus: overrides[name] ?? 'pending',
    artifactPath: '',
    decidedAt: null,
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
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    for (const name of PHASE_NAMES) {
      expect(screen.getByText(new RegExp(name, 'i'))).toBeInTheDocument()
    }
  })

  it('shows the pending icon (·) for pending phases', () => {
    const phases = makePhases()
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    const icons = screen.getAllByText('·')
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

  it('shows the rejected icon (✗) for rejected phases', () => {
    const phases = makePhases({ clarify: 'rejected' })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('✗')).toBeInTheDocument()
  })

  it('shows the active icon (◌) for active phases', () => {
    const phases = makePhases({ plan: 'active' })
    render(<SddPipelinePanel phases={phases} isVisible={true} />)
    expect(screen.getByText('◌')).toBeInTheDocument()
  })

  it('collapses to a header row when the toggle button is clicked', () => {
    const phases = makePhases()
    render(<SddPipelinePanel phases={phases} isVisible={true} />)

    // Expanded by default — phase rows visible
    for (const name of PHASE_NAMES) {
      expect(screen.getByText(new RegExp(name, 'i'))).toBeInTheDocument()
    }

    const toggle = screen.getByRole('button', { name: /pipeline|sdd|collapse|phases/i })
    fireEvent.click(toggle)

    // After collapse, individual phase names should not be in the document
    expect(screen.queryByText('specify')).not.toBeInTheDocument()
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
})
