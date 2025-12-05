import React from 'react';
import { X, Terminal, TerminalSquare } from 'lucide-react';

/**
 * Get shell icon based on shell type
 */
function getShellIcon(shellType) {
  switch (shellType) {
    case 'wsl':
      return <Terminal size={14} />;
    case 'cmd':
      return <TerminalSquare size={14} />;
    case 'powershell':
    default:
      return <Terminal size={14} />;
  }
}

/**
 * Tab component for terminal tab bar
 */
function Tab({ tab, isActive, onClick, onClose }) {
  const handleClick = (e) => {
    // Don't trigger onClick if clicking close button
    if (e.target.closest('.tab-close')) {
      return;
    }
    onClick();
  };

  const handleCloseClick = (e) => {
    e.stopPropagation();
    onClose();
  };

  const handleMouseDown = (e) => {
    // Middle mouse button click to close
    if (e.button === 1) {
      e.preventDefault();
      onClose();
    }
  };

  const shellType = tab.shellConfig?.shellType || 'powershell';

  return (
    <div
      className={`tab ${isActive ? 'active' : ''}`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      data-shell={shellType}
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
    >
      <span className="tab-icon" data-shell={shellType}>
        {getShellIcon(shellType)}
      </span>
      <span className="tab-title">{tab.title}</span>
      <button
        className="tab-close"
        onClick={handleCloseClick}
        aria-label="Close tab"
        tabIndex={-1}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default Tab;
