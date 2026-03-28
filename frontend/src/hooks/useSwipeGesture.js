import { useEffect, useRef } from 'react'

/**
 * Detects swipe gestures on a ref element.
 * @param {React.RefObject} ref - Element to attach listeners to
 * @param {Object} options - Swipe callbacks and configuration
 */
export function useSwipeGesture(ref, {
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
} = {}) {
  // Keep callbacks in a ref so effect doesn't re-run on every render
  const callbacksRef = useRef({ onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown })
  callbacksRef.current = { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown }

  const thresholdRef = useRef(threshold)
  thresholdRef.current = threshold

  useEffect(() => {
    const el = ref?.current
    if (!el) return

    let startX = 0
    let startY = 0
    let tracking = false

    function handleTouchStart(e) {
      const touch = e.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      tracking = true
    }

    function handleTouchMove(e) {
      // Intentionally left open for future scroll-prevention logic
    }

    function handleTouchEnd(e) {
      if (!tracking) return
      tracking = false

      const touch = e.changedTouches[0]
      if (!touch) return

      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      const t = thresholdRef.current

      // Must exceed threshold in at least one axis
      if (absDx < t && absDy < t) return

      const { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown } = callbacksRef.current

      if (absDx >= absDy) {
        // Horizontal swipe dominates
        if (dx > 0) {
          onSwipeRight?.()
        } else {
          onSwipeLeft?.()
        }
      } else {
        // Vertical swipe dominates
        if (dy > 0) {
          onSwipeDown?.()
        } else {
          onSwipeUp?.()
        }
      }
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: true })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [ref])
}
