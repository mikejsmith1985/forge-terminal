import React, { useState, useRef, useEffect } from 'react';
import { X, Terminal, TerminalSquare, Edit2, Zap, BookOpen, Sun, Moon, MessageCircle, Eye } from 'lucide-react';
import { themes } from '../themes';

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
  const themeData = themes[colorTheme];
  if (!themeData) return null;
  return themeData[mode]?.ui?.accent || null;
}

/**
 * Tab component for terminal tab bar
 */
function Tab({ tab, isActive, onClick, onClose, onRename, onToggleAutoRespond, onToggleAM, onToggleVision, onToggleAssistant, onToggleMode, isWaiting = false, mode = 'dark', devMode = false }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(tab.title);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const inputRef = useRef(null);
  const contextMenuRef = useRef(null);

  // Debug: Log when context menu opens
  useEffect(() => {
    if (showContextMenu) {
      console.log('[Tab] Context menu opened:', { 
        devMode, 
        hasOnToggleVision: !!onToggleVision,
        hasOnToggleAM: !!onToggleAM,
        tabId: tab.id,
        visionEnabled: tab.visionEnabled
      });
    }
  }, [showContextMenu, devMode, onToggleVision, onToggleAM, tab.id, tab.visionEnabled]);

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
  if (tab.autoRespond) indicators.push('Auto-respond');
  if (devMode && tab.amEnabled) indicators.push('AM Logging');
  if (tabMode === 'light') indicators.push('Light');
  if (indicators.length > 0) {
    titleText = `${tab.title} (${indicators.join(', ')})`;
  }

  return (
    <>
      <div
        className={`tab ${isActive ? 'active' : ''} ${isWaiting ? 'waiting' : ''} ${tab.autoRespond ? 'auto-respond' : ''} ${devMode && tab.amEnabled ? 'am-enabled' : ''}`}
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
        {devMode && tab.amEnabled && (
          <span className="am-indicator" title="AM Logging enabled">
            <BookOpen size={10} />
          </span>
        )}
        {devMode && tab.visionEnabled && (
          <span className="vision-indicator" title="Vision enabled">
            <Eye size={10} />
          </span>
        )}
        {tab.autoRespond && (
          <span className="auto-respond-indicator" title="Auto-respond enabled">
            <Zap size={10} />
          </span>
        )}
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
          aria-label="Close tab"
          tabIndex={-1}
        >
          <X size={14} />
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
          {devMode && onToggleAM && (
            <button 
              onClick={() => { 
                setShowContextMenu(false); 
                if (onToggleAM) onToggleAM(); 
              }}
              className={tab.amEnabled ? 'active' : ''}
            >
              <BookOpen size={14} />
              AM Logging {tab.amEnabled ? '✓' : ''}
            </button>
          )}
          {devMode && onToggleVision && (
            <button 
              onClick={() => { 
                setShowContextMenu(false); 
                if (onToggleVision) onToggleVision(); 
              }}
              className={tab.visionEnabled ? 'active' : ''}
            >
              <Terminal size={14} />
              Forge Vision {tab.visionEnabled ? '✓' : ''}
            </button>
          )}
          {devMode && onToggleAssistant && (
            <button 
              onClick={() => { 
                setShowContextMenu(false); 
                if (onToggleAssistant) onToggleAssistant(); 
              }}
              className={tab.assistantEnabled ? 'active' : ''}
            >
              <MessageCircle size={14} />
              Assistant {tab.assistantEnabled ? '✓' : ''}
            </button>
          )}
          <button 
            onClick={() => { 
              setShowContextMenu(false); 
              if (onToggleAutoRespond) onToggleAutoRespond(); 
            }}
            className={tab.autoRespond ? 'active' : ''}
          >
            <Zap size={14} />
            Auto-respond {tab.autoRespond ? '✓' : ''}
          </button>
          <button onClick={() => { setShowContextMenu(false); onClose(); }}>
            <X size={14} />
            Close
          </button>
        </div>
      )}
    </>
  );
}

export default Tab;
