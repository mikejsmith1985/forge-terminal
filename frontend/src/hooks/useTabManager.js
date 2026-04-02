import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { themeOrder } from '../themes';
import { logger } from '../utils/logger';
import { extractProjectFolder, getTabTitle, getShellLabel, isStaticNamingStrategy } from '../utils/projectFolder';

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
 * @param {string} defaultThemePreference - Default theme preference: 'auto-cycle', 'auto-cycle-dark', 'auto-cycle-light', or specific theme name
 */
function createTab(shellConfig, tabNumber, colorTheme = null, mode = null, currentDirectory = null, defaultThemePreference = 'auto-cycle', options = {}) {
  // Auto-assign theme based on preference
  let assignedTheme;
  let assignedMode;

  if (colorTheme) {
    // Explicit override - use it
    assignedTheme = colorTheme;
    assignedMode = mode || 'dark'; // Default to dark if not specified
  } else if (defaultThemePreference === 'auto-cycle') {
    // Auto-cycle through themes with alternating dark/light
    assignedTheme = themeOrder[themeIndex % themeOrder.length];
    assignedMode = themeIndex % 2 === 0 ? 'dark' : 'light';
    themeIndex++;
  } else if (defaultThemePreference === 'auto-cycle-dark') {
    // Auto-cycle through themes in dark mode only
    assignedTheme = themeOrder[themeIndex % themeOrder.length];
    assignedMode = 'dark';
    themeIndex++;
  } else if (defaultThemePreference === 'auto-cycle-light') {
    // Auto-cycle through themes in light mode only
    assignedTheme = themeOrder[themeIndex % themeOrder.length];
    assignedMode = 'light';
    themeIndex++;
  } else {
    // Use specific theme preference in dark mode by default
    assignedTheme = defaultThemePreference;
    assignedMode = mode || 'dark';
  }

  const newTab = {
    id: generateId(),
    title: (() => {
      if (options.title) return options.title;
      const strategy = options.namingStrategy || 'project-root';
      const prefix   = options.namingPrefix   || 'Dev';
      if (strategy === 'shell-type') {
        return `${getShellLabel(shellConfig?.shellType)} ${tabNumber}`;
      }
      if (strategy === 'custom-prefix') {
        return `${prefix} ${tabNumber}`;
      }
      if (strategy === 'numbered') {
        return `Terminal ${tabNumber}`;
      }
      // Dynamic strategies (project-root, current-dir, parent-child):
      // seed from currentDirectory if available, otherwise generic placeholder
      if (currentDirectory) {
        return getTabTitle(currentDirectory, strategy, { tabNumber, prefix, fallback: `Terminal ${tabNumber}` });
      }
      return `Terminal ${tabNumber}`;
    })(),
    shellConfig: { ...shellConfig },
    colorTheme: assignedTheme,
    mode: assignedMode, // Per-tab light/dark mode
    viewMode: 'terminal', // v3.8.2: Terminal only (chat and notebook removed)
    // v3.12.3: amEnabled removed - AM system no longer exists
    visionEnabled: false, // Forge Vision overlays - DEFAULT OFF (Dev Mode feature)
    currentDirectory: currentDirectory || null, // Current working directory
    createdAt: Date.now(),
    type: options.type || 'terminal',
    file: options.file || null,
    path: options.path || null,
  };
  
  logger.tabs('Creating tab object', { 
    tabId: newTab.id,
    tabNumber, 
    colorTheme: assignedTheme,
    mode: assignedMode,
    viewMode: newTab.viewMode,
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
      viewMode: 'terminal', // v3.8.2: Terminal only (viewMode no longer needed)
      // v3.12.3: amEnabled removed
      visionEnabled: tab.visionEnabled || false,
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
 * @param {Object} initialShellConfig       - Default shell configuration
 * @param {string} defaultThemePreference   - Default theme preference: 'auto-cycle' or specific theme name
 * @param {string} [defaultNamingStrategy]  - Tab naming strategy (see getTabTitle)
 * @param {string} [defaultNamingPrefix]    - Custom prefix for the 'custom-prefix' strategy
 * @returns {Object} Tab state and actions
 */
export function useTabManager(initialShellConfig, defaultThemePreference = 'auto-cycle', defaultNamingStrategy = 'project-root', defaultNamingPrefix = 'Dev') {
  // Track if session has been loaded
  const sessionLoadedRef = useRef(false);

  // Store current state in a ref for synchronous access
  const stateRef = useRef(null);

  // Store defaultThemePreference in ref for callbacks
  const themePreferenceRef = useRef(defaultThemePreference);
  themePreferenceRef.current = defaultThemePreference;

  // Store naming preferences in refs so createTabAction callback always reads the latest value
  const namingStrategyRef = useRef(defaultNamingStrategy);
  namingStrategyRef.current = defaultNamingStrategy;
  const namingPrefixRef = useRef(defaultNamingPrefix);
  namingPrefixRef.current = defaultNamingPrefix;

  // Initialize with one default tab
  const [state, setState] = useState(() => {
    const initialTab = createTab(initialShellConfig, 1, null, null, null, defaultThemePreference, {
      namingStrategy: defaultNamingStrategy,
      namingPrefix: defaultNamingPrefix,
    });
    return {
      tabs: [initialTab],
      activeTabId: initialTab.id,
      sessionLoaded: false,
    };
  });
  
  // Keep stateRef in sync with actual state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
        const restoredTabs = session.tabs.map((tabState, index) => {
          const strategy = namingStrategyRef.current || 'project-root';
          let title = tabState.title || `Terminal ${index + 1}`;

          // Re-derive title from saved directory when using a dynamic strategy
          if (!isStaticNamingStrategy(strategy) && tabState.currentDirectory &&
              (title.startsWith('Terminal ') || title === 'forge-terminal' || title === '~' || !title)) {
            const derived = getTabTitle(tabState.currentDirectory, strategy, {
              tabNumber: index + 1,
              prefix: namingPrefixRef.current || 'Dev',
              fallback: `Terminal ${index + 1}`,
            });
            // Guard against saved paths ending in a filename
            const looksLikeFile = derived && /\.(ps1|sh|bat|cmd|py|js|ts|jsx|tsx|rb|pl|php|go|rs|java|c|cpp|cs|lua|swift|kt|exe|msi)(\s.*)?$/i.test(derived);
            if (derived && !looksLikeFile && derived !== '~') {
              title = derived;
              logger.session('Derived tab title from directory', {
                tabId: tabState.id,
                directory: tabState.currentDirectory,
                strategy,
                derivedTitle: title,
              });
            }
          }
          
          return {
            id: tabState.id || generateId(),
            title: title,
            shellConfig: tabState.shellConfig || configRef.current,
            colorTheme: tabState.colorTheme || themeOrder[index % themeOrder.length],
            mode: tabState.mode || 'dark',
            viewMode: 'terminal', // v3.8.2: Terminal only (chat and notebook removed)
            // v3.12.3: amEnabled removed
            visionEnabled: tabState.visionEnabled || false,
            currentDirectory: tabState.currentDirectory || null,

            createdAt: Date.now(),
          };
        });

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
   * @param {string|null} currentDirectory - Optional starting directory to inherit from active tab
   * @returns {{ success: boolean, tabId: string|null, tab: Object|null, error: string|null }}
   */
  const createTabAction = useCallback((shellConfig, currentDirectory = null) => {
    // Check current state synchronously from ref
    const currentState = stateRef.current;
    
    if (currentState.tabs.length >= MAX_TABS) {
      // Already at max - don't even call setState
      logger.tabs('Max tabs limit reached', { 
        currentCount: currentState.tabs.length, 
        maxTabs: MAX_TABS 
      });
      return { success: false, tabId: null, tab: null, error: 'max_tabs' };
    }

    // Not at max yet - proceed with creation
    let createdTab = null;
    
    setState(prev => {
      const config = shellConfig || configRef.current;
      const newTabNumber = prev.tabs.length + 1;
      const newTab = createTab(config, newTabNumber, null, null, currentDirectory, themePreferenceRef.current, {
        namingStrategy: namingStrategyRef.current,
        namingPrefix: namingPrefixRef.current,
      });
      createdTab = newTab;
      
      logger.tabs('Tab created successfully', { 
        tabId: newTab.id, 
        newTabCount: prev.tabs.length + 1,
        colorTheme: newTab.colorTheme
      });
      
      return {
        ...prev,
        tabs: [...prev.tabs, newTab],
        activeTabId: newTab.id,
      };
    });

    return { 
      success: true, 
      tabId: createdTab?.id || null, 
      tab: createdTab || null, 
      error: null 
    };
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
   * v3.12.3: Toggle AM removed - AM system no longer exists
   * Kept as no-op for API compatibility
   * @param {string} tabId - ID of tab to update
   */
  const toggleTabAM = useCallback((tabId) => {
    logger.tabs('toggleTabAM called but AM system removed in v3.12.3', { tabId });
    // No-op - AM system removed
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
  /**
   * Toggle light/dark mode for a tab
   * @param {string} tabId - ID of tab to update
   */
  const toggleTabMode = useCallback((tabId) => {
    logger.tabs('Toggling tab mode', { tabId});
    
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
   * Change theme and mode for a tab
   * @param {string} tabId - ID of tab to update
   * @param {string} themeName - New theme name
   * @param {string} themeMode - New mode ('dark' or 'light')
   */
  const changeTabTheme = useCallback((tabId, themeName, themeMode) => {
    console.log('[useTabManager] changeTabTheme called:', { tabId, themeName, themeMode });
    logger.tabs('Changing tab theme', { tabId, themeName, themeMode });
    
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        logger.tabs('Tab not found for theme change', { tabId });
        console.warn('[useTabManager] Tab not found:', tabId);
        return prev;
      }

      const newTabs = [...prev.tabs];
      const oldTab = newTabs[tabIndex];
      newTabs[tabIndex] = { 
        ...newTabs[tabIndex], 
        colorTheme: themeName,
        mode: themeMode 
      };
      
      console.log('[useTabManager] Tab theme updated:', {
        tabId,
        oldTheme: oldTab.colorTheme,
        oldMode: oldTab.mode,
        newTheme: themeName,
        newMode: themeMode
      });
      
      logger.tabs('Tab theme changed', { 
        tabId, 
        newTheme: themeName,
        newMode: themeMode 
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

  /**
   * Update a tab's modified (dirty) state
   * @param {string} tabId - ID of tab to update
   * @param {boolean} modified - Whether the tab has unsaved changes
   */
  const updateTabModified = useCallback((tabId, modified) => {
    setState(prev => {
      const tabIndex = prev.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) {
        return prev;
      }

      // Only update if changed
      if (prev.tabs[tabIndex].modified === modified) {
        return prev;
      }

      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], modified };

      return {
        ...prev,
        tabs: newTabs,
      };
    });
  }, []);

  /**
   * Toggle view mode for a tab (chat -> terminal -> notebook -> chat)
   * @param {string} tabId - ID of tab to update
   * @param {string} targetMode - Optional: directly set to a specific mode
   */
  const toggleTabViewMode = useCallback((tabId, targetMode = null) => {
    // v3.8.2: Notebook removed - terminal is the only view mode
    // This function is kept for API compatibility but does nothing
    logger.tabs('toggleTabViewMode called but viewMode is now terminal-only', { tabId, targetMode });
    return; // No-op
  }, []);

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    sessionLoaded: state.sessionLoaded,
    createTab: createTabAction,
    closeTab,
    switchTab,
    updateTabTitle,
    updateTabShellConfig,
    updateTabColorTheme,
    toggleTabAM,
    toggleTabVision,
    toggleTabMode,
    changeTabTheme,
    updateTabModified,
    toggleTabViewMode, // v3.3.0: Toggle between chat and terminal view
    updateTabDirectory,
    reorderTabs,
  };
}
