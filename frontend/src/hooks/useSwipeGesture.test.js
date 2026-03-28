import { renderHook, act } from '@testing-library/react'
import { useSwipeGesture } from './useSwipeGesture'

// jsdom lacks TouchEvent — create a synthetic touch event
function fireTouchEvent(element, type, { clientX = 0, clientY = 0 }) {
  const event = new Event(type, { bubbles: true })
  const touch = { clientX, clientY, identifier: 0, target: element }
  event.touches = type === 'touchend' ? [] : [touch]
  event.changedTouches = [touch]
  element.dispatchEvent(event)
}

function simulateSwipe(element, from, to) {
  act(() => { fireTouchEvent(element, 'touchstart', from) })
  act(() => { fireTouchEvent(element, 'touchmove', to) })
  act(() => { fireTouchEvent(element, 'touchend', to) })
}

describe('useSwipeGesture', () => {
  let element

  beforeEach(() => {
    element = document.createElement('div')
    document.body.appendChild(element)
  })

  afterEach(() => {
    document.body.removeChild(element)
  })

  it('calls onSwipeRight when swiping right beyond threshold', () => {
    const onSwipeRight = vi.fn()
    const ref = { current: element }

    renderHook(() => useSwipeGesture(ref, { onSwipeRight }))

    simulateSwipe(element, { clientX: 0, clientY: 100 }, { clientX: 80, clientY: 100 })

    expect(onSwipeRight).toHaveBeenCalledTimes(1)
  })

  it('calls onSwipeLeft when swiping left beyond threshold', () => {
    const onSwipeLeft = vi.fn()
    const ref = { current: element }

    renderHook(() => useSwipeGesture(ref, { onSwipeLeft }))

    simulateSwipe(element, { clientX: 200, clientY: 100 }, { clientX: 100, clientY: 100 })

    expect(onSwipeLeft).toHaveBeenCalledTimes(1)
  })

  it('does not trigger for swipes below threshold', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const ref = { current: element }

    renderHook(() => useSwipeGesture(ref, { onSwipeLeft, onSwipeRight }))

    // Swipe only 30px — below default 50px threshold
    simulateSwipe(element, { clientX: 100, clientY: 100 }, { clientX: 130, clientY: 100 })

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('cleans up event listeners on unmount', () => {
    const onSwipeRight = vi.fn()
    const ref = { current: element }
    const addSpy = vi.spyOn(element, 'addEventListener')
    const removeSpy = vi.spyOn(element, 'removeEventListener')

    const { unmount } = renderHook(() => useSwipeGesture(ref, { onSwipeRight }))

    const addedEvents = addSpy.mock.calls.map(c => c[0])
    expect(addedEvents).toContain('touchstart')
    expect(addedEvents).toContain('touchmove')
    expect(addedEvents).toContain('touchend')

    unmount()

    const removedEvents = removeSpy.mock.calls.map(c => c[0])
    expect(removedEvents).toContain('touchstart')
    expect(removedEvents).toContain('touchmove')
    expect(removedEvents).toContain('touchend')

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('handles missing callbacks gracefully', () => {
    const ref = { current: element }

    // Should not throw with empty options
    renderHook(() => useSwipeGesture(ref, {}))

    expect(() => {
      simulateSwipe(element, { clientX: 0, clientY: 100 }, { clientX: 80, clientY: 100 })
    }).not.toThrow()
  })

  it('calls onSwipeDown when swiping down beyond threshold', () => {
    const onSwipeDown = vi.fn()
    const ref = { current: element }

    renderHook(() => useSwipeGesture(ref, { onSwipeDown }))

    simulateSwipe(element, { clientX: 100, clientY: 0 }, { clientX: 100, clientY: 80 })

    expect(onSwipeDown).toHaveBeenCalledTimes(1)
  })

  it('calls onSwipeUp when swiping up beyond threshold', () => {
    const onSwipeUp = vi.fn()
    const ref = { current: element }

    renderHook(() => useSwipeGesture(ref, { onSwipeUp }))

    simulateSwipe(element, { clientX: 100, clientY: 200 }, { clientX: 100, clientY: 100 })

    expect(onSwipeUp).toHaveBeenCalledTimes(1)
  })

  it('respects custom threshold', () => {
    const onSwipeRight = vi.fn()
    const ref = { current: element }

    renderHook(() => useSwipeGesture(ref, { onSwipeRight, threshold: 100 }))

    // 80px swipe — beyond default 50 but below custom 100
    simulateSwipe(element, { clientX: 0, clientY: 100 }, { clientX: 80, clientY: 100 })
    expect(onSwipeRight).not.toHaveBeenCalled()

    // 120px swipe — beyond custom 100
    simulateSwipe(element, { clientX: 0, clientY: 100 }, { clientX: 120, clientY: 100 })
    expect(onSwipeRight).toHaveBeenCalledTimes(1)
  })
})
