import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { themeOrder } from '../themes';
import { logger } from '../utils/logger';
import { isFileLikeName } from '../utils/projectFolder';
import { computeTabLabel, dedupeLabel, shouldRelabelForDirectory } from '../utils/tabLabel';

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
    // Tab naming rebuild: one fixed rule — the project-root name from the initial
    // directory, computed ONCE here. An explicit options.title (e.g. a manual
    // rename or a restored label) always wins. De-duplication (` #N`) is applied
    // by the caller against the open tabs' labels.
    title: options.title || computeTabLabel(currentDirectory),
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
      // Persisted so a manual rename stays immune to relabel-on-project-switch
      // across restarts (see updateTabTitle / updateTabDirectory).
      isManuallyRenamed: tab.isManuallyRenamed || false,

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
 * @returns {Object} Tab state and actions
 */
export function useTabManager(initialShellConfig, defaultThemePreference = 'auto-cycle') {
  // Track if session has been loaded
  const sessionLoadedRef = useRef(false);

  // Store current state in a ref for synchronous access
  const stateRef = useRef(null);

  // Store defaultThemePreference in ref for callbacks
  const themePreferenceRef = useRef(defaultThemePreference);
  themePreferenceRef.current = defaultThemePreference;

  // Initialize with one default tab
  const [state, setState] = useState(() => {
    const initialTab = createTab(initialShellConfig, 1, null, null, null, defaultThemePreference);
    return {
      tabs: [initialTab],
      activeTabId: initialTab.id,
      sessionLoaded: false,
      // Tracks whether a session load was attempted but failed, so the render
      // guard can unblock terminals even when sessionLoaded stays false.
      sessionLoadFailed: false,
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
        // Keep sessionLoaded=false to prevent overwriting the saved session on disk.
        // Set sessionLoadFailed=true so the render guard unblocks terminals — the
        // default tab renders with currentDirectory=null (server CWD), which is
        // acceptable since the saved session is already inaccessible.
        logger.session('Session load failed - terminals will render with default state');
        setState(prev => ({ ...prev, sessionLoaded: false, sessionLoadFailed: true }));
        return;
      }
      
      if (session && session.tabs && session.tabs.length > 0) {
        // Restore tabs from session
        const restoredTabs = session.tabs.map((tabState, index) => {
          // Tab naming rebuild: labels are write-once, so restore the saved title
          // as-is. Self-heal only a legacy/corrupted title (empty, file-like, or
          // carrying control characters from the old rename bug) by recomputing it
          // once from the saved directory.
          let title = tabState.title;
          const isCorruptTitle = !title || title === '~' || title.startsWith('Terminal ') || isFileLikeName(title) || Array.from(title).some(function (ch) { return ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127; });
          if (isCorruptTitle) {
            title = computeTabLabel(tabState.currentDirectory);
            logger.session('Self-healed a corrupted tab title', {
              tabId: tabState.id,
              directory: tabState.currentDirectory,
              healedTitle: title,
            });
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
            // Preserve a manual rename across restarts. A self-healed (formerly
            // corrupt) title is NOT treated as manual, so it can still relabel on a
            // later project switch.
            isManuallyRenamed: isCorruptTitle ? false : (tabState.isManuallyRenamed || false),

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
    // Guard: stateRef is set by useEffect after first render; protect against
    // edge cases where the button is clicked before the effect has run.
    const currentState = stateRef.current;
    if (!currentState) {
      logger.tabs('Tab creation skipped - state not yet initialized');
      return { success: false, tabId: null, tab: null, error: 'not_initialized' };
    }

    // Quick pre-check against stateRef (optimization only — the authoritative
    // check lives inside the setState updater where prev is always fresh).
    if (currentState.tabs.length >= MAX_TABS) {
      logger.tabs('Max tabs limit reached (pre-check)', {
        currentCount: currentState.tabs.length,
        maxTabs: MAX_TABS,
      });
      return { success: false, tabId: null, tab: null, error: 'max_tabs' };
    }

    // These are set inside the setState updater which React executes
    // synchronously, so they're populated by the time we return below.
    let createdTab = null;
    let rejected = false;

    setState(prev => {
      // Authoritative MAX_TABS check using prev (guaranteed fresh even when
      // multiple createTabAction calls race during the same render batch).
      if (prev.tabs.length >= MAX_TABS) {
        logger.tabs('Max tabs limit reached (authoritative)', {
          currentCount: prev.tabs.length,
          maxTabs: MAX_TABS,
        });
        rejected = true;
        return prev; // No state change
      }

      const config = shellConfig || configRef.current;
      // Tab naming rebuild: the label is the project root, de-duplicated against
      // the labels already open so a second tab in the same project becomes
      // "name #2" (lowest free suffix).
      const dedupedTitle = dedupeLabel(computeTabLabel(currentDirectory), prev.tabs.map(tab => tab.title));
      const newTab = createTab(config, prev.tabs.length + 1, null, null, currentDirectory, themePreferenceRef.current, {
        title: dedupedTitle,
      });
      createdTab = newTab;

      logger.tabs('Tab created successfully', {
        tabId: newTab.id,
        newTabCount: prev.tabs.length + 1,
        colorTheme: newTab.colorTheme,
      });

      return {
        ...prev,
        tabs: [...prev.tabs, newTab],
        activeTabId: newTab.id,
      };
    });

    // If the updater rejected (MAX_TABS hit with fresh state), report failure.
    if (rejected) {
      return { success: false, tabId: null, tab: null, error: 'max_tabs' };
    }

    return {
      success: true,
      tabId: createdTab?.id || null,
      tab: createdTab || null,
      error: null,
    };
  }, []);

  /**
   * Close a tab
   * @param {string} tabId - ID of tab to close
   */
  const closeTab = useCallback((tabId) => {
    logger.tabs('Close tab requested', { tabId });

    // Closing a tab is the explicit signal that its SDD pipeline is done with (specs/011).
    // Tell the backend so it can safe-clean an isolated worktree (merged + clean only; an
    // un-merged or dirty worktree is retained). Best-effort: never block tab close on it.
    fetch('/api/sdd/worktree-close', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: tabId }),
    }).catch(() => {});

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
   * Update a tab's title. This is the explicit user-rename path, so the tab is
   * marked as manually renamed — which makes its label permanent and immune to the
   * automatic relabel-on-project-switch in updateTabDirectory.
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
      newTabs[tabIndex] = { ...newTabs[tabIndex], title, isManuallyRenamed: true };
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

      const targetTab = prev.tabs[tabIndex];
      const updatedTab = { ...targetTab, currentDirectory };

      // Tab-naming rebuild kept labels write-once to stop title drift. The single
      // sanctioned exception lives here: when the shell moves to a *different
      // project root* (not just a deeper folder), relabel the tab to match — but
      // never over a user's manual rename. shouldRelabelForDirectory returns null
      // for deep navigation and temp detours, so this cannot reintroduce drift.
      if (!targetTab.isManuallyRenamed) {
        const switchedRootLabel = shouldRelabelForDirectory(targetTab.currentDirectory, currentDirectory);
        if (switchedRootLabel) {
          const otherTabLabels = prev.tabs
            .filter((_, index) => index !== tabIndex)
            .map(tab => tab.title);
          updatedTab.title = dedupeLabel(switchedRootLabel, otherTabLabels);
        }
      }

      const newTabs = [...prev.tabs];
      newTabs[tabIndex] = updatedTab;

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
    sessionLoadFailed: state.sessionLoadFailed || false,
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
