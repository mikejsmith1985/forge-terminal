import { useState } from 'react'
import { useMobileDetect } from '../hooks/useMobileDetect'
import { Menu, X } from 'lucide-react'
import '../styles/mobile.css'

export function MobileLayout({ sidebar, main }) {
  const { isMobile, isTablet } = useMobileDetect()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isCompact = isMobile || isTablet

  if (!isCompact) {
    return (
      <div className="desktop-layout">
        <div className="desktop-sidebar">{sidebar}</div>
        <div className="desktop-main">{main}</div>
      </div>
    )
  }

  return (
    <div className="mobile-layout">
      <div className="mobile-top-bar">
        <button
          className="mobile-hamburger"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="menu"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {sidebarOpen && (
        <div
          className="mobile-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`mobile-sidebar-drawer ${sidebarOpen ? 'open' : ''}`}>
        {sidebar}
      </div>

      <div className="mobile-main-content">
        {main}
      </div>
    </div>
  )
}
