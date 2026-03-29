import React, { useState } from 'react';
import { Plus, BarChart3, Bell, BellOff } from 'lucide-react';
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
  onToggleAutoRespond = null, // v3.18: deprecated, kept for API compat
  // onToggleAM = null, // v3.12.12: AM feature removed
  onToggleMode = null, // Callback to toggle light/dark mode for a tab
  onToggleViewMode = null, // Callback to toggle view mode (chat/terminal/notebook) for a tab
  onChangeTheme = null, // Callback to change theme+mode for a tab
  onOpenDashboard = null, // Callback to open Developer Dashboard
  disableNewTab = false,
  waitingTabs = {}, // Map of tabId -> isWaiting
  mode = 'dark', // 'dark' or 'light' for theme mode
  devMode = false, // Whether dev mode is enabled
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

  // v3.18: handleToggleAutoRespond removed — auto-respond feature removed from frontend

  // v3.12.12: handleToggleAM removed - AM feature deprecated

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
        {tabs.map((tab) => (
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
  const [sent, setSent] = useState(false);
  const [configured, setConfigured] = useState(null); // null=unknown, true/false

  // Check on first render whether notifications are configured
  React.useEffect(() => {
    fetch('/api/notify/config')
      .then(r => r.json())
      .then(cfg => setConfigured(!!(cfg.ntfyTopic || cfg.transport === 'ntfy')))
      .catch(() => setConfigured(false));
  }, []);

  if (!configured) return null; // Hide button if not set up

  const handleClick = () => {
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '🔔 Forge Terminal: stepping away — ping me when you need me.' }),
    })
      .then(r => r.ok && setSent(true))
      .catch(() => {})
      .finally(() => setTimeout(() => setSent(false), 3000));
  };

  return (
    <button
      className="dashboard-btn"
      onClick={handleClick}
      aria-label={sent ? 'Notification sent' : 'Send notification to phone'}
      title={sent ? '✓ Notification sent' : 'Send notification to phone'}
      style={{ color: sent ? '#fbbf24' : undefined, transition: 'color 0.2s' }}
    >
      {sent ? <Bell size={16} fill="currentColor" /> : <Bell size={16} />}
    </button>
  );
}

export default TabBar;
