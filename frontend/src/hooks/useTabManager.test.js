import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabManager } from '../hooks/useTabManager';

const defaultShellConfig = {
  shellType: 'powershell',
  wslDistro: '',
  wslHomePath: '',
};

describe('useTabManager', () => {
  describe('initialization', () => {
    it('should initialize with one default tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.activeTabId).toBe(result.current.tabs[0].id);
    });

    it('should set first tab as active', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      expect(result.current.activeTab).not.toBeNull();
      expect(result.current.activeTab.id).toBe(result.current.tabs[0].id);
    });

    it('should inherit shell config for initial tab', () => {
      const wslConfig = {
        shellType: 'wsl',
        wslDistro: 'Ubuntu-24.04',
        wslHomePath: '/home/user',
      };
      const { result } = renderHook(() => useTabManager(wslConfig));

      expect(result.current.tabs[0].shellConfig).toEqual(wslConfig);
    });

    it('should generate unique tab IDs', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      expect(result.current.tabs[0].id).toBeTruthy();
      expect(typeof result.current.tabs[0].id).toBe('string');
      expect(result.current.tabs[0].id.length).toBeGreaterThan(0);
    });

    it('should set default title for initial tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      expect(result.current.tabs[0].title).toBe('Terminal 1');
    });
  });

  describe('createTab', () => {
    it('should add a new tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
      });

      expect(result.current.tabs).toHaveLength(2);
    });

    it('should return the new tab ID', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      let createResult;
      act(() => {
        createResult = result.current.createTab();
      });

      expect(createResult.success).toBe(true);
      expect(createResult.tabId).toBeTruthy();
      expect(result.current.tabs.find(t => t.id === createResult.tabId)).toBeDefined();
    });

    it('should set new tab as active', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      let createResult;
      act(() => {
        createResult = result.current.createTab();
      });

      expect(result.current.activeTabId).toBe(createResult.tabId);
    });

    it('should use provided shell config for new tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const wslConfig = {
        shellType: 'wsl',
        wslDistro: 'Ubuntu',
        wslHomePath: '/home/test',
      };

      let createResult;
      act(() => {
        createResult = result.current.createTab(wslConfig);
      });

      const newTab = result.current.tabs.find(t => t.id === createResult.tabId);
      expect(newTab.shellConfig).toEqual(wslConfig);
    });

    it('should inherit current shell config when none provided', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
      });

      expect(result.current.tabs[1].shellConfig).toEqual(defaultShellConfig);
    });

    it('should increment title number for new tabs', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
        result.current.createTab();
      });

      expect(result.current.tabs[0].title).toBe('Terminal 1');
      expect(result.current.tabs[1].title).toBe('Terminal 2');
      expect(result.current.tabs[2].title).toBe('Terminal 3');
    });

    it('should set createdAt timestamp', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const before = Date.now();
      act(() => {
        result.current.createTab();
      });
      const after = Date.now();

      const newTab = result.current.tabs[1];
      expect(newTab.createdAt).toBeGreaterThanOrEqual(before);
      expect(newTab.createdAt).toBeLessThanOrEqual(after);
    });

    it('should enforce maximum tab limit of 20', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      // Create 19 more tabs (already have 1)
      act(() => {
        for (let i = 0; i < 19; i++) {
          result.current.createTab();
        }
      });

      expect(result.current.tabs).toHaveLength(20);

      // Try to create one more
      let createResult;
      act(() => {
        createResult = result.current.createTab();
      });

      expect(createResult.success).toBe(false);
      expect(createResult.tabId).toBeNull();
      expect(result.current.tabs).toHaveLength(20);
    });
  });

  describe('closeTab', () => {
    it('should remove the specified tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      let createResult;
      act(() => {
        createResult = result.current.createTab();
      });

      expect(result.current.tabs).toHaveLength(2);

      act(() => {
        result.current.closeTab(createResult.tabId);
      });

      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.tabs.find(t => t.id === createResult.tabId)).toBeUndefined();
    });

    it('should switch to previous tab when closing active tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const firstTabId = result.current.tabs[0].id;

      act(() => {
        result.current.createTab();
      });

      const secondTabId = result.current.activeTabId;

      act(() => {
        result.current.closeTab(secondTabId);
      });

      expect(result.current.activeTabId).toBe(firstTabId);
    });

    it('should switch to next tab if closing first tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const firstTabId = result.current.tabs[0].id;

      let createResult;
      act(() => {
        createResult = result.current.createTab();
        result.current.switchTab(firstTabId); // Switch back to first
      });

      act(() => {
        result.current.closeTab(firstTabId);
      });

      expect(result.current.activeTabId).toBe(createResult.tabId);
    });

    it('should not close the last remaining tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const onlyTabId = result.current.tabs[0].id;

      act(() => {
        result.current.closeTab(onlyTabId);
      });

      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.tabs[0].id).toBe(onlyTabId);
    });

    it('should do nothing for non-existent tab ID', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
      });

      const tabCount = result.current.tabs.length;

      act(() => {
        result.current.closeTab('non-existent-id');
      });

      expect(result.current.tabs).toHaveLength(tabCount);
    });

    it('should not change active tab when closing inactive tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const firstTabId = result.current.tabs[0].id;

      let createResult;
      act(() => {
        createResult = result.current.createTab();
      });

      // Active is now createResult.tabId
      act(() => {
        result.current.closeTab(firstTabId);
      });

      expect(result.current.activeTabId).toBe(createResult.tabId);
    });
  });

  describe('switchTab', () => {
    it('should change active tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const firstTabId = result.current.tabs[0].id;

      act(() => {
        result.current.createTab();
      });

      act(() => {
        result.current.switchTab(firstTabId);
      });

      expect(result.current.activeTabId).toBe(firstTabId);
    });

    it('should update activeTab computed property', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const firstTabId = result.current.tabs[0].id;

      act(() => {
        result.current.createTab();
      });

      act(() => {
        result.current.switchTab(firstTabId);
      });

      expect(result.current.activeTab.id).toBe(firstTabId);
    });

    it('should do nothing for non-existent tab ID', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const activeTabId = result.current.activeTabId;

      act(() => {
        result.current.switchTab('non-existent-id');
      });

      expect(result.current.activeTabId).toBe(activeTabId);
    });

    it('should do nothing when switching to already active tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const activeTabId = result.current.activeTabId;

      act(() => {
        result.current.switchTab(activeTabId);
      });

      expect(result.current.activeTabId).toBe(activeTabId);
    });
  });

  describe('updateTabTitle', () => {
    it('should update tab title', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const tabId = result.current.tabs[0].id;

      act(() => {
        result.current.updateTabTitle(tabId, 'My Custom Title');
      });

      expect(result.current.tabs[0].title).toBe('My Custom Title');
    });

    it('should not affect other tabs', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
      });

      const firstTabId = result.current.tabs[0].id;

      act(() => {
        result.current.updateTabTitle(firstTabId, 'Renamed');
      });

      expect(result.current.tabs[0].title).toBe('Renamed');
      expect(result.current.tabs[1].title).toBe('Terminal 2');
    });

    it('should do nothing for non-existent tab ID', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const originalTitle = result.current.tabs[0].title;

      act(() => {
        result.current.updateTabTitle('non-existent-id', 'New Title');
      });

      expect(result.current.tabs[0].title).toBe(originalTitle);
    });

    it('should handle empty string title', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const tabId = result.current.tabs[0].id;

      act(() => {
        result.current.updateTabTitle(tabId, '');
      });

      // Empty title should be preserved (UI can handle display)
      expect(result.current.tabs[0].title).toBe('');
    });
  });

  describe('reorderTabs', () => {
    it('should move tab from one position to another', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
        result.current.createTab();
      });

      const tab0Id = result.current.tabs[0].id;
      const tab1Id = result.current.tabs[1].id;
      const tab2Id = result.current.tabs[2].id;

      act(() => {
        result.current.reorderTabs(0, 2);
      });

      expect(result.current.tabs[0].id).toBe(tab1Id);
      expect(result.current.tabs[1].id).toBe(tab2Id);
      expect(result.current.tabs[2].id).toBe(tab0Id);
    });

    it('should handle moving tab to earlier position', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
        result.current.createTab();
      });

      const tab0Id = result.current.tabs[0].id;
      const tab1Id = result.current.tabs[1].id;
      const tab2Id = result.current.tabs[2].id;

      act(() => {
        result.current.reorderTabs(2, 0);
      });

      expect(result.current.tabs[0].id).toBe(tab2Id);
      expect(result.current.tabs[1].id).toBe(tab0Id);
      expect(result.current.tabs[2].id).toBe(tab1Id);
    });

    it('should do nothing for invalid from index', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
      });

      const tab0Id = result.current.tabs[0].id;
      const tab1Id = result.current.tabs[1].id;

      act(() => {
        result.current.reorderTabs(-1, 0);
      });

      expect(result.current.tabs[0].id).toBe(tab0Id);
      expect(result.current.tabs[1].id).toBe(tab1Id);
    });

    it('should do nothing for invalid to index', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
      });

      const tab0Id = result.current.tabs[0].id;
      const tab1Id = result.current.tabs[1].id;

      act(() => {
        result.current.reorderTabs(0, 10);
      });

      expect(result.current.tabs[0].id).toBe(tab0Id);
      expect(result.current.tabs[1].id).toBe(tab1Id);
    });

    it('should preserve active tab during reorder', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
        result.current.createTab();
      });

      const activeTabId = result.current.activeTabId;

      act(() => {
        result.current.reorderTabs(0, 2);
      });

      expect(result.current.activeTabId).toBe(activeTabId);
    });
  });

  describe('tab structure', () => {
    it('should have all required properties', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const tab = result.current.tabs[0];

      expect(tab).toHaveProperty('id');
      expect(tab).toHaveProperty('title');
      expect(tab).toHaveProperty('shellConfig');
      expect(tab).toHaveProperty('createdAt');
      expect(typeof tab.id).toBe('string');
      expect(typeof tab.title).toBe('string');
      expect(typeof tab.shellConfig).toBe('object');
      expect(typeof tab.createdAt).toBe('number');
    });
  });

  describe('updateTabShellConfig', () => {
    it('should update shell config for a tab', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const tabId = result.current.tabs[0].id;
      const newConfig = {
        shellType: 'wsl',
        wslDistro: 'Ubuntu-24.04',
        wslHomePath: '/home/user',
      };

      act(() => {
        result.current.updateTabShellConfig(tabId, newConfig);
      });

      expect(result.current.tabs[0].shellConfig).toEqual(newConfig);
    });

    it('should not affect other tabs', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      act(() => {
        result.current.createTab();
      });

      const firstTabId = result.current.tabs[0].id;
      const newConfig = {
        shellType: 'wsl',
        wslDistro: 'Ubuntu-24.04',
        wslHomePath: '/home/user',
      };

      act(() => {
        result.current.updateTabShellConfig(firstTabId, newConfig);
      });

      expect(result.current.tabs[0].shellConfig).toEqual(newConfig);
      expect(result.current.tabs[1].shellConfig).toEqual(defaultShellConfig);
    });

    it('should do nothing for non-existent tab ID', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const originalConfig = { ...result.current.tabs[0].shellConfig };

      act(() => {
        result.current.updateTabShellConfig('non-existent-id', { shellType: 'wsl' });
      });

      expect(result.current.tabs[0].shellConfig).toEqual(originalConfig);
    });

    it('should create a new object reference for immutability', () => {
      const { result } = renderHook(() => useTabManager(defaultShellConfig));

      const tabId = result.current.tabs[0].id;
      const originalConfig = result.current.tabs[0].shellConfig;
      const newConfig = {
        shellType: 'wsl',
        wslDistro: 'Ubuntu-24.04',
        wslHomePath: '/home/user',
      };

      act(() => {
        result.current.updateTabShellConfig(tabId, newConfig);
      });

      expect(result.current.tabs[0].shellConfig).not.toBe(originalConfig);
      expect(result.current.tabs[0].shellConfig).not.toBe(newConfig);
    });
  });
});
