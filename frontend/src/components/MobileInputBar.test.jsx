import { render, screen, fireEvent } from '@testing-library/react'
import { MobileInputBar } from './MobileInputBar'

// Mock useMobileDetect
vi.mock('../hooks/useMobileDetect', () => ({
  useMobileDetect: vi.fn(() => ({
    isMobile: true, isDesktop: false, isKeyboardOpen: false,
    viewportHeight: 667, hasTouch: true,
  }))
}))

import { useMobileDetect } from '../hooks/useMobileDetect'

describe('MobileInputBar', () => {
  const mockOnSubmit = vi.fn()
  const mockOnSpecialKey = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useMobileDetect.mockReturnValue({
      isMobile: true, isDesktop: false, isKeyboardOpen: false,
      viewportHeight: 667, hasTouch: true,
    })
  })

  it('renders floating input field on mobile', () => {
    render(<MobileInputBar onSubmit={mockOnSubmit} onSpecialKey={mockOnSpecialKey} />)
    const input = screen.getByPlaceholderText(/command/i)
    expect(input).toBeInTheDocument()
  })

  it('sends text to onSubmit on Enter', () => {
    render(<MobileInputBar onSubmit={mockOnSubmit} onSpecialKey={mockOnSpecialKey} />)
    const input = screen.getByPlaceholderText(/command/i)
    
    fireEvent.change(input, { target: { value: 'ls -la' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    
    expect(mockOnSubmit).toHaveBeenCalledWith('ls -la')
  })

  it('clears input after submit', () => {
    render(<MobileInputBar onSubmit={mockOnSubmit} onSpecialKey={mockOnSpecialKey} />)
    const input = screen.getByPlaceholderText(/command/i)
    
    fireEvent.change(input, { target: { value: 'ls -la' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    
    expect(input.value).toBe('')
  })

  it('renders special key buttons', () => {
    render(<MobileInputBar onSubmit={mockOnSubmit} onSpecialKey={mockOnSpecialKey} />)
    
    expect(screen.getByRole('button', { name: /tab/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /esc/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ctrl/i })).toBeInTheDocument()
  })

  it('special key buttons fire correct events', () => {
    render(<MobileInputBar onSubmit={mockOnSubmit} onSpecialKey={mockOnSpecialKey} />)
    
    fireEvent.click(screen.getByRole('button', { name: /tab/i }))
    expect(mockOnSpecialKey).toHaveBeenCalledWith('Tab')
    
    fireEvent.click(screen.getByRole('button', { name: /esc/i }))
    expect(mockOnSpecialKey).toHaveBeenCalledWith('Escape')
  })

  it('Ctrl modifier + single char sends control sequence', () => {
    render(<MobileInputBar onSubmit={mockOnSubmit} onSpecialKey={mockOnSpecialKey} />)
    
    const ctrlBtn = screen.getByRole('button', { name: /ctrl/i })
    fireEvent.click(ctrlBtn)
    expect(ctrlBtn).toHaveClass('active')
    
    // Type 'c' while Ctrl is active => Ctrl+c
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'c' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    
    expect(mockOnSpecialKey).toHaveBeenCalledWith('Ctrl+c')
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('Ctrl modifier + multi-char text submits normally and resets Ctrl', () => {
    render(<MobileInputBar onSubmit={mockOnSubmit} onSpecialKey={mockOnSpecialKey} />)
    
    const ctrlBtn = screen.getByRole('button', { name: /ctrl/i })
    fireEvent.click(ctrlBtn)
    expect(ctrlBtn).toHaveClass('active')
    
    // Type multi-char while Ctrl is accidentally active => should submit normally
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'hello world' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    
    expect(mockOnSubmit).toHaveBeenCalledWith('hello world')
    expect(mockOnSpecialKey).not.toHaveBeenCalled()
    // Ctrl should have been reset
    expect(ctrlBtn).not.toHaveClass('active')
  })

  it('arrow key buttons fire events', () => {
    render(<MobileInputBar onSubmit={mockOnSubmit} onSpecialKey={mockOnSpecialKey} />)
    
    fireEvent.click(screen.getByRole('button', { name: /up/i }))
    expect(mockOnSpecialKey).toHaveBeenCalledWith('ArrowUp')
    
    fireEvent.click(screen.getByRole('button', { name: /down/i }))
    expect(mockOnSpecialKey).toHaveBeenCalledWith('ArrowDown')
  })

  it('always renders (visibility controlled by parent layout)', () => {
    useMobileDetect.mockReturnValue({
      isMobile: false, isDesktop: true, isKeyboardOpen: false,
      viewportHeight: 1080, hasTouch: false,
    })
    
    const { container } = render(
      <MobileInputBar onSubmit={mockOnSubmit} onSpecialKey={mockOnSpecialKey} />
    )
    // MobileInputBar always renders; the parent decides whether to show it
    expect(container.firstChild).not.toBeNull()
  })
})
