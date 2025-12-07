import React, { useState, useEffect, useRef, useCallback } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Moon, Sun, Plus, Minus, MessageSquare, Power, Settings, RotateCcw, Palette, PanelLeft, PanelRight, Download, RefreshCw, Folder, Command } from 'lucide-react';
import ForgeTerminal from './components/ForgeTerminal'
import CommandCards from './components/CommandCards'
import CommandModal from './components/CommandModal'
import FeedbackModal from './components/FeedbackModal'
import SettingsModal from './components/SettingsModal'
import UpdateModal from './components/UpdateModal'
import WelcomeModal from './components/WelcomeModal'
import ShellToggle from './components/ShellToggle'
import TabBar from './components/TabBar'
import SearchBar from './components/SearchBar'
import FileExplorer from './components/FileExplorer'
import MonacoEditor from './components/MonacoEditor'
import { ToastContainer, useToast } from './components/Toast'
import { themes, themeOrder, applyTheme } from './themes'
import { useTabManager } from './hooks/useTabManager'
import { useDevMode } from './hooks/useDevMode'
import { logger } from './utils/logger'

const MAX_TABS = 20;

function App() {
  const [commands, setCommands] = useState([])
  const [commandsLoading, setCommandsLoading] = useState(true)
  const [commandsError, setCommandsError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false)
  const [editingCommand, setEditingCommand] = useState(null)
  const [theme, setTheme] = useState('dark')
  const [colorTheme, setColorTheme] = useState(() => {
    return localStorage.getItem('colorTheme') || 'molten';
  })
  const [sidebarPosition, setSidebarPosition] = useState(() => {
    return localStorage.getItem('sidebarPosition') || 'right';
  })
  const [shellConfig, setShellConfig] = useState({ shellType: 'powershell', wslDistro: '', wslHomePath: '' })
  const [wslAvailable, setWslAvailable] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('terminalFontSize');
    return saved ? parseInt(saved, 10) : 14;
  })
  
  // Update state - persists across toast dismissal
  const [updateInfo, setUpdateInfo] = useState(null)
  const [currentVersion, setCurrentVersion] = useState('')
  
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const [searchCurrentMatch, setSearchCurrentMatch] = useState(0)
  
  // Tab waiting state (for prompt watcher)
  const [waitingTabs, setWaitingTabs] = useState({})
  
  // File explorer and editor state
  const [sidebarView, setSidebarView] = useState('cards') // 'cards' or 'files'
  const [editorFile, setEditorFile] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  
  // Tab management
  const {
    tabs,
    activeTabId,
    activeTab,
    createTab,
    closeTab,
    switchTab,
    updateTabTitle,
    updateTabShellConfig,
    updateTabColorTheme,
    toggleTabAutoRespond,
    toggleTabAM,
    toggleTabMode,
    updateTabDirectory,
    reorderTabs,
  } = useTabManager(shellConfig);
  
  // DevMode state
  const { devMode, setDevMode, isInitialized: devModeInitialized } = useDevMode();
  
  // Store refs for each terminal by tab ID
  const terminalRefs = useRef({});
  const { toasts, addToast, removeToast } = useToast()

  const DEFAULT_FONT_SIZE = 14;
  const MIN_FONT_SIZE = 10;
  const MAX_FONT_SIZE = 24;

  // Get ref for active terminal
  const getActiveTerminalRef = useCallback(() => {
    return activeTabId ? terminalRefs.current[activeTabId] : null;
  }, [activeTabId]);

  const handleFontSizeChange = (delta) => {
    setFontSize(prev => {
      const newSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, prev + delta));
      localStorage.setItem('terminalFontSize', newSize.toString());
      return newSize;
    });
  };

  const handleFontSizeReset = () => {
    setFontSize(DEFAULT_FONT_SIZE);
    localStorage.setItem('terminalFontSize', DEFAULT_FONT_SIZE.toString());
  };

  const cycleColorTheme = () => {
    // Cycle the active tab's color theme
    const currentTabTheme = activeTab?.colorTheme || colorTheme;
    const currentIndex = themeOrder.indexOf(currentTabTheme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    const nextTheme = themeOrder[nextIndex];
    
    logger.theme('Cycling color theme', { 
      activeTabId, 
      currentTheme: currentTabTheme, 
      nextTheme,
      themeIndex: nextIndex 
    });
    
    // Update the active tab's theme
    if (activeTabId) {
      updateTabColorTheme(activeTabId, nextTheme);
    }
    
    // Also update the global colorTheme state and apply
    setColorTheme(nextTheme);
    localStorage.setItem('colorTheme', nextTheme);
    applyTheme(nextTheme, theme);
    addToast(`Theme: ${themes[nextTheme].name}`, 'info', 1500);
  };

  const toggleSidebarPosition = () => {
    const newPosition = sidebarPosition === 'right' ? 'left' : 'right';
    setSidebarPosition(newPosition);
    localStorage.setItem('sidebarPosition', newPosition);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadCommands()
    loadConfig()
    checkWSL()
    checkForUpdates()
    checkWelcome()
    // Check system preference or saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedColorTheme = localStorage.getItem('colorTheme') || 'molten';
    setTheme(savedTheme);
    setColorTheme(savedColorTheme);
    document.documentElement.className = savedTheme;
    applyTheme(savedColorTheme, savedTheme);
    
    // Set up SSE for real-time update notifications
    let eventSource = null;
    const connectSSE = () => {
      eventSource = new EventSource('/api/update/events');
      
      eventSource.addEventListener('connected', (e) => {
        console.log('[SSE] Connected to update events');
      });
      
      eventSource.addEventListener('update', (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[SSE] Update notification received:', data);
          if (data.available) {
            setUpdateInfo(data);
            // Show toast notification
            const dismissedVersion = localStorage.getItem('updateDismissedVersion');
            if (dismissedVersion !== data.latestVersion) {
              addToast(
                `Update available: ${data.latestVersion}`,
                'update',
                0,
                {
                  action: 'View Update',
                  onAction: () => setIsUpdateModalOpen(true),
                  secondaryAction: 'Later',
                  onSecondaryAction: () => {
                    localStorage.setItem('updateDismissedAt', Date.now().toString());
                    localStorage.setItem('updateDismissedVersion', data.latestVersion);
                  }
                }
              );
            }
          }
        } catch (err) {
          console.error('[SSE] Error parsing update event:', err);
        }
      });
      
      eventSource.onerror = () => {
        console.log('[SSE] Connection error, will retry in 30s');
        eventSource.close();
        setTimeout(connectSSE, 30000);
      };
    };
    
    connectSSE();
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [])

  // Apply theme when active tab changes (handles new tab creation and tab switching)
  useEffect(() => {
    if (activeTab?.colorTheme) {
      const tabMode = activeTab.mode || 'dark';
      logger.theme('Applying theme for active tab', { 
        tabId: activeTab.id, 
        colorTheme: activeTab.colorTheme,
        mode: tabMode
      });
      setColorTheme(activeTab.colorTheme);
      applyTheme(activeTab.colorTheme, tabMode);
    }
  }, [activeTab?.id, activeTab?.colorTheme, activeTab?.mode]);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data && data.shellType) {
        // Check if config differs from the initial default
        const defaultConfig = { shellType: 'powershell', wslDistro: '', wslHomePath: '' };
        const configDiffers = 
          data.shellType !== defaultConfig.shellType ||
          data.wslDistro !== defaultConfig.wslDistro ||
          data.wslHomePath !== defaultConfig.wslHomePath;
        
        setShellConfig(data);
        // Update the first tab's shell config to match loaded settings
        if (tabs.length > 0) {
          updateTabShellConfig(tabs[0].id, data);
        }
        // Reconnect the terminal if loaded config differs from default
        // (the initial tab was created with default settings before config loaded)
        if (configDiffers) {
          setTimeout(() => {
            const termRef = getActiveTerminalRef();
            if (termRef) {
              termRef.reconnect();
            }
          }, 500);
        }
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }

  const saveConfig = async (config) => {
    const oldShell = shellConfig.shellType;
    const newShell = config.shellType;
    
    // Show warning toast when switching between PS and WSL
    if ((oldShell === 'powershell' && newShell === 'wsl') || 
        (oldShell === 'wsl' && newShell === 'powershell')) {
      addToast(`Switching from ${oldShell.toUpperCase()} to ${newShell.toUpperCase()}. Current session will end.`, 'warning', 4000);
    } else if (oldShell !== newShell) {
      addToast(`Switching to ${newShell.toUpperCase()}`, 'info', 2000);
    }
    
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      setShellConfig(config);
      // Hard refresh the page to restart terminal with new config
      // This is more reliable than websocket reconnection
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error('Failed to save config:', err);
      addToast('Failed to save shell configuration', 'error', 3000);
    }
  }

  const checkWSL = async () => {
    try {
      const res = await fetch('/api/wsl/detect');
      const data = await res.json();
      setWslAvailable(data.available || false);
    } catch (err) {
      setWslAvailable(false);
    }
  }

  const checkForUpdates = async () => {
    try {
      // Get current version
      const versionRes = await fetch('/api/version');
      const versionData = await versionRes.json();
      setCurrentVersion(versionData.version || '');
      
      // Check for updates
      const res = await fetch('/api/update/check');
      const data = await res.json();
      
      // Store update info regardless of availability (for the modal)
      setUpdateInfo(data);
      
      if (data.available) {
        // Check if user dismissed this version recently (within 24 hours)
        const dismissedAt = localStorage.getItem('updateDismissedAt');
        const dismissedVersion = localStorage.getItem('updateDismissedVersion');
        const dayInMs = 24 * 60 * 60 * 1000;
        
        const wasRecentlyDismissed = dismissedAt && 
          dismissedVersion === data.latestVersion &&
          (Date.now() - parseInt(dismissedAt, 10)) < dayInMs;
        
        if (!wasRecentlyDismissed) {
          addToast(
            `Update available: ${data.latestVersion}`,
            'update',
            0, // Don't auto-dismiss
            {
              action: 'View Update',
              onAction: () => setIsUpdateModalOpen(true),
              secondaryAction: 'Later',
              onSecondaryAction: () => {
                // Dismiss for this version for 24 hours
                localStorage.setItem('updateDismissedAt', Date.now().toString());
                localStorage.setItem('updateDismissedVersion', data.latestVersion);
              }
            }
          );
        }
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  }

  const checkWelcome = async () => {
    try {
      const res = await fetch('/api/welcome');
      const data = await res.json();
      
      // Show welcome if not already shown for this version
      if (!data.shown) {
        setIsWelcomeModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to check welcome status:', err);
    }
  }

  const dismissWelcome = async () => {
    setIsWelcomeModalOpen(false);
    
    // Mark welcome as shown
    try {
      await fetch('/api/welcome', { method: 'POST' });
    } catch (err) {
      console.error('Failed to save welcome status:', err);
    }
    
    // Focus the terminal after dismissing welcome
    setTimeout(() => {
      const termRef = getActiveTerminalRef();
      if (termRef) {
        termRef.focus();
      }
    }, 100);
  }

  const handleShellToggle = () => {
    // Cycle through available shells
    let nextShell;
    switch (shellConfig.shellType) {
      case 'cmd':
        nextShell = 'powershell';
        break;
      case 'powershell':
        nextShell = wslAvailable ? 'wsl' : 'cmd';
        break;
      case 'wsl':
        nextShell = 'cmd';
        break;
      default:
        nextShell = 'powershell';
    }
    saveConfig({ ...shellConfig, shellType: nextShell });
  }

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.className = newTheme;
    applyTheme(colorTheme, newTheme);
  };

  // Smart keybinding generator
  // First 10 cards: Ctrl+Shift+0-9
  // Card 11+: Auto-increment from previous card's keybinding
  const generateSmartKeybinding = (position, existingCommands) => {
    // Cards 1-10: Ctrl+Shift+0, Ctrl+Shift+1, ... Ctrl+Shift+9
    if (position <= 10) {
      const key = position === 10 ? '0' : String(position);
      return `Ctrl+Shift+${key}`;
    }
    
    // Card 11+: Try to auto-increment from previous card
    if (existingCommands.length > 0) {
      const lastCmd = existingCommands[existingCommands.length - 1];
      if (lastCmd.keyBinding) {
        const match = lastCmd.keyBinding.match(/Ctrl\+Shift\+(.+)$/i);
        if (match) {
          const lastKey = match[1];
          const nextKey = incrementKey(lastKey);
          if (nextKey) {
            return `Ctrl+Shift+${nextKey}`;
          }
        }
      }
    }
    
    // Fallback: use letters starting from A for 11+
    const letterIndex = position - 11;
    if (letterIndex < 26) {
      return `Ctrl+Shift+${String.fromCharCode(65 + letterIndex)}`;
    }
    
    return '';
  };
  
  // Increment a key (letter or number)
  const incrementKey = (key) => {
    // If it's a single digit
    if (/^[0-9]$/.test(key)) {
      const num = parseInt(key);
      if (num < 9) {
        return String(num + 1);
      }
      // After 9, switch to letters
      return 'A';
    }
    
    // If it's a single letter
    if (/^[A-Z]$/i.test(key)) {
      const upper = key.toUpperCase();
      if (upper < 'Z') {
        return String.fromCharCode(upper.charCodeAt(0) + 1);
      }
      // Wrapped around, no more keys
      return null;
    }
    
    return null;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip keyboard shortcuts when user is typing in input fields
      const target = e.target;
      const isInputField = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.isContentEditable;
      
      if (isInputField) {
        return; // Let the input field handle the event
      }

      // Ctrl+F: Open search
      if (e.ctrlKey && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }
      
      // Ctrl+End: Scroll to bottom
      if (e.ctrlKey && e.key === 'End') {
        e.preventDefault();
        const termRef = getActiveTerminalRef();
        if (termRef && termRef.scrollToBottom) {
          termRef.scrollToBottom();
        }
        return;
      }

      // Tab shortcuts (Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+1-9)
      if (e.ctrlKey && !e.shiftKey) {
        // Ctrl+T: New tab
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          handleNewTab();
          return;
        }
        
        // Ctrl+W: Close active tab
        if (e.key === 'w' || e.key === 'W') {
          e.preventDefault();
          if (tabs.length > 1 && activeTabId) {
            closeTab(activeTabId);
          }
          return;
        }
        
        // Ctrl+Tab / Ctrl+Shift+Tab: Cycle through tabs
        if (e.key === 'Tab') {
          e.preventDefault();
          const currentIndex = tabs.findIndex(t => t.id === activeTabId);
          if (currentIndex !== -1) {
            const nextIndex = e.shiftKey 
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : (currentIndex + 1) % tabs.length;
            switchTab(tabs[nextIndex].id);
          }
          return;
        }
        
        // Ctrl+1 through Ctrl+9: Switch to tab by number
        const digit = parseInt(e.key);
        if (digit >= 1 && digit <= 9) {
          e.preventDefault();
          const tabIndex = digit - 1;
          if (tabIndex < tabs.length) {
            switchTab(tabs[tabIndex].id);
          }
          return;
        }
      }
      
      // Check for Ctrl+Shift+1/2/3/4... (command shortcuts)
      if (e.ctrlKey && e.shiftKey) {
        const key = e.key.toLowerCase();
        // Find command with this binding
        // Note: This is a simple check, might need more robust parsing if bindings get complex
        // But charter says "Ctrl+Shift+1", etc.
        const binding = `Ctrl+Shift+${key.toUpperCase()}`; // e.g. Ctrl+Shift+1
        // Also handle number keys directly if e.key is '!' or '@' etc due to shift
        // But usually e.key is the character produced.
        // Actually, let's just match against the string in the command.

        // We need to normalize or check carefully. 
        // For now, let's iterate and check.
        const matchedCommand = commands.find(cmd => {
          if (!cmd.keyBinding) return false;
          // Simple normalization for comparison
          const normalize = s => s.toLowerCase().replace(/\s+/g, '');
          const pressed = `Ctrl+Shift+${e.code.replace('Digit', '').replace('Key', '')}`;
          return normalize(cmd.keyBinding) === normalize(pressed);
        });

        if (matchedCommand) {
          e.preventDefault();
          if (matchedCommand.pasteOnly) {
            handlePaste(matchedCommand);
          } else {
            handleExecute(matchedCommand);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commands, tabs, activeTabId, closeTab, switchTab, getActiveTerminalRef]);

  // Handle new tab creation
  const handleNewTab = useCallback(() => {
    logger.tabs('New tab button clicked');
    
    const result = createTab(shellConfig);
    
    if (!result.success) {
      if (result.error === 'max_tabs') {
        logger.tabs('Max tabs limit reached');
        addToast('Maximum tab limit reached (20)', 'warning', 3000);
      } else {
        logger.tabs('Tab creation failed', { error: result.error });
        addToast('Failed to create new tab', 'error', 3000);
      }
      return;
    }
    
    logger.tabs('New tab created', { tabId: result.tabId, colorTheme: result.tab?.colorTheme });
    // Theme will be applied by the activeTab useEffect below
  }, [createTab, shellConfig, addToast]);

  // Handle tab switch - focus terminal after switching and apply tab's theme
  const handleTabSwitch = useCallback((tabId) => {
    const targetTab = tabs.find(t => t.id === tabId);
    logger.tabs('Tab switch initiated', { 
      fromTabId: activeTabId, 
      toTabId: tabId,
      targetTabTheme: targetTab?.colorTheme,
      currentGlobalTheme: colorTheme
    });
    
    switchTab(tabId);
    
    // Clear waiting state when user clicks on the tab (acknowledges the prompt)
    if (waitingTabs[tabId]) {
      setWaitingTabs(prev => ({
        ...prev,
        [tabId]: false
      }));
      logger.tabs('Waiting state cleared by tab click', { tabId });
    }
    
    // Theme will be applied by the activeTab useEffect
    
    // Small delay to ensure the terminal is visible before focusing
    setTimeout(() => {
      const termRef = terminalRefs.current[tabId];
      if (termRef) {
        termRef.focus();
      }
    }, 50);
  }, [switchTab, tabs, activeTabId, colorTheme, waitingTabs]);

  // Handle tab close
  const handleTabClose = useCallback((tabId) => {
    if (tabs.length > 1) {
      closeTab(tabId);
      // Clean up the ref and waiting state
      delete terminalRefs.current[tabId];
      setWaitingTabs(prev => {
        const newState = { ...prev };
        delete newState[tabId];
        return newState;
      });
    }
  }, [tabs.length, closeTab]);

  // Handle tab rename
  const handleTabRename = useCallback((tabId, newTitle) => {
    logger.tabs('Tab rename', { tabId, newTitle });
    updateTabTitle(tabId, newTitle);
  }, [updateTabTitle]);

  // Handle waiting state change from terminal
  const handleWaitingChange = useCallback((tabId, isWaiting) => {
    setWaitingTabs(prev => ({
      ...prev,
      [tabId]: isWaiting
    }));
  }, []);

  // Handle directory change from terminal - auto-rename tab and save directory
  const handleDirectoryChange = useCallback((tabId, folderName, fullPath) => {
    if (folderName) {
      logger.tabs('Auto-renaming tab to folder', { tabId, folderName, fullPath });
      updateTabTitle(tabId, folderName);
    }
    if (fullPath) {
      updateTabDirectory(tabId, fullPath);
    }
  }, [updateTabTitle, updateTabDirectory]);

  // Helper to get folder name from a path
  const getFolderNameFromPath = (path) => {
    if (!path) return '';
    const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || normalized;
  };

  // File explorer handlers
  const handleFileOpen = useCallback((file) => {
    setEditorFile(file);
    setShowEditor(true);
  }, []);

  const handleEditorClose = useCallback(() => {
    setShowEditor(false);
    setEditorFile(null);
  }, []);

  const handleEditorSave = useCallback((file) => {
    addToast(`Saved: ${file.name}`, 'success', 2000);
  }, [addToast]);

  // Handle AM toggle - enable/disable AM logging via backend API
  const handleToggleAM = useCallback(async (tabId) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const newEnabled = !tab.amEnabled;
    
    try {
      const response = await fetch('/api/am/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabId: tabId,
          tabName: tab.title,
          workspace: window.location.pathname,
          enabled: newEnabled,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        toggleTabAM(tabId);
        addToast(newEnabled ? 'AM Logging enabled' : 'AM Logging disabled', 'info', 2000);
        logger.tabs('AM toggled', { tabId, enabled: newEnabled, logPath: result.logPath });
      } else {
        addToast('Failed to toggle AM: ' + result.error, 'error', 3000);
      }
    } catch (err) {
      console.error('Failed to toggle AM:', err);
      addToast('Failed to toggle AM logging', 'error', 3000);
    }
  }, [tabs, toggleTabAM, addToast]);

  const loadCommands = () => {
    setCommandsLoading(true);
    setCommandsError(null);
    
    // Set a timeout to detect hanging requests
    const timeoutId = setTimeout(() => {
      setCommandsError('Request timeout - server may be unresponsive');
      setCommandsLoading(false);
      addToast('Failed to load command cards - timeout', 'error', 5000);
    }, 10000); // 10 second timeout
    
    fetch('/api/commands')
      .then(r => {
        clearTimeout(timeoutId);
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
      })
      .then(data => {
        // Ensure data is an array
        const cmds = Array.isArray(data) ? data : [];
        setCommands(cmds);
        setCommandsLoading(false);
      })
      .catch(err => {
        clearTimeout(timeoutId);
        console.error('Failed to load commands:', err);
        setCommandsError(err.message);
        setCommandsLoading(false);
        addToast(`Failed to load command cards: ${err.message}`, 'error', 5000);
      })
  }

  const handleShutdown = async () => {
    addToast('Shutting down Forge Terminal...', 'warning', 3000);
    
    // Small delay so user sees the toast
    await new Promise(resolve => setTimeout(resolve, 800));
    
    try {
      await fetch('/api/shutdown', { method: 'POST' });
      window.close(); // Try to close the tab
    } catch (err) {
      // Server already shut down, that's expected
      window.close();
    }
  }

  const handleReconnect = useCallback(() => {
    const termRef = getActiveTerminalRef();
    if (termRef) {
      termRef.reconnect();
      addToast('Reconnecting terminal...', 'info', 2000);
    }
  }, [getActiveTerminalRef, addToast]);

  const saveCommands = async (newCommands) => {
    try {
      await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCommands)
      })
      setCommands(newCommands)
    } catch (err) {
      console.error('Failed to save commands:', err)
    }
  }

  const handleExecute = (cmd) => {
    const termRef = getActiveTerminalRef();
    if (termRef) {
      termRef.sendCommand(cmd.command)
      termRef.focus()
    }
  }

  const handlePaste = (cmd) => {
    const termRef = getActiveTerminalRef();
    if (termRef) {
      termRef.pasteCommand(cmd.command)
      termRef.focus()
    }
  }

  // Search handlers
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    const termRef = getActiveTerminalRef();
    if (termRef && query) {
      const found = termRef.findNext(query);
      // The xterm search addon doesn't provide a match count directly
      // We'll track if matches are found
      setSearchMatchCount(found ? 1 : 0);
      setSearchCurrentMatch(found ? 1 : 0);
    } else if (termRef) {
      termRef.clearSearch();
      setSearchMatchCount(0);
      setSearchCurrentMatch(0);
    }
  }, [getActiveTerminalRef]);

  const handleSearchNext = useCallback(() => {
    const termRef = getActiveTerminalRef();
    if (termRef && searchQuery) {
      termRef.findNext(searchQuery);
    }
  }, [getActiveTerminalRef, searchQuery]);

  const handleSearchPrev = useCallback(() => {
    const termRef = getActiveTerminalRef();
    if (termRef && searchQuery) {
      termRef.findPrevious(searchQuery);
    }
  }, [getActiveTerminalRef, searchQuery]);

  const handleSearchClose = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchMatchCount(0);
    setSearchCurrentMatch(0);
    const termRef = getActiveTerminalRef();
    if (termRef) {
      termRef.clearSearch();
      termRef.focus();
    }
  }, [getActiveTerminalRef]);

  const handleAdd = () => {
    setEditingCommand(null)
    setIsModalOpen(true)
  }

  const handleEdit = (cmd) => {
    setEditingCommand(cmd)
    setIsModalOpen(true)
  }

  const handleDelete = (id) => {
    const newCommands = commands.filter(c => c.id !== id)
    saveCommands(newCommands)
  }

  const handleSaveCommand = (commandData) => {
    let newCommands;
    if (editingCommand) {
      // Update existing
      newCommands = commands.map(c =>
        c.id === editingCommand.id ? { ...commandData, id: c.id } : c
      )
    } else {
      // Add new with smart keybinding
      const newId = Math.max(0, ...commands.map(c => c.id)) + 1
      const cardPosition = commands.length + 1; // Position of new card (1-indexed)
      
      // Auto-assign keybinding if not already set
      let finalData = { ...commandData };
      if (!finalData.keyBinding) {
        finalData.keyBinding = generateSmartKeybinding(cardPosition, commands);
      }
      
      newCommands = [...commands, { ...finalData, id: newId }]
    }
    saveCommands(newCommands)
    setIsModalOpen(false)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = commands.findIndex((c) => c.id === active.id);
      const newIndex = commands.findIndex((c) => c.id === over.id);

      const newCommands = arrayMove(commands, oldIndex, newIndex);
      saveCommands(newCommands);
    }
  };

  const sidebar = (
    <div className="sidebar">
      {/* Row 1: View toggle tabs */}
      <div className="sidebar-view-tabs">
        <button 
          className={`sidebar-view-tab ${sidebarView === 'cards' ? 'active' : ''}`}
          onClick={() => setSidebarView('cards')}
        >
          <Command size={16} />
          Cards
        </button>
        {devMode && (
          <button 
            className={`sidebar-view-tab ${sidebarView === 'files' ? 'active' : ''}`}
            onClick={() => setSidebarView('files')}
          >
            <Folder size={16} />
            Files
          </button>
        )}
      </div>

      {/* Row 2: Header - context-aware based on view */}
      <div className="sidebar-header">
        {sidebarView === 'cards' ? (
          <>
            <h3>⚡ Commands</h3>
            <button className="btn btn-primary" onClick={handleAdd}>
              <Plus size={16} /> Add
            </button>
          </>
        ) : (
          <>
            <h3>📁 Files</h3>
            <span className="sidebar-path-hint">{activeTab?.currentDirectory ? getFolderNameFromPath(activeTab.currentDirectory) : 'Root'}</span>
          </>
        )}
      </div>

      {/* Row 3: Theme controls */}
      <div className="theme-controls">
        <button className="btn btn-ghost btn-icon" onClick={cycleColorTheme} title={`Theme: ${themes[colorTheme]?.name || 'Molten Metal'}`}>
          <Palette size={18} />
        </button>
        <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title="Toggle Light/Dark">
          {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="btn btn-ghost btn-icon" onClick={toggleSidebarPosition} title={`Move sidebar to ${sidebarPosition === 'right' ? 'left' : 'right'}`}>
          {sidebarPosition === 'right' ? <PanelLeft size={18} /> : <PanelRight size={18} />}
        </button>
        <div className="spacer"></div>
        {/* Update indicator - shows when update is available */}
        <button 
          className={`btn btn-ghost btn-icon ${updateInfo?.available ? 'update-available' : ''}`}
          onClick={() => setIsUpdateModalOpen(true)} 
          title={updateInfo?.available ? `Update available: ${updateInfo.latestVersion}` : `Version ${currentVersion}`}
          style={updateInfo?.available ? { color: '#a78bfa' } : {}}
        >
          <Download size={18} />
          {updateInfo?.available && (
            <span className="update-badge" style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '8px',
              height: '8px',
              background: '#8b5cf6',
              borderRadius: '50%',
            }} />
          )}
        </button>
        <button className="btn btn-danger btn-icon" onClick={handleShutdown} title="Quit Forge">
          <Power size={18} />
        </button>
      </div>

      {/* Row 4: Shell and terminal controls */}
      <div className="terminal-controls">
        <ShellToggle 
          shellConfig={shellConfig} 
          onToggle={handleShellToggle}
          wslAvailable={wslAvailable}
        />
        <div className="font-size-controls">
          <button 
            className="btn btn-ghost btn-icon btn-sm" 
            onClick={() => handleFontSizeChange(-1)} 
            title="Decrease Font Size"
            disabled={fontSize <= MIN_FONT_SIZE}
          >
            <Minus size={14} />
          </button>
          <span className="font-size-display" title="Font Size">{fontSize}px</span>
          <button 
            className="btn btn-ghost btn-icon btn-sm" 
            onClick={() => handleFontSizeChange(1)} 
            title="Increase Font Size"
            disabled={fontSize >= MAX_FONT_SIZE}
          >
            <Plus size={14} />
          </button>
          <button 
            className="btn btn-ghost btn-icon btn-sm" 
            onClick={handleFontSizeReset} 
            title="Reset Font Size"
            disabled={fontSize === DEFAULT_FONT_SIZE}
          >
            <RotateCcw size={12} />
          </button>
        </div>
        <button 
          className="btn btn-ghost btn-icon" 
          onClick={() => setIsSettingsModalOpen(true)} 
          title="Shell Settings"
        >
          <Settings size={18} />
        </button>
        <button className="btn btn-feedback btn-icon" onClick={() => setIsFeedbackModalOpen(true)} title="Send Feedback">
          <MessageSquare size={18} />
        </button>
      </div>

      {/* Content area - Cards or Files */}
      <div className="sidebar-content">
        {sidebarView === 'cards' ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <CommandCards
              commands={commands}
              loading={commandsLoading}
              error={commandsError}
              onExecute={handleExecute}
              onPaste={handlePaste}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRetry={loadCommands}
            />
          </DndContext>
        ) : (
          <FileExplorer
            currentPath={activeTab?.currentDirectory}
            rootPath={activeTab?.currentDirectory}
            onFileOpen={handleFileOpen}
            terminalRef={getActiveTerminalRef()}
            shellConfig={activeTab?.shellConfig || shellConfig}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className={`app ${sidebarPosition === 'left' ? 'sidebar-left' : ''} ${showEditor ? 'with-editor' : ''}`}>
      {sidebarPosition === 'left' && sidebar}
      <div className="terminal-pane">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={handleTabSwitch}
          onTabClose={handleTabClose}
          onTabRename={handleTabRename}
          onNewTab={handleNewTab}
          onReorder={reorderTabs}
          onToggleAutoRespond={toggleTabAutoRespond}
          onToggleAM={handleToggleAM}
          onToggleMode={toggleTabMode}
          disableNewTab={tabs.length >= MAX_TABS}
          waitingTabs={waitingTabs}
          mode={theme}
          devMode={devMode}
        />
        <SearchBar
          isOpen={isSearchOpen}
          onClose={handleSearchClose}
          onSearch={handleSearch}
          onNext={handleSearchNext}
          onPrev={handleSearchPrev}
          matchCount={searchMatchCount}
          currentMatch={searchCurrentMatch}
        />
        <div className="terminal-pane-content">
          <div className="terminal-container">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`terminal-wrapper ${tab.id !== activeTabId ? 'hidden' : ''}`}
              >
                <ForgeTerminal
                  ref={(el) => {
                    if (el) {
                      terminalRefs.current[tab.id] = el;
                    }
                  }}
                  tabId={tab.id}
                  isVisible={tab.id === activeTabId}
                  theme={tab.mode || 'dark'}
                  colorTheme={tab.colorTheme || colorTheme}
                  fontSize={fontSize}
                  shellConfig={tab.shellConfig}
                  autoRespond={tab.autoRespond || false}
                  amEnabled={tab.amEnabled || false}
                  tabName={tab.title}
                  currentDirectory={tab.currentDirectory || null}
                  onWaitingChange={(isWaiting) => handleWaitingChange(tab.id, isWaiting)}
                  onDirectoryChange={(folderName, fullPath) => handleDirectoryChange(tab.id, folderName, fullPath)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {showEditor && editorFile && (
        <div className="editor-panel">
          <MonacoEditor
            file={editorFile}
            onClose={handleEditorClose}
            onSave={handleEditorSave}
            theme={activeTab?.mode || theme}
            rootPath={activeTab?.currentDirectory}
            terminalRef={getActiveTerminalRef()}
          />
        </div>
      )}
      {sidebarPosition === 'right' && sidebar}

      <CommandModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveCommand}
        initialData={editingCommand}
        commands={commands}
      />

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        shellConfig={shellConfig}
        onSave={saveConfig}
        onToast={addToast}
        devMode={devMode}
        onDevModeChange={setDevMode}
      />

      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        updateInfo={updateInfo}
        currentVersion={currentVersion}
      />

      <WelcomeModal
        isOpen={isWelcomeModalOpen}
        onClose={dismissWelcome}
        version={currentVersion}
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  )
}

export default App
