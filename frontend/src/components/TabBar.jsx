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
  disableNewTab = false,
  waitingTabs = {}, // Map of tabId -> isWaiting
  mode = 'dark', // 'dark' or 'light' for theme mode
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

  return (
    <div className="tab-bar" role="tablist">
      <div className="tab-bar-scroll">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isWaiting={waitingTabs[tab.id] || false}
            mode={mode}
            onClick={() => handleTabClick(tab.id)}
            onClose={() => handleTabClose(tab.id)}
            onRename={(newTitle) => handleTabRename(tab.id, newTitle)}
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
