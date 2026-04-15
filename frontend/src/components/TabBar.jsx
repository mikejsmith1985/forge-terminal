import React, { useState, useRef } from 'react';
import { Plus, BarChart3, Bell, BellOff, Zap, BookOpen, BookX } from 'lucide-react';
import Tab from './Tab';

/**
 * TabBar component - contains tabs, dashboard button, and new tab button
 */
function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabRename,
  onNewTab,
  onReorder,
  onToggleMode = null,
  onToggleViewMode = null,
  onChangeTheme = null,
  onOpenDashboard = null,
  onToggleForgeAssist = null,
  isForgeAssistOpen = false,
  onToggleTutor = null,
  isTutorOpen = false,
  isTutorFeatureEnabled = true,
  onReEnableTutor = null,
  disableNewTab = false,
  waitingTabs = {},
  mode = 'dark',
  devMode = false,
}) {
  const handleTabClick = (tabId) => {
    onTabClick(tabId);
  };

  const handleTabClose = (tabId) => {
    onTabClose(tabId);
  };

  const handleTabRename = (tabId, newTitle) => {
    if (onTabRename) {
      onTabRename(tabId, newTitle);
    }
  };

  // Drag-and-drop tab reordering
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragSourceIndex = useRef(null);

  const handleDragStart = (index) => {
    dragSourceIndex.current = index;
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragSourceIndex.current !== null && dragSourceIndex.current !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (index) => {
    if (dragSourceIndex.current !== null && dragSourceIndex.current !== index && onReorder) {
      onReorder(dragSourceIndex.current, index);
    }
    dragSourceIndex.current = null;
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragSourceIndex.current = null;
    setDragOverIndex(null);
  };

  // v3.12.12: handleToggleAM removed- AM feature deprecated

  const handleToggleMode = (tabId) => {
    if (onToggleMode) {
      onToggleMode(tabId);
    }
  };

  const handleToggleViewMode = (tabId) => {
    if (onToggleViewMode) {
      onToggleViewMode(tabId);
    }
  };

  const handleChangeTheme = (tabId, themeName, themeMode) => {
    if (onChangeTheme) {
      onChangeTheme(tabId, themeName, themeMode);
    }
  };

  return (
    <div className="tab-bar" role="tablist">
      <div className="tab-bar-scroll">
        {tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isWaiting={waitingTabs[tab.id] || false}
            mode={tab.mode || mode}
            onClick={() => handleTabClick(tab.id)}
            onClose={() => handleTabClose(tab.id)}
            onRename={(newTitle) => handleTabRename(tab.id, newTitle)}
            onToggleMode={() => handleToggleMode(tab.id)}
            onToggleViewMode={() => handleToggleViewMode(tab.id)}
            onChangeTheme={(themeName, themeMode) => handleChangeTheme(tab.id, themeName, themeMode)}
            devMode={devMode}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
            isDragOver={dragOverIndex === index}
            isDragging={dragSourceIndex.current === index}
          />
        ))}
      </div>
      {/* Dashboard Button */}
      {onOpenDashboard && (
        <button
          className="dashboard-btn"
          onClick={onOpenDashboard}
          aria-label="Developer Dashboard"
          title="Developer Dashboard"
          data-testid="dashboard-btn"
        >
          <BarChart3 size={16} />
        </button>
      )}
      {/* Forge Assist — Power Features */}
      {onToggleForgeAssist && (
        <button
          className={`dashboard-btn ${isForgeAssistOpen ? 'active' : ''}`}
          onClick={onToggleForgeAssist}
          aria-label={isForgeAssistOpen ? 'Close Power Features' : 'Power Features (Ctrl+/)'}
          title="Power Features (Ctrl+/)"
          data-testid="forge-assist-btn"
        >
          <Zap size={16} />
        </button>
      )}
      {/* Code Tutor — Learn As You Build */}
      {onToggleTutor && (
        <button
          className={`dashboard-btn ${isTutorOpen ? 'active' : ''}`}
          onClick={onToggleTutor}
          aria-label={isTutorOpen ? 'Close Code Tutor' : 'Code Tutor (Ctrl+Shift+T)'}
          title="Code Tutor (Ctrl+Shift+T)"
          data-testid="tutor-btn"
        >
          <BookOpen size={16} />
        </button>
      )}
      {/* Re-enable Code Tutor when feature is disabled */}
      {!onToggleTutor && !isTutorFeatureEnabled && onReEnableTutor && (
        <button
          className="dashboard-btn"
          onClick={onReEnableTutor}
          aria-label="Re-enable Code Tutor"
          title="Code Tutor is disabled — click to re-enable"
          data-testid="tutor-reenable-btn"
          style={{ opacity: 0.4 }}
        >
          <BookX size={16} />
        </button>
      )}
      {/* Manual notify bell */}
      <NotifyBellButton />
      <button
        className="new-tab-btn"
        onClick={onNewTab}
        disabled={disableNewTab}
        aria-label="New tab"
        title="New tab (Ctrl+T)"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

/**
 * NotifyBellButton — one-click manual notification trigger.
 * Sends an immediate /api/notify POST. Shows a filled bell briefly on success.
 */
function NotifyBellButton() {
  const [state, setState] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const [configured, setConfigured] = useState(null); // null=unknown, true/false

  // Only show button when an ntfyTopic is actually saved
  React.useEffect(() => {
    fetch('/api/notify/config')
      .then(r => r.json())
      .then(cfg => setConfigured(!!cfg.ntfyTopic))
      .catch(() => setConfigured(false));
  }, []);

  if (!configured) return null;

  const handleClick = () => {
    if (state === 'sending') return;
    setState('sending');
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '🔔 Forge Terminal: stepping away — ping me when you need me.' }),
    })
      .then(async r => {
        if (r.ok) {
          setState('sent');
        } else {
          const body = await r.json().catch(() => ({}));
          console.error('Notify failed:', body.error || r.statusText);
          setState('error');
        }
      })
      .catch(err => {
        console.error('Notify error:', err);
        setState('error');
      })
      .finally(() => setTimeout(() => setState('idle'), 3000));
  };

  const color = state === 'sent' ? '#fbbf24' : state === 'error' ? '#f87171' : undefined;
  const label = state === 'sent' ? '✓ Notification sent' : state === 'error' ? '✗ Failed to send — check ntfy config' : 'Send notification to phone';

  return (
    <button
      className="dashboard-btn"
      onClick={handleClick}
      aria-label={label}
      title={label}
      style={{ color, transition: 'color 0.2s' }}
    >
      {state === 'sent'
        ? <Bell size={16} fill="currentColor" />
        : state === 'error'
          ? <BellOff size={16} />
          : <Bell size={16} />}
    </button>
  );
}

export default TabBar;
