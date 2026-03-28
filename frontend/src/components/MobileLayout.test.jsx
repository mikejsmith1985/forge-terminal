import { render, screen, fireEvent } from '@testing-library/react'
import { MobileLayout } from './MobileLayout'

vi.mock('../hooks/useMobileDetect', () => ({
  useMobileDetect: vi.fn(() => ({
    isMobile: true,
    isTablet: false,
    isDesktop: false,
    hasTouch: true,
    viewportWidth: 375,
    viewportHeight: 667,
    isKeyboardOpen: false,
  }))
}))

import { useMobileDetect } from '../hooks/useMobileDetect'

describe('MobileLayout', () => {
  beforeEach(() => {
    useMobileDetect.mockReturnValue({
      isMobile: true, isTablet: false, isDesktop: false,
      hasTouch: true, viewportWidth: 375, viewportHeight: 667,
      isKeyboardOpen: false,
    })
  })

  it('renders sidebar as drawer on mobile', () => {
    render(
      <MobileLayout
        sidebar={<div data-testid="sidebar-content">Sidebar</div>}
        main={<div data-testid="main-content">Main</div>}
      />
    )
    const drawer = document.querySelector('.mobile-sidebar-drawer')
    expect(drawer).toBeInTheDocument()
  })

  it('sidebar hidden by default on mobile', () => {
    render(
      <MobileLayout
        sidebar={<div data-testid="sidebar-content">Sidebar</div>}
        main={<div data-testid="main-content">Main</div>}
      />
    )
    const drawer = document.querySelector('.mobile-sidebar-drawer')
    expect(drawer).not.toHaveClass('open')
  })

  it('sidebar toggleable via hamburger button', () => {
    render(
      <MobileLayout
        sidebar={<div data-testid="sidebar-content">Sidebar</div>}
        main={<div data-testid="main-content">Main</div>}
      />
    )
    const hamburger = screen.getByRole('button', { name: /menu/i })
    expect(hamburger).toBeInTheDocument()

    fireEvent.click(hamburger)
    const drawer = document.querySelector('.mobile-sidebar-drawer')
    expect(drawer).toHaveClass('open')

    fireEvent.click(hamburger)
    expect(drawer).not.toHaveClass('open')
  })

  it('terminal fills full width on mobile', () => {
    render(
      <MobileLayout
        sidebar={<div>Sidebar</div>}
        main={<div data-testid="main-content">Main</div>}
      />
    )
    const mainContainer = document.querySelector('.mobile-main-content')
    expect(mainContainer).toBeInTheDocument()
    expect(mainContainer).toHaveClass('mobile-main-content')
  })

  it('renders normally on desktop', () => {
    useMobileDetect.mockReturnValue({
      isMobile: false, isTablet: false, isDesktop: true,
      hasTouch: false, viewportWidth: 1920, viewportHeight: 1080,
      isKeyboardOpen: false,
    })

    render(
      <MobileLayout
        sidebar={<div data-testid="sidebar-content">Sidebar</div>}
        main={<div data-testid="main-content">Main</div>}
      />
    )
    const drawer = document.querySelector('.mobile-sidebar-drawer')
    expect(drawer).not.toBeInTheDocument()
    expect(screen.getByTestId('sidebar-content')).toBeInTheDocument()
    expect(screen.getByTestId('main-content')).toBeInTheDocument()
  })

  it('overlay closes sidebar when clicked', () => {
    render(
      <MobileLayout
        sidebar={<div>Sidebar</div>}
        main={<div>Main</div>}
      />
    )
    const hamburger = screen.getByRole('button', { name: /menu/i })
    fireEvent.click(hamburger)

    const overlay = document.querySelector('.mobile-sidebar-overlay')
    expect(overlay).toBeInTheDocument()
    fireEvent.click(overlay)

    const drawer = document.querySelector('.mobile-sidebar-drawer')
    expect(drawer).not.toHaveClass('open')
  })
})
