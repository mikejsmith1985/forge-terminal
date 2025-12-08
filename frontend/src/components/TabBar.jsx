import React from 'react';
import { Plus } from 'lucide-react';
import Tab from './Tab';

/**
 * TabBar component - contains tabs and new tab button
 */
function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabRename,
  onNewTab,
  onReorder,
  onToggleAutoRespond = null, // Callback to toggle auto-respond for a tab
  onToggleAM = null, // Callback to toggle AM logging for a tab
  onToggleVision = null, // Callback to toggle Forge Vision for a tab
  onToggleAssistant = null, // Callback to toggle Forge Assistant for a tab
  onToggleMode = null, // Callback to toggle light/dark mode for a tab
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

  const handleToggleAutoRespond = (tabId) => {
    if (onToggleAutoRespond) {
      onToggleAutoRespond(tabId);
    }
  };

  const handleToggleAM = (tabId) => {
    if (onToggleAM) {
      onToggleAM(tabId);
    }
  };

  const handleToggleVision = (tabId) => {
    if (onToggleVision) {
      onToggleVision(tabId);
    }
  };

  const handleToggleAssistant = (tabId) => {
    if (onToggleAssistant) {
      onToggleAssistant(tabId);
    }
  };

  const handleToggleMode = (tabId) => {
    if (onToggleMode) {
      onToggleMode(tabId);
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
            onToggleAutoRespond={() => handleToggleAutoRespond(tab.id)}
            onToggleAM={devMode ? () => handleToggleAM(tab.id) : null}
            onToggleVision={devMode ? () => handleToggleVision(tab.id) : null}
            onToggleAssistant={devMode ? () => handleToggleAssistant(tab.id) : null}
            onToggleMode={() => handleToggleMode(tab.id)}
            devMode={devMode}
          />
        ))}
      </div>
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

export default TabBar;
