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
  onNewTab,
  onReorder,
  disableNewTab = false,
}) {
  const handleTabClick = (tabId) => {
    onTabClick(tabId);
  };

  const handleTabClose = (tabId) => {
    onTabClose(tabId);
  };

  return (
    <div className="tab-bar" role="tablist">
      <div className="tab-bar-scroll">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onClick={() => handleTabClick(tab.id)}
            onClose={() => handleTabClose(tab.id)}
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
