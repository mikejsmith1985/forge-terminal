import { useRef } from 'react'
import { Plus, X } from 'lucide-react'
import './MobileTabStrip.css'

export function MobileTabStrip({ tabs, activeTabId, onTabSelect, onTabClose, onNewTab }) {
  const scrollRef = useRef(null)

  return (
    <div className="mobile-tab-strip" ref={scrollRef}>
      <div className="mobile-tab-list">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`mobile-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onTabSelect(tab.id)}
          >
            <span className="mobile-tab-label">{tab.label}</span>
            <button
              className="mobile-tab-close"
              onClick={(e) => {
                e.stopPropagation()
                onTabClose(tab.id)
              }}
              aria-label="close"
            >
              <X size={14} />
            </button>
          </div>
        ))}
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
