import React, { useState, useRef, useEffect } from 'react';
import { X, Terminal, TerminalSquare, Edit2, Sun, Moon, Palette } from 'lucide-react';
import { themes, themeOrder } from '../themes';

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
 * Get the accent color for a tab based on its colorTheme
 */
function getTabAccentColor(colorTheme, mode = 'dark') {
  // Fallback to molten if theme not found
  const themeData = themes[colorTheme] || themes['molten'];
  if (!themeData) return null;
  
  // Fallback to dark mode if specific mode not found
  return themeData[mode]?.ui?.accent || themeData['dark']?.ui?.accent || null;
}

/**
 * Tab component for terminal tab bar
 */
function Tab({ tab, isActive, onClick, onClose, onRename, onToggleMode, onToggleViewMode, onChangeTheme, isWaiting = false, mode = 'dark', devMode = false }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(tab.title);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showThemeSubmenu, setShowThemeSubmenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const inputRef = useRef(null);
  const contextMenuRef = useRef(null);

  // Debug: Log when context menu opens
  useEffect(() => {
    if (showContextMenu) {
      console.log('[Tab] Context menu opened:', { 
        devMode, 
        tabId: tab.id
      });
    }
  }, [showContextMenu, devMode, tab.id]);

  const handleThemeChange = (themeName, themeMode) => {
    console.log('[Tab] handleThemeChange called:', { themeName, themeMode, tabId: tab.id });
    setShowContextMenu(false);
    setShowThemeSubmenu(false);
    if (onChangeTheme) {
      console.log('[Tab] Calling onChangeTheme callback');
      onChangeTheme(themeName, themeMode);
    } else {
      console.warn('[Tab] onChangeTheme callback is not defined!');
    }
  };

  const handleClick = (e) => {
    // Don't trigger onClick if clicking close button or in edit mode
    if (e.target.closest('.tab-close') || isEditing) {
      return;
    }
    onClick();
  };

  const handleDoubleClick = (e) => {
    // Don't trigger if clicking close button
    if (e.target.closest('.tab-close')) {
      return;
    }
    startEditing();
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const startEditing = () => {
    setEditValue(tab.title);
    setIsEditing(true);
    setShowContextMenu(false);
  };

  const handleEditSubmit = () => {
    const newTitle = editValue.trim();
    if (newTitle && newTitle !== tab.title && onRename) {
      onRename(newTitle);
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditValue(tab.title);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
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

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setShowContextMenu(false);
      }
    };
    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showContextMenu]);

  const shellType = tab.shellConfig?.shellType || 'powershell';
  const tabMode = tab.mode || 'dark';

  // Style for the colored tab background - use tab's own mode
  const accentColor = getTabAccentColor(tab.colorTheme, tabMode);
  const bgOpacity = isActive ? '4d' : '33'; // 30% opacity for active, 20% for inactive
  const tabStyle = accentColor ? {
    '--tab-accent': accentColor,
    backgroundColor: `${accentColor}${bgOpacity}`,
  } : {};

  // Build title with indicators
  let titleText = tab.title;
  const indicators = [];
  // v3.12.12: AM feature removed
  if (tabMode === 'light') indicators.push('Light');
  if (indicators.length > 0) {
    titleText = `${tab.title} (${indicators.join(', ')})`;
  }

  return (
    <>
      <div
        className={`tab ${isActive ? 'active' : ''} ${isWaiting ? 'waiting' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        data-shell={shellType}
        style={tabStyle}
        role="tab"
        aria-selected={isActive}
        tabIndex={0}
        title={titleText}
      >
        <span className="tab-icon" data-shell={shellType}>
          {getShellIcon(shellType)}
        </span>
        {/* v3.12.12: AM indicator removed */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="tab-title-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleEditSubmit}
            onKeyDown={handleEditKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tab-title">{tab.title}</span>
        )}

        <button
          className="tab-close"
          onClick={handleCloseClick}
          aria-label={tab.modified ? "Unsaved changes" : "Close tab"}
          tabIndex={-1}
        >
          {tab.modified ? (
            <div className="tab-dirty-indicator" style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: 'var(--text-secondary)',
              margin: '3px'
            }} />
          ) : (
            <X size={14} />
          )}
        </button>
      </div>
      
      {/* Context Menu */}
      {showContextMenu && (
        <div
          ref={contextMenuRef}
          className="tab-context-menu"
          style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
        >
          <button onClick={startEditing}>
            <Edit2 size={14} />
            Rename
          </button>
          <button 
            onClick={() => { 
              setShowContextMenu(false); 
              if (onToggleMode) onToggleMode(); 
            }}
          >
            {tabMode === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {tabMode === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button 
            className="submenu-trigger"
            onClick={() => setShowThemeSubmenu(!showThemeSubmenu)}
            onMouseEnter={() => setShowThemeSubmenu(true)}
          >
            <Palette size={14} />
            Theme
            <span className="submenu-arrow">▶</span>
          </button>
          {/* v3.8.2: View Mode toggle REMOVED - Terminal is the only view */}
          {/* v3.12.12: AM toggle REMOVED - AM feature deprecated */}
          <button onClick={() => { setShowContextMenu(false); onClose(); }}>
            <X size={14} />
            Close
          </button>
        </div>
      )}

      {/* Theme Submenu */}
      {showContextMenu && showThemeSubmenu && (
        <div 
          className="theme-submenu"
          style={{ 
            top: contextMenuPos.y, 
            left: contextMenuPos.x + 200 
          }}
          onMouseLeave={() => setShowThemeSubmenu(false)}
        >
          {themeOrder.map(themeName => {
            const themeData = themes[themeName];
            const currentTheme = tab.colorTheme === themeName;
            return (
              <div key={themeName} className="theme-option">
                <div className="theme-name">
                  {themeData?.name || themeName} {currentTheme && '✓'}
                </div>
                <div className="theme-modes">
                  <button 
                    onClick={() => handleThemeChange(themeName, 'dark')}
                    className={currentTheme && tabMode === 'dark' ? 'active' : ''}
                  >
                    <Moon size={12} />
                    Dark
                  </button>
                  <button 
                    onClick={() => handleThemeChange(themeName, 'light')}
                    className={currentTheme && tabMode === 'light' ? 'active' : ''}
                  >
                    <Sun size={12} />
                    Light
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default Tab;
