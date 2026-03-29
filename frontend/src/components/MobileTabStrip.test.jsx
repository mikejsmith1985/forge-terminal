import { render, screen, fireEvent } from '@testing-library/react'
import { MobileTabStrip } from './MobileTabStrip'

vi.mock('../hooks/useMobileDetect', () => ({
  useMobileDetect: vi.fn(() => ({
    isMobile: true, isDesktop: false,
  }))
}))

import { useMobileDetect } from '../hooks/useMobileDetect'

describe('MobileTabStrip', () => {
  const mockTabs = [
    { id: 'tab-1', label: 'Terminal 1' },
    { id: 'tab-2', label: 'Terminal 2' },
    { id: 'tab-3', label: 'Terminal 3' },
  ]
  const mockOnTabSelect = vi.fn()
  const mockOnTabClose = vi.fn()
  const mockOnNewTab = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useMobileDetect.mockReturnValue({ isMobile: true, isDesktop: false })
  })

  it('renders horizontal scrollable tab list', () => {
    render(
      <MobileTabStrip
        tabs={mockTabs}
        activeTabId="tab-1"
        onTabSelect={mockOnTabSelect}
        onTabClose={mockOnTabClose}
        onNewTab={mockOnNewTab}
      />
    )
    const strip = document.querySelector('.mobile-tab-strip')
    expect(strip).toBeInTheDocument()
    expect(screen.getByText('Terminal 1')).toBeInTheDocument()
    expect(screen.getByText('Terminal 2')).toBeInTheDocument()
    expect(screen.getByText('Terminal 3')).toBeInTheDocument()
  })

  it('active tab is visually distinct', () => {
    render(
      <MobileTabStrip
        tabs={mockTabs}
        activeTabId="tab-2"
        onTabSelect={mockOnTabSelect}
        onTabClose={mockOnTabClose}
        onNewTab={mockOnNewTab}
      />
    )
    const activeTab = screen.getByText('Terminal 2').closest('.mobile-tab')
    expect(activeTab).toHaveClass('active')

    const inactiveTab = screen.getByText('Terminal 1').closest('.mobile-tab')
    expect(inactiveTab).not.toHaveClass('active')
  })

  it('tapping tab fires onTabSelect', () => {
    render(
      <MobileTabStrip
        tabs={mockTabs}
        activeTabId="tab-1"
        onTabSelect={mockOnTabSelect}
        onTabClose={mockOnTabClose}
        onNewTab={mockOnNewTab}
      />
    )
    fireEvent.click(screen.getByText('Terminal 2'))
    expect(mockOnTabSelect).toHaveBeenCalledWith('tab-2')
  })

  it('new tab button works', () => {
    render(
      <MobileTabStrip
        tabs={mockTabs}
        activeTabId="tab-1"
        onTabSelect={mockOnTabSelect}
        onTabClose={mockOnTabClose}
        onNewTab={mockOnNewTab}
      />
    )
    const newTabBtn = screen.getByRole('button', { name: /new tab/i })
    fireEvent.click(newTabBtn)
    expect(mockOnNewTab).toHaveBeenCalled()
  })

  it('close button only appears on active tab', () => {
    render(
      <MobileTabStrip
        tabs={mockTabs}
        activeTabId="tab-1"
        onTabSelect={mockOnTabSelect}
        onTabClose={mockOnTabClose}
        onNewTab={mockOnNewTab}
      />
    )
    // Only the active tab has a close button
    const closeButtons = screen.getAllByRole('button', { name: /close/i })
    expect(closeButtons).toHaveLength(1)

    fireEvent.click(closeButtons[0]) // Close tab-1 (the active one)
    expect(mockOnTabClose).toHaveBeenCalledWith('tab-1')
  })

  it('switching tabs disables close button briefly to prevent ghost-clicks', () => {
    render(
      <MobileTabStrip
        tabs={mockTabs}
        activeTabId="tab-1"
        onTabSelect={mockOnTabSelect}
        onTabClose={mockOnTabClose}
        onNewTab={mockOnNewTab}
      />
    )
    // Clicking an inactive tab calls onTabSelect
    fireEvent.click(screen.getByText('Terminal 2'))
    expect(mockOnTabSelect).toHaveBeenCalledWith('tab-2')
    // onTabClose must NOT have been triggered
    expect(mockOnTabClose).not.toHaveBeenCalled()
  })

  it('handles empty tabs array', () => {
    render(
      <MobileTabStrip
        tabs={[]}
        activeTabId=""
        onTabSelect={mockOnTabSelect}
        onTabClose={mockOnTabClose}
        onNewTab={mockOnNewTab}
      />
    )
    const strip = document.querySelector('.mobile-tab-strip')
    expect(strip).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new tab/i })).toBeInTheDocument()
  })
})
