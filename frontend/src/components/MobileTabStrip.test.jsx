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

  it('close button on each tab works', () => {
    render(
      <MobileTabStrip
        tabs={mockTabs}
        activeTabId="tab-1"
        onTabSelect={mockOnTabSelect}
        onTabClose={mockOnTabClose}
        onNewTab={mockOnNewTab}
      />
    )
    const closeButtons = screen.getAllByRole('button', { name: /close/i })
    expect(closeButtons).toHaveLength(3)

    fireEvent.click(closeButtons[1]) // Close tab-2
    expect(mockOnTabClose).toHaveBeenCalledWith('tab-2')
  })

  it('renders nothing on desktop', () => {
    useMobileDetect.mockReturnValue({ isMobile: false, isDesktop: true })

    const { container } = render(
      <MobileTabStrip
        tabs={mockTabs}
        activeTabId="tab-1"
        onTabSelect={mockOnTabSelect}
        onTabClose={mockOnTabClose}
        onNewTab={mockOnNewTab}
      />
    )
    expect(container.firstChild).toBeNull()
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
