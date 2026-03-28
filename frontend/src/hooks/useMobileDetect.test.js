import { renderHook, act } from '@testing-library/react'
import { useMobileDetect } from './useMobileDetect'

describe('useMobileDetect', () => {
  const originalUserAgent = navigator.userAgent
  const originalMatchMedia = window.matchMedia
  const originalVisualViewport = window.visualViewport

  afterEach(() => {
    // Restore originals
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true })
    window.matchMedia = originalMatchMedia
    if (originalVisualViewport) {
      Object.defineProperty(window, 'visualViewport', { value: originalVisualViewport, configurable: true })
    }
  })

  it('detects mobile User-Agent (iPhone)', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      configurable: true,
    })
    const { result } = renderHook(() => useMobileDetect())
    expect(result.current.isMobile).toBe(true)
    expect(result.current.isDesktop).toBe(false)
  })

  it('detects mobile User-Agent (Android)', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
      configurable: true,
    })
    const { result } = renderHook(() => useMobileDetect())
    expect(result.current.isMobile).toBe(true)
  })

  it('detects desktop User-Agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    })
    const { result } = renderHook(() => useMobileDetect())
    expect(result.current.isMobile).toBe(false)
    expect(result.current.isDesktop).toBe(true)
  })

  it('detects tablet User-Agent (iPad)', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      configurable: true,
    })
    const { result } = renderHook(() => useMobileDetect())
    expect(result.current.isTablet).toBe(true)
  })

  it('detects touch capability', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    })
    const { result } = renderHook(() => useMobileDetect())
    expect(result.current.hasTouch).toBe(true)
  })

  it('returns viewport dimensions', () => {
    const { result } = renderHook(() => useMobileDetect())
    expect(typeof result.current.viewportWidth).toBe('number')
    expect(typeof result.current.viewportHeight).toBe('number')
    expect(result.current.viewportWidth).toBeGreaterThan(0)
    expect(result.current.viewportHeight).toBeGreaterThan(0)
  })

  it('detects keyboard open via viewport height change', () => {
    // Mock visualViewport
    let resizeCallback = null
    const mockViewport = {
      height: 600,
      width: 375,
      addEventListener: (event, cb) => { if (event === 'resize') resizeCallback = cb },
      removeEventListener: () => {},
    }
    Object.defineProperty(window, 'visualViewport', { value: mockViewport, configurable: true })
    
    // Also need to set as mobile for keyboard detection to matter
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      configurable: true,
    })
    
    const { result } = renderHook(() => useMobileDetect())
    
    // Simulate keyboard open (viewport shrinks)
    act(() => {
      mockViewport.height = 300
      if (resizeCallback) resizeCallback()
    })
    
    expect(result.current.isKeyboardOpen).toBe(true)
  })

  it('returns isMobile/isTablet/isDesktop booleans', () => {
    const { result } = renderHook(() => useMobileDetect())
    expect(typeof result.current.isMobile).toBe('boolean')
    expect(typeof result.current.isTablet).toBe('boolean')
    expect(typeof result.current.isDesktop).toBe('boolean')
    expect(typeof result.current.hasTouch).toBe('boolean')
    expect(typeof result.current.isKeyboardOpen).toBe('boolean')
  })
})
