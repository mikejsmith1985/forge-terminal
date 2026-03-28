import { useState, useEffect, useCallback } from 'react'

const MOBILE_RE = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i
const TABLET_RE = /iPad|Android(?!.*Mobile)|tablet/i

export function useMobileDetect() {
  const ua = navigator.userAgent

  const getDeviceType = useCallback(() => {
    const isMobile = MOBILE_RE.test(ua)
    const isTablet = TABLET_RE.test(ua)
    const isDesktop = !isMobile && !isTablet
    const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window
    return { isMobile, isTablet, isDesktop, hasTouch }
  }, [ua])

  const [device, setDevice] = useState(getDeviceType)
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth)
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [initialViewportHeight] = useState(() =>
    window.visualViewport?.height || window.innerHeight
  )

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
      setViewportHeight(window.innerHeight)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const handleViewportResize = () => {
      const heightRatio = viewport.height / initialViewportHeight
      setIsKeyboardOpen(heightRatio < 0.7)
      setViewportHeight(viewport.height)
      setViewportWidth(viewport.width)
    }

    viewport.addEventListener('resize', handleViewportResize)
    return () => viewport.removeEventListener('resize', handleViewportResize)
  }, [initialViewportHeight])

  return {
    ...device,
    viewportWidth,
    viewportHeight,
    isKeyboardOpen,
  }
}
