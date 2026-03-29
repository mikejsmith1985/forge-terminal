import { useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import './MobileTabStrip.css'

export function MobileTabStrip({ tabs, activeTabId, onTabSelect, onTabClose, onNewTab }) {
  const scrollRef = useRef(null)
  // Tracks whether the close button should be interactive.
  // After switching to a new tab, the close button is disabled for 400ms to prevent
  // ghost-clicks: on mobile, touch-end can fire on the X that just appeared under the finger.
  const [closeAllowed, setCloseAllowed] = useState(true)

  const handleTabClick = (tabId) => {
    if (tabId !== activeTabId) {
      setCloseAllowed(false)
      setTimeout(() => setCloseAllowed(true), 400)
    }
    onTabSelect(tabId)
  }

  return (
    <div className="mobile-tab-strip" ref={scrollRef}>
      <div className="mobile-tab-list">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={`mobile-tab ${isActive ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
            >
              <span className="mobile-tab-label">{tab.label}</span>
              {/* Only render close button on the active tab to prevent accidental tab closure */}
              {isActive && (
                <button
                  className="mobile-tab-close"
                  style={{ pointerEvents: closeAllowed ? 'auto' : 'none' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onTabClose(tab.id)
                  }}
                  aria-label="close tab"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )
        })}
        <button
          className="mobile-new-tab"
          onClick={onNewTab}
          aria-label="new tab"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}
