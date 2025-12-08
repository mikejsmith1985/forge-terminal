import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { themeOrder } from '../themes';
import { logger } from '../utils/logger';

const MAX_TABS = 20;

// Debounce helper for session saving
function debounce(fn, ms) {
  let timeoutId;
  return (...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, ms);
  };
}

// Counter for unique IDs
let idCounter = 0;

// Counter for theme cycling - each new tab gets next theme
let themeIndex = 0;

/**
 * Generate a unique ID for tabs
 */
function generateId() {
  idCounter += 1;
  return `tab-${idCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new tab object
 * @param {Object} shellConfig - Shell configuration
 * @param {number} tabNumber - Tab number for title
 * @param {string} colorTheme - Optional color theme override
 * @param {string} mode - Optional mode override ('dark' or 'light')
 * @param {string} currentDirectory - Optional current directory path
 */
function createTab(shellConfig, tabNumber, colorTheme = null, mode = null, currentDirectory = null) {
  // Auto-assign next theme in cycle if not specified
  const assignedTheme = colorTheme || themeOrder[themeIndex % themeOrder.length];
  // Alternate mode for visual variety: even tabs dark, odd tabs light (if not specified)
  const assignedMode = mode || (themeIndex % 2 === 0 ? 'dark' : 'light');
  themeIndex++;
  
  const newTab = {
    id: generateId(),
    title: `Terminal ${tabNumber}`,
    shellConfig: { ...shellConfig },
    colorTheme: assignedTheme,
    mode: assignedMode, // Per-tab light/dark mode
    autoRespond: false, // Auto-respond to CLI confirmation prompts
    amEnabled: true, // AM (Artificial Memory) logging - DEFAULT ON for legal compliance
    visionEnabled: false, // Forge Vision overlays - DEFAULT OFF (Dev Mode feature)
    assistantEnabled: false, // Forge Assistant panel - DEFAULT OFF (Dev Mode feature)
    currentDirectory: currentDirectory || null, // Current working directory
    createdAt: Date.now(),
  };
  
  logger.tabs('Creating tab object', { 
    tabId: newTab.id, 
    tabNumber, 
    colorTheme: assignedTheme,
    mode: assignedMode,
    currentDirectory,
    themeIndex: themeIndex - 1
  });
  
  return newTab;
}

/**
 * Convert tabs to session format for persistence
 */
function tabsToSession(tabs, activeTabId) {
  return {
    tabs: tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      shellConfig: {
        shellType: tab.shellConfig?.shellType || 'cmd',
        wslDistro: tab.shellConfig?.wslDistro || '',
        wslHomePath: tab.shellConfig?.wslHomePath || '',
      },
      colorTheme: tab.colorTheme,
      mode: tab.mode || 'dark',
      autoRespond: tab.autoRespond || false,
      amEnabled: tab.amEnabled || false,
      visionEnabled: tab.visionEnabled || false,
      assistantEnabled: tab.assistantEnabled || false,
      currentDirectory: tab.currentDirectory || null,
    })),
    activeTabId: activeTabId,
  };
}

/**
 * Save session to backend
 */
async function saveSession(tabs, activeTabId) {
  try {
    const session = tabsToSession(tabs, activeTabId);
    logger.session('Saving session', { 
      tabCount: tabs.length, 
      activeTabId,
      tabIds: tabs.map(t => t.id)
    });
    await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    logger.session('Session saved successfully');
  } catch (err) {
    logger.session('Failed to save session', { error: err.message });
    console.error('[Session] Failed to save session:', err);
  }
}

// Debounced save to avoid excessive writes
const debouncedSaveSession = debounce(saveSession, 500);

/**
 * Load session from backend
 * @returns {{ session: Object|null, loadFailed: boolean }}
 */
async function loadSession() {
  try {
    logger.session('Loading session from backend');
    const res = await fetch('/api/sessions');
    if (!res.ok) {
      logger.session('Session load failed - server error', { status: res.status });
      return { session: null, loadFailed: true };
    }
    const session = await res.json();
    logger.session('Session loaded', { 
      tabCount: session?.tabs?.length || 0,
      activeTabId: session?.activeTabId
    });
    return { session, loadFailed: false };
  } catch (err) {
    logger.session('Failed to load session', { error: err.message });
    console.error('[Session] Failed to load session:', err);
    return { session: null, loadFailed: true };
  }
}

/**
 * Hook for managing terminal tabs
 * @param {Object} initialShellConfig - Default shell configuration
 * @returns {Object} Tab state and actions
 */
export function useTabManager(initialShellConfig) {
  // Track if session has been loaded
  const sessionLoadedRef = useRef(false);
  
  // Initialize with one default tab
  const [state, setState] = useState(() => {
    const initialTab = createTab(initialShellConfig, 1);
    return {
      tabs: [initialTab],
      activeTabId: initialTab.id,
      sessionLoaded: false,
    };
  });

  // Store initialShellConfig in a ref so callbacks don't need it as dependency
  const configRef = useRef(initialShellConfig);
  configRef.current = initialShellConfig;

  // Load session on mount
  useEffect(() => {
    if (sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;

    loadSession().then(({ session, loadFailed }) => {
      if (loadFailed) {
        // Don't set sessionLoaded to true on failure - prevents overwriting saved sessions
        // User will start with default tab but we won't save over their existing sessions
        logger.session('Session load failed - skipping save to preserve existing sessions');
        setState(prev => ({ ...prev, sessionLoaded: false }));
        return;
      }
      
      if (session && session.tabs && session.tabs.length > 0) {
        // Restore tabs from session
        const restoredTabs = session.tabs.map((tabState, index) => ({
          id: tabState.id || generateId(),
          title: tabState.title || `Terminal ${index + 1}`,
          shellConfig: tabState.shellConfig || configRef.current,
          colorTheme: tabState.colorTheme || themeOrder[index % themeOrder.length],
          mode: tabState.mode || 'dark',
          autoRespond: tabState.autoRespond || false,
          amEnabled: tabState.amEnabled || false,
          currentDirectory: tabState.currentDirectory || null,
          createdAt: Date.now(),
        }));

        // Update idCounter to avoid collisions
        idCounter = restoredTabs.length + 1;
        themeIndex = restoredTabs.length;

        // Find active tab, default to first if not found
        const activeId = session.activeTabId && restoredTabs.some(t => t.id === session.activeTabId)
          ? session.activeTabId
          : restoredTabs[0].id;

        setState({
          tabs: restoredTabs,
          activeTabId: activeId,
          sessionLoaded: true,
        });
      } else {
        // Empty session from server - ok to save new tabs
        setState(prev => ({ ...prev, sessionLoaded: true }));
      }
    });
  }, []);

  // Save session when tabs or active tab changes (debounced)
  useEffect(() => {
    if (!state.sessionLoaded) return;
    debouncedSaveSession(state.tabs, state.activeTabId);
  }, [state.tabs, state.activeTabId, state.sessionLoaded]);

  // Computed: get active tab object
  const activeTab = useMemo(() => {
    return state.tabs.find(t => t.id === state.activeTabId) || null;
  }, [state.tabs, state.activeTabId]);

  // Track created tab info via ref to handle React's async setState batching
  // (No longer needed - using local variable approach instead)

  /**
   * Create a new tab
   * @param {Object} shellConfig - Optional shell config, defaults to initialShellConfig
   * @returns {{ success: boolean, tabId: string|null, tab: Object|null, error: string|null }}
   */
  const createTabAction = useCallback((shellConfig) => {
    // Check max tabs BEFORE calling setState to avoid async issues
    // We need to read current state synchronously
    let currentTabCount = 0;
    let result = null;
    
    setState(prev => {
      currentTabCount = prev.tabs.length;
      
      if (prev.tabs.length >= MAX_TABS) {
        // Don't create - already at max
        logger.tabs('Max tabs limit reached', { 
          currentCount: prev.tabs.length, 
          maxTabs: MAX_TABS 
        });
        result = { success: false, tabId: null, tab: null, error: 'max_tabs' };
        return prev;
      }

      const config = shellConfig || configRef.current;
      const newTabNumber = prev.tabs.length + 1;
      const newTab = createTab(config, newTabNumber);
      
      logger.tabs('Tab created successfully', { 
        tabId: newTab.id, 
        newTabCount: prev.tabs.length + 1,
        colorTheme: newTab.colorTheme
      });
      
      // Store result for return - setState callback runs synchronously
      result = { success: true, tabId: newTab.id, tab: newTab, error: null };
      
      return {
        ...prev, // Preserve other state like sessionLoaded
        tabs: [...prev.tabs, newTab],
        activeTabId: newTab.id,
      };
    });

    // Result is set synchronously within setState callback
    return result || { success: true, tabId: null, tab: null, error: null };
  }, []);

  /**
   * Close a tab
   * @param {string} tabId - ID of tab to close
   */
  const closeTab = useCallback((tabId) => {
    logger.tabs('Close tab requested', { tabId });
    
    setState(prev => {
      // Don't close the last tab
      if (prev.tabs.length <= 1) {
        logger.tabs('Cannot close last tab', { tabId, tabCount: prev.tabs.length });
        return prev;
      }

      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        logger.tabs('Tab not found for close', { tabId });
        return prev;
      }

      const newTabs = prev.tabs.filter(t => t.id !== tabId);
      let newActiveTabId = prev.activeTabId;

      // If we're closing the active tab, switch to another
      if (tabId === prev.activeTabId) {
        // Prefer the previous tab, or next if closing first
        const newActiveIndex = tabIndex > 0 ? tabIndex - 1 : 0;
        newActiveTabId = newTabs[newActiveIndex]?.id || null;
        logger.tabs('Closed active tab, switching', { 
          closedTabId: tabId, 
          newActiveTabId 
        });
      }

      logger.tabs('Tab closed', { 
        tabId, 
        remainingTabs: newTabs.length 
      });

      return {
        ...prev, // Preserve sessionLoaded
        tabs: newTabs,
        activeTabId: newActiveTabId,
      };
    });
  }, []);

  /**
   * Switch to a specific tab
   * @param {string} tabId - ID of tab to switch to
   */
  const switchTab = useCallback((tabId) => {
    setState(prev => {
      const targetTab = prev.tabs.find(t => t.id === tabId);
      if (!targetTab) {
        logger.tabs('Switch tab failed - tab not found', { tabId });
        return prev;
      }
      
      logger.tabs('Switching tab', { 
        fromTabId: prev.activeTabId, 
        toTabId: tabId,
        targetColorTheme: targetTab.colorTheme 
      });
      
      return {
        ...prev,
        activeTabId: tabId,
      };
    });
  }, []);

  /**
   * Update a tab's title
   * @param {string} tabId - ID of tab to update
   * @param {string} title - New title
   */
  const updateTabTitle = useCallback((tabId, title) => {
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        return prev;
      }

      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], title };
      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  /**
   * Reorder tabs
   * @param {number} fromIndex - Source index
   * @param {number} toIndex - Destination index
   */
  const reorderTabs = useCallback((fromIndex, toIndex) => {
    setState(prev => {
      // Validate indices
      if (
        fromIndex < 0 ||
        fromIndex >= prev.tabs.length ||
        toIndex < 0 ||
        toIndex >= prev.tabs.length
      ) {
        return prev;
      }

      const newTabs = [...prev.tabs];
      const [removed] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, removed);
      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  /**
   * Update a tab's shell configuration
   * @param {string} tabId - ID of tab to update
   * @param {Object} shellConfig - New shell configuration
   */
  const updateTabShellConfig = useCallback((tabId, shellConfig) => {
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        return prev;
      }

      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], shellConfig: { ...shellConfig } };
      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  /**
   * Update a tab's color theme
   * @param {string} tabId - ID of tab to update
   * @param {string} colorTheme - New color theme name
   */
  const updateTabColorTheme = useCallback((tabId, colorTheme) => {
    logger.theme('Updating tab color theme', { tabId, colorTheme });
    
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        logger.theme('Tab not found for theme update', { tabId });
        return prev;
      }

      const oldTheme = prev.tabs[tabIndex].colorTheme;
      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], colorTheme };
      
      logger.theme('Tab theme updated', { 
        tabId, 
        oldTheme, 
        newTheme: colorTheme 
      });
      
      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  /**
   * Toggle auto-respond for a tab
   * @param {string} tabId - ID of tab to update
   */
  const toggleTabAutoRespond = useCallback((tabId) => {
    logger.tabs('Toggling tab auto-respond', { tabId });
    
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        logger.tabs('Tab not found for auto-respond toggle', { tabId });
        return prev;
      }

      const oldValue = prev.tabs[tabIndex].autoRespond;
      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], autoRespond: !oldValue };
      
      logger.tabs('Tab auto-respond toggled', { 
        tabId, 
        oldValue, 
        newValue: !oldValue 
      });
      
      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  /**
   * Toggle AM (Artificial Memory) logging for a tab
   * @param {string} tabId - ID of tab to update
   */
  const toggleTabAM = useCallback((tabId) => {
    logger.tabs('Toggling tab AM', { tabId });
    
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        logger.tabs('Tab not found for AM toggle', { tabId });
        return prev;
      }

      const oldValue = prev.tabs[tabIndex].amEnabled;
      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], amEnabled: !oldValue };
      
      logger.tabs('Tab AM toggled', { 
        tabId, 
        oldValue, 
        newValue: !oldValue 
      });
      
      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  /**
   * Toggle Forge Vision overlays for a tab
   * @param {string} tabId - ID of tab to update
   */
  const toggleTabVision = useCallback((tabId) => {
    logger.tabs('Toggling tab Vision', { tabId });
    
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        logger.tabs('Tab not found for Vision toggle', { tabId });
        return prev;
      }

      const oldValue = prev.tabs[tabIndex].visionEnabled || false;
      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], visionEnabled: !oldValue };
      
      logger.tabs('Tab Vision toggled', { 
        tabId, 
        oldValue, 
        newValue: !oldValue 
      });
      
      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  /**
   * Toggle assistant for a specific tab
   */
  const toggleTabAssistant = useCallback((tabId) => {
    logger.tabs('Toggling tab Assistant', { tabId });
    
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        logger.tabs('Tab not found for Assistant toggle', { tabId });
        return prev;
      }

      const oldValue = prev.tabs[tabIndex].assistantEnabled || false;
      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], assistantEnabled: !oldValue };
      
      logger.tabs('Tab Assistant toggled', { 
        tabId, 
        oldValue, 
        newValue: !oldValue 
      });
      
      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  /**
   * Toggle light/dark mode for a tab
   * @param {string} tabId - ID of tab to update
   */
  const toggleTabMode = useCallback((tabId) => {
    logger.tabs('Toggling tab mode', { tabId });
    
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        logger.tabs('Tab not found for mode toggle', { tabId });
        return prev;
      }

      const oldMode = prev.tabs[tabIndex].mode || 'dark';
      const newMode = oldMode === 'dark' ? 'light' : 'dark';
      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], mode: newMode };
      
      logger.tabs('Tab mode toggled', { 
        tabId, 
        oldMode, 
        newMode 
      });
      
      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  /**
   * Update a tab's current directory
   * @param {string} tabId - ID of tab to update
   * @param {string} currentDirectory - Current working directory path
   */
  const updateTabDirectory = useCallback((tabId, currentDirectory) => {
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        return prev;
      }

      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], currentDirectory };
      
      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    createTab: createTabAction,
    closeTab,
    switchTab,
    updateTabTitle,
    updateTabShellConfig,
    updateTabColorTheme,
    toggleTabAutoRespond,
    toggleTabAM,
    toggleTabVision,
    toggleTabAssistant,
    toggleTabMode,
    updateTabDirectory,
    reorderTabs,
  };
}
