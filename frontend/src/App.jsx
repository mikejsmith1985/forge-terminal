import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Moon, Sun, Plus, Minus, Power, Settings, Palette, PanelLeft, PanelRight, Download, Folder, Command, Bug, MessageCircle, Clock, BookOpen } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary'
import ForgeTerminal from './components/ForgeTerminal'
import ForgeAssist from './components/ForgeAssist'
import CommandCards from './components/CommandCards'
import CommandModal from './components/CommandModal'
import FeedbackModal from './components/FeedbackModal'
import SettingsModal from './components/SettingsModal'
import UpdateModal from './components/UpdateModal'
import DeveloperDashboard from './components/DeveloperDashboard'
// WelcomeModal REMOVED - replaced by guided tour (user request: 20+ times)
// Workflows REMOVED - v3.9.0: Consolidating to SLM-enhanced Forge Assist
import FileAccessPrompt from './components/FileAccessPrompt'
import ShellToggle from './components/ShellToggle'
import TabBar from './components/TabBar'
import SearchBar from './components/SearchBar'
import FileExplorer from './components/FileExplorer'
import LensFilePicker from './components/LensFilePicker'
import MonacoEditor from './components/MonacoEditor'
import AgenticEditor from './components/AgenticEditor'
import DebugPanel from './components/DebugPanel'
import WebAppDebuggerCard from './components/WebAppDebuggerCard'
import DiagnosticOverlay from './components/DiagnosticOverlay'
import HistorySlider from './components/HistorySlider'
// TaskDashboard removed in v3.12.3 - was unimplemented scaffolding with no backend
import { ToastContainer, useToast } from './components/Toast'
import { themes, themeOrder, applyTheme } from './themes'
import { useTabManager } from './hooks/useTabManager'
import { useDevMode } from './hooks/useDevMode'
// useWorkflowManager REMOVED - v3.9.0: Workflows deleted
import { logger } from './utils/logger'
import { getNextAvailableKeybinding, validateKeybinding, getKeybindingAvailability } from './utils/keybindingManager'
import { performanceInstrumentation } from './utils/performanceInstrumentation'
import useGuidedTour from './hooks/useGuidedTour'
import TourOverlay from './components/TourOverlay'

const MAX_TABS = 20;

// v3.5.3: Helper functions for SLM task type display
const getTaskTypeIcon = (taskType) => {
  switch (taskType?.toLowerCase()) {
    case 'debug': return '🐛';
    case 'explain': return '📖';
    case 'refactor': return '🔧';
    case 'generate': return '✨';
    case 'simple': return '⚡';
    case 'architecture': return '🧠';
    default: return '🤖';
  }
};

const formatTaskType = (taskType) => {
  if (!taskType) return null;
  // Capitalize first letter
  return taskType.charAt(0).toUpperCase() + taskType.slice(1);
};

function App() {
  const [commands, setCommands] = useState([])
  const [commandsLoading, setCommandsLoading] = useState(true)
  const [commandsError, setCommandsError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
  // WelcomeModal state REMOVED - replaced by guided tour
  const [isDiagnosticOverlayOpen, setIsDiagnosticOverlayOpen] = useState(false)
  // ChatView and NotebookLayout REMOVED in v3.8.2 - Terminal is the only view
  const [settingsInitialTab, setSettingsInitialTab] = useState('shell') // For opening Settings to specific tab
  const [editingCommand, setEditingCommand] = useState(null)
  const [theme, setTheme] = useState('dark')
  const [colorTheme, setColorTheme] = useState(() => {
    return localStorage.getItem('colorTheme') || 'molten';
  })
  const [defaultTabTheme, setDefaultTabTheme] = useState(() => {
    return localStorage.getItem('defaultTabTheme') || 'auto-cycle';
  })
  const [sidebarPosition, setSidebarPosition] = useState(() => {
    return localStorage.getItem('sidebarPosition') || 'right';
  })
  const [shellConfig, setShellConfig] = useState({ shellType: 'powershell', wslDistro: '', wslHomePath: '', cmdHomePath: '', psHomePath: '' })
  const [wslAvailable, setWslAvailable] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('terminalFontSize');
    return saved ? parseInt(saved, 10) : 14;
  })

  const [chatFontSize, setChatFontSize] = useState(() => {
    const savedChat = localStorage.getItem('chatFontSize');
    return savedChat ? parseInt(savedChat, 10) : 14;
  })

  const [fontTarget, setFontTarget] = useState('terminal');

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved, 10) : 360;
  });
  
  // Store the previous sidebar width before Files view expansion
  const [prevSidebarWidth, setPrevSidebarWidth] = useState(null);
  
  // Update state - persists across toast dismissal
  const [updateInfo, setUpdateInfo] = useState(null)
  const [currentVersion, setCurrentVersion] = useState('')
  
  // Version verification - blocks terminal until we confirm no auto-refresh needed
  const [versionReady, setVersionReady] = useState(false)
  
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const [searchCurrentMatch, setSearchCurrentMatch] = useState(0)
  
  // Tab waiting state (for prompt watcher)
  const [waitingTabs, setWaitingTabs] = useState({})
  
  // File explorer and editor state
  const [sidebarView, setSidebarView] = useState('cards') // 'cards', 'files', or 'debug' (workflows removed v3.9.0)
  const [editorFile, setEditorFile] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [editorMode, setEditorMode] = useState('classic') // 'agentic' or 'classic' (Monaco)
  const [editorProposedChanges, setEditorProposedChanges] = useState([]) // Agent diff proposals
  const [editorAnchors, setEditorAnchors] = useState([]) // Conversational anchors
  
  // v3.7.2: Auto-expand sidebar for Files view (Lens File Picker needs space)
  useEffect(() => {
    const EXPANDED_WIDTH = 600; // Wider for Lens File Picker
    const MIN_EXPANDED_WIDTH = 500;
    
    if (sidebarView === 'files') {
      // Switching TO Files view - expand if needed
      if (sidebarWidth < MIN_EXPANDED_WIDTH) {
        setPrevSidebarWidth(sidebarWidth); // Remember current width
        setSidebarWidth(EXPANDED_WIDTH);
      }
    } else if (prevSidebarWidth !== null) {
      // Switching FROM Files view - restore previous width
      setSidebarWidth(prevSidebarWidth);
      setPrevSidebarWidth(null);
    }
  }, [sidebarView]);
  
  // File access permission state
  const [showFileAccessPrompt, setShowFileAccessPrompt] = useState(false)
  const [fileAccessModeReady, setFileAccessModeReady] = useState(false)
  
  // Forge Assist state
  const [isForgeAssistOpen, setIsForgeAssistOpen] = useState(false)
  
  // v3.8.2: Draggable Forge Assist floating button
  const [forgeAssistBtnPos, setForgeAssistBtnPos] = useState(() => {
    const saved = localStorage.getItem('forge_assist_btn_pos');
    return saved ? JSON.parse(saved) : { right: 60, bottom: 80 };
  });
  const [isDraggingBtn, setIsDraggingBtn] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Workflow UI state - REMOVED v3.9.0: Workflows deleted, using Task Dashboard instead
  // Task Dashboard state - REMOVED v3.12.3: Was unimplemented scaffolding
  // Quick Instruction feature - REMOVED v3.14.4: Broke command execution via PTY injection
  
  // Context files for ForgeAssist (kept from Task Dashboard removal)
  const [contextFiles, setContextFiles] = useState([])
  
  // Time-Travel UI state
  const [isHistorySliderOpen, setIsHistorySliderOpen] = useState(false)
  
  // v3.10.6: Developer Dashboard state
  const [isDeveloperDashboardOpen, setIsDeveloperDashboardOpen] = useState(false)
  
  // Model Router state
  const [currentModelTier, setCurrentModelTier] = useState(null)
  // Task 4: Track what's ACTUALLY running (for badge sync)
  const [routingInfo, setRoutingInfo] = useState(null)
  
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
    // toggleTabAM, // v3.12.12: AM feature removed
    toggleTabMode,
    changeTabTheme,
    updateTabModified,
    toggleTabViewMode,
    updateTabDirectory,
    reorderTabs,
  } = useTabManager(shellConfig, defaultTabTheme);
  
  // DevMode state
  const { devMode, setDevMode, isInitialized: devModeInitialized } = useDevMode();
  
  // Workflow management - REMOVED v3.9.0: Consolidating to SLM-enhanced Forge Assist

  // Tour action handlers for interactive steps
  // v3.12.4: Complete interactive tour with all UI actions
  const tourActionHandlers = useMemo(() => ({
    // Tab management
    createNewTab: () => {
      if (tabs.length < MAX_TABS) {
        createTab();
      }
    },
    closeExtraTab: () => {
      // Close the last tab if we have more than one
      if (tabs.length > 1) {
        const lastTab = tabs[tabs.length - 1];
        closeTab(lastTab.id);
      }
    },

    // Forge Assist actions
    openForgeAssist: () => setIsForgeAssistOpen(true),
    closeForgeAssist: () => setIsForgeAssistOpen(false),
    switchToTaskMode: () => {
      // ForgeAssist handles its own mode state, we just ensure it's open
      setIsForgeAssistOpen(true);
    },

    // Sidebar tab switching
    showCardsTab: () => setSidebarView('cards'),
    showFilesTab: () => setSidebarView('files'),
    showWebToolsTab: () => setSidebarView('debug'),

    // History Slider (Time Travel)
    openHistorySlider: () => setIsHistorySliderOpen(true),
    closeHistorySlider: () => setIsHistorySliderOpen(false),

    // Settings modal
    openSettings: () => setIsSettingsModalOpen(true),
    closeSettings: () => setIsSettingsModalOpen(false),

    // Legacy router config (kept for compatibility)
    openRouterConfig: () => setIsRouterConfigOpen(true),
    closeRouterConfig: () => setIsRouterConfigOpen(false),
  }), [tabs, createTab, closeTab]);

  // Guided Tour for first-run experience
  const {
    isActive: isTourActive,
    stepData: tourStepData,
    currentStep: tourCurrentStep,
    totalSteps: tourTotalSteps,
    nextStep: tourNextStep,
    skipTour,
    restartTour,
  } = useGuidedTour(tourActionHandlers);
  
  // Query model tier when terminal input changes
  const queryModelTier = useCallback(async (input) => {
    if (!input || input.trim().length < 10) {
      setCurrentModelTier(null);
      return;
    }

    try {
      const response = await fetch('/api/llm/model-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentModelTier(data.tier);
        logger.router('Model tier classified', { input, tier: data.tier });
      }
    } catch (err) {
      console.warn('[ModelRouter] Classification failed:', err);
    }
  }, []);

  // Task 4: Handle routing updates - badge shows what's ACTUALLY running
  const handleRoutingUpdate = useCallback((info) => {
    logger.router('Smart routing update', info);
    setRoutingInfo(info);
    // Also update the tier for consistency
    setCurrentModelTier(info.actuallyRunning || info.toolName || info.tier);
  }, []);
  
  // v3.12.12: AM feature completely removed
  
  // Store refs for each terminal by tab ID
  const terminalRefs = useRef({});
  const { toasts, addToast, removeToast } = useToast()

  const DEFAULT_FONT_SIZE = 14;
  const MIN_FONT_SIZE = 8;
  const MAX_FONT_SIZE = 30;

  // Get ref for active terminal
  const getActiveTerminalRef = useCallback(() => {
    return activeTabId ? terminalRefs.current[activeTabId] : null;
  }, [activeTabId]);

  const handleFontSizeChange = (delta) => {
    if (fontTarget === 'terminal') {
      setFontSize(prev => {
        const newSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, prev + delta));
        localStorage.setItem('terminalFontSize', newSize.toString());
        return newSize;
      });
    } else {
      setChatFontSize(prev => {
        const newSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, prev + delta));
        localStorage.setItem('chatFontSize', newSize.toString());
        return newSize;
      });
    }
  };

  // No explicit reset button by design (removed refresh icon per UX request)

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
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
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
    
    // Start performance instrumentation for freeze detection
    performanceInstrumentation.start((freezeCapture) => {
      // Show toast notification when freeze detected
      const durationSec = (freezeCapture.duration / 1000).toFixed(1);
      addToast(`UI freeze detected: ${durationSec}s. Check console (F12) for details.`, 'error', 5000);
      console.error('[FREEZE DETECTED]', freezeCapture);
      // Store in global for easy access
      window.__lastFreezeCapture = freezeCapture;
    })
    
    // Check if file access mode has been set
    const modeSet = localStorage.getItem('fileAccessModeSet');
    if (modeSet === 'true') {
      setFileAccessModeReady(true);
    }
    
    // Check system preference or saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedColorTheme = localStorage.getItem('colorTheme') || 'molten';
    setTheme(savedTheme);
    setColorTheme(savedColorTheme);
    document.documentElement.className = savedTheme;
    applyTheme(savedColorTheme, savedTheme);
    
    // Store the current version for post-update detection and trigger page refresh if needed
    const checkAndRefreshAfterUpdate = async () => {
      // BYPASS: Only skip in true dev mode (Vite dev server on 5173)
      const isViteDevMode = window.location.port === '5173';
      if (isViteDevMode) {
        console.log('[Update] Vite dev mode detected - skipping auto-refresh logic');
        setVersionReady(true);
        return;
      }
      
      // CRITICAL FIX: Add 3-second timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[Update] Version check timed out after 3s - proceeding anyway');
        controller.abort();
      }, 3000);
      
      try {
        const res = await fetch('/api/version', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await res.json();
        const currentVersion = data.version;
        const lastKnownVersion = localStorage.getItem('lastKnownVersion');
        
        if (currentVersion !== lastKnownVersion && lastKnownVersion) {
          // Version changed - server was updated, refresh to load new assets and reconnect terminal
          console.log('[Update] Version changed from', lastKnownVersion, 'to', currentVersion);
          
          // SAFETY CHECK: Only reload if versions are actually different and valid
          if (currentVersion && lastKnownVersion && currentVersion.trim() !== lastKnownVersion.trim()) {
            console.log('[Update] Confirmed version mismatch - refreshing page');
            localStorage.setItem('lastKnownVersion', currentVersion);
            // DON'T set versionReady - we're about to refresh
            // Refresh immediately - no delay, don't let stale JS initialize terminal
            window.location.reload();
            return; // Never reached, but explicit
          } else {
            console.warn('[Update] Version strings differ but are invalid or whitespace - NOT reloading');
            localStorage.setItem('lastKnownVersion', currentVersion);
            setVersionReady(true);
          }
        } else {
          localStorage.setItem('lastKnownVersion', currentVersion);
          // Version verified - safe to render terminals
          console.log('[Update] Version verified:', currentVersion);
          setVersionReady(true);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn('[Update] Failed to check version:', err.message);
        // Fallback: store a generic version and proceed - NEVER block terminal loading
        localStorage.setItem('lastKnownVersion', '1.9.5');
        setVersionReady(true); // Allow rendering on error (better than blocking forever)
      }
    };
    
    checkAndRefreshAfterUpdate();
    
    // Set up SSE for real-time update notifications with exponential backoff and fallback polling
    let eventSource = null;
    let reconnectAttempt = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const BASE_RECONNECT_DELAY = 5000; // 5 seconds
    let fallbackPollTimer = null;
    let reconnectTimer = null; // Track reconnection timer
    
    // Only enable update notifications in production (not Vite dev mode)
    const isViteDevMode = window.location.port === '5173';
    if (isViteDevMode) {
      console.log('[SSE] Vite dev mode detected - skipping SSE update notifications');
      return;
    }
    
    const startFallbackPolling = () => {
      // Fallback polling every 5 minutes if SSE fails
      stopFallbackPolling();
      console.log('[SSE] Starting fallback polling every 5 minutes');
      fallbackPollTimer = setInterval(() => {
        checkForUpdates();
      }, 5 * 60 * 1000);
    };
    
    const stopFallbackPolling = () => {
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    };
    
    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/update/events');
        
        eventSource.addEventListener('connected', (e) => {
          console.log('[SSE] Connected to update events');
          reconnectAttempt = 0; // Reset counter on successful connection
          stopFallbackPolling(); // Stop fallback since SSE is working
        });
        
        eventSource.addEventListener('update', (e) => {
          try {
            const data = JSON.parse(e.data);
            console.log('[SSE] Update notification received:', data);
            
            // Update the state so the UI reflects the new version
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
            console.error('[SSE] Error parsing update event:', err);
          }
        });
        
        eventSource.addEventListener('error', (e) => {
          try {
            const data = JSON.parse(e.data);
            console.warn('[SSE] Update check error:', data.message);
          } catch (err) {
            // Ignore parse errors for error events
          }
        });
        
        eventSource.onerror = () => {
          console.log(`[SSE] Connection error, reconnect attempt ${reconnectAttempt + 1}/${MAX_RECONNECT_ATTEMPTS}`);
          eventSource.close();
          startFallbackPolling(); // Start fallback polling on connection error
          
          if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
            // Exponential backoff: 5s, 10s, 20s, 40s, 80s
            const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempt);
            reconnectAttempt++;
            console.log(`[SSE] Retrying in ${delay}ms...`);
            reconnectTimer = setTimeout(connectSSE, delay);
          } else {
            console.error('[SSE] Max reconnection attempts reached, fallback polling will continue');
          }
        };
      } catch (err) {
        console.error('[SSE] Failed to create EventSource:', err);
        startFallbackPolling();
      }
    };
    
    connectSSE();
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      stopFallbackPolling();
    };
  }, [])

  // Apply theme when active tab changes (handles new tab creation and tab switching)
  useEffect(() => {
    if (activeTab?.colorTheme) {
      const tabMode = activeTab.mode || 'dark';
      console.log('[App] Theme useEffect triggered:', {
        tabId: activeTab.id,
        colorTheme: activeTab.colorTheme,
        mode: tabMode,
        currentGlobalTheme: colorTheme,
        currentGlobalMode: theme
      });
      logger.theme('Applying theme for active tab', { 
        tabId: activeTab.id, 
        colorTheme: activeTab.colorTheme,
        mode: tabMode
      });
      setColorTheme(activeTab.colorTheme);
      
      // CRITICAL FIX: Ensure global theme class matches tab mode
      // This ensures components using .light/.dark selectors (like SystemCommandCard) work correctly
      if (tabMode !== theme) {
        console.log('[App] Updating global theme mode from', theme, 'to', tabMode);
        setTheme(tabMode);
        document.documentElement.className = tabMode;
        // Force re-apply theme variables immediately after class change
        applyTheme(activeTab.colorTheme, tabMode);
      } else {
        console.log('[App] Applying theme without mode change');
        applyTheme(activeTab.colorTheme, tabMode);
      }
    }
  }, [activeTab?.id, activeTab?.colorTheme, activeTab?.mode]);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data && data.shellType) {
        // Check if config differs from the initial default
        const defaultConfig = { shellType: 'powershell', wslDistro: '', wslHomePath: '', cmdHomePath: '', psHomePath: '' };
        const configDiffers = 
          data.shellType !== defaultConfig.shellType ||
          data.wslDistro !== defaultConfig.wslDistro ||
          data.wslHomePath !== defaultConfig.wslHomePath ||
          data.cmdHomePath !== defaultConfig.cmdHomePath ||
          data.psHomePath !== defaultConfig.psHomePath;
        
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

  // v3.12.15: Load quick instruction config - REMOVED (Migrated to ForgeAssist localStorage)
  // const loadQuickInstructionConfig = async () => { ... }

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
    const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    try {
      // Always fetch current version (needed for tooltip and modal display)
      const versionRes = await fetch('/api/version');
      const versionData = await versionRes.json();
      setCurrentVersion(versionData.version || '');
      
      // Skip GitHub update check in local development
      if (isLocalDev) {
        console.log('[Update] Skipping GitHub update check in local development');
        return;
      }
      
      // Check for updates from GitHub
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
      
      // WelcomeModal was removed in favor of guided tour
      // Just log the status, don't try to open a modal that doesn't exist
      if (!data.shown) {
        console.log('[App] Welcome not yet shown - guided tour will handle this');
      }
    } catch (err) {
      console.error('Failed to check welcome status:', err);
    }
  }

  // dismissWelcome REMOVED - WelcomeModal removed in favor of guided tour

  // Check and prompt for file access permission if needed
  const checkFileAccessPermission = () => {
    const modeSet = localStorage.getItem('fileAccessModeSet');
    if (modeSet !== 'true') {
      setShowFileAccessPrompt(true);
      return false;
    }
    return true;
  };

  const handleFileAccessChoice = (mode) => {
    setShowFileAccessPrompt(false);
    setFileAccessModeReady(true);
    console.log('[App] File access mode set to:', mode);
    
    // Now that permission is set, show the files view
    setSidebarView('files');
  };

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

    // Fix: Update active tab mode to match new global theme
    // This ensures the terminal (which prioritizes tab.mode) updates correctly
    if (activeTabId && activeTab) {
      // Use changeTabTheme to update mode while preserving color theme
      changeTabTheme(activeTabId, activeTab.colorTheme || colorTheme, newTheme);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    // CRITICAL: Don't register keyboard handlers until version is verified
    // This prevents stale JS from registering broken handlers before auto-refresh
    // NOTE: We removed the check here because it was blocking keybindings from working
    // when the app is loaded but version check is slow.
    // if (!versionReady) {
    //   console.log('[Keyboard] Waiting for version verification before registering handlers');
    //   return;
    // }
    
    const handleKeyDown = (e) => {
      // Check for command shortcuts (Ctrl+Shift+... or Ctrl+Alt+...)
      // We check this BEFORE xterm check to allow global shortcuts to work even when terminal is focused
      if (e.ctrlKey && (e.shiftKey || e.altKey)) {
        const key = e.key.toLowerCase();
        
        // Construct the pressed key combination string
        let pressed = 'Ctrl+';
        if (e.altKey) pressed += 'Alt+';
        if (e.shiftKey) pressed += 'Shift+';
        
        // Handle digit/letter keys
        // e.code is like 'Digit1', 'KeyA', etc.
        let code = e.code;
        if (code.startsWith('Digit')) code = code.replace('Digit', '');
        if (code.startsWith('Key')) code = code.replace('Key', '');
        
        pressed += code;

        const matchedCommand = commands.find(cmd => {
          if (!cmd.keyBinding) return false;
          // Simple normalization for comparison
          const normalize = s => s.toLowerCase().replace(/\s+/g, '').replace('control', 'ctrl');
          const match = normalize(cmd.keyBinding) === normalize(pressed);
          return match;
        });

        if (matchedCommand) {
          e.preventDefault();
          if (matchedCommand.pasteOnly) {
            handlePaste(matchedCommand);
          } else {
            handleExecute(matchedCommand);
          }
          return; // Handled, don't let xterm or others process it
        }
      }

      // CRITICAL: Check if this is xterm's helper textarea FIRST
      // xterm-helper-textarea must be allowed to handle ALL keys
      const isXtermTextarea = e.target?.classList?.contains('xterm-helper-textarea');
      if (isXtermTextarea) {
        return; // Let xterm handle ALL keys natively
      }
      
      // Skip keyboard shortcuts when user is typing in input fields
      const target = e.target;
      const isInputField = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.isContentEditable;
      
      // Check if target is within xterm terminal (for copy/paste support)
      const isTerminalFocused = target.closest?.('.xterm') || 
                               target.classList?.contains('xterm') ||
                               target.closest?.('.terminal-inner');
      
      // Allow Ctrl+C and Ctrl+V to pass through to xterm when terminal is focused
      // Don't preventDefault - let xterm handle these keys normally with clipboardMode: 'on'
      if (isTerminalFocused && e.ctrlKey && (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V')) {
        return; // Let xterm handle Ctrl+C/V natively
      }
      
      if (isInputField) {
        return; // Let the input field handle the event
      }

      // Ctrl+F: Open search
      if (e.ctrlKey && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }
      
      // Ctrl+/: Toggle Forge Assist
      if (e.ctrlKey && !e.shiftKey && e.key === '/') {
        e.preventDefault();
        setIsForgeAssistOpen(prev => !prev);
        return;
      }
      
      // Ctrl+Shift+H: Toggle History Slider
      if (e.ctrlKey && e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setIsHistorySliderOpen(prev => !prev);
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
      // MOVED TO TOP OF FUNCTION
      /* 
      if (e.ctrlKey && (e.shiftKey || e.altKey)) {
         ...
      }
      */
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [versionReady, commands, tabs, activeTabId, closeTab, switchTab, getActiveTerminalRef]);

  // Handle new tab creation
  const handleNewTab = useCallback((options = {}) => {
    logger.tabs('New tab button clicked', options);
    
    const result = createTab({
      ...shellConfig,
      type: options.type || 'terminal' // 'terminal' or 'agent'
    });
    
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
    
    // v3.12.12: AM feature completely removed
    
    logger.tabs('New tab created', { tabId: result.tabId, colorTheme: result.tab?.colorTheme, type: options.type });
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
      // cleanupChatMessages REMOVED in v3.8.2 - ChatView removed
    }
  }, [tabs.length, closeTab]);

  // v3.8.2: Draggable Forge Assist button handlers
  const dragStartPosRef = useRef({ x: 0, y: 0 }); // Track start position to distinguish click vs drag

  const handleBtnMouseDown = useCallback((e) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    setIsDraggingBtn(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    // Record start position
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleBtnMouseMove = useCallback((e) => {
    if (!isDraggingBtn) return;
    const newRight = window.innerWidth - e.clientX - dragOffset.x;
    const newBottom = window.innerHeight - e.clientY - dragOffset.y;
    const constrainedPos = {
      right: Math.max(10, Math.min(window.innerWidth - 60, newRight)),
      bottom: Math.max(10, Math.min(window.innerHeight - 60, newBottom)),
    };
    setForgeAssistBtnPos(constrainedPos);
  }, [isDraggingBtn, dragOffset]);

  const handleBtnMouseUp = useCallback((e) => {
    if (isDraggingBtn) {
      setIsDraggingBtn(false);
      localStorage.setItem('forge_assist_btn_pos', JSON.stringify(forgeAssistBtnPos));
      
      // Calculate distance moved
      const dist = Math.sqrt(
        Math.pow(e.clientX - dragStartPosRef.current.x, 2) + 
        Math.pow(e.clientY - dragStartPosRef.current.y, 2)
      );
      
      // If moved less than 5 pixels, treat as a click
      if (dist < 5) {
        setIsForgeAssistOpen(prev => !prev);
      }
    }
  }, [isDraggingBtn, forgeAssistBtnPos]);

  // Add/remove mouse event listeners for dragging
  useEffect(() => {
    if (isDraggingBtn) {
      window.addEventListener('mousemove', handleBtnMouseMove);
      window.addEventListener('mouseup', handleBtnMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleBtnMouseMove);
        window.removeEventListener('mouseup', handleBtnMouseUp);
      };
    }
  }, [isDraggingBtn, handleBtnMouseMove, handleBtnMouseUp]);

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

  // Handle interactive TUI detection - auto-switch to terminal view
  // This is triggered when Claude Code or similar shows a multi-question wizard
  const handleInteractiveTUI = useCallback((tabId, tuiType) => {
    logger.terminal('Interactive TUI detected', { tabId, tuiType });
    // v3.8.2: Terminal is the only view, no switching needed
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
    // Check if file is already open in a tab
    const existingTab = tabs.find(t => t.path === file.path && t.type === 'file');
    if (existingTab) {
      switchTab(existingTab.id);
      return;
    }

    // Create new tab for file
    createTab(shellConfig, {
      type: 'file',
      title: file.name,
      file: file,
      path: file.path
    });
    
    // Ensure sidebar stays on files or whatever is appropriate
    // setSidebarView('files'); // Optional, keep current view
  }, [tabs, createTab, switchTab, shellConfig]);

  const handleEditorClose = useCallback(() => {
    setShowEditor(false);
    setEditorFile(null);
  }, []);

  const handleEditorSave = useCallback((file) => {
    addToast(`Saved: ${file.name}`, 'success', 2000);
  }, [addToast]);

  // v3.12.12: AM feature completely removed - all AM handlers deleted
  
  // Workflow handlers - REMOVED v3.9.0: Workflows deleted

  const loadCommands = () => {
    setCommandsLoading(true);
    setCommandsError(null);
    
    // Set a timeout to detect hanging requests
    let timeoutId = setTimeout(() => {
      setCommandsError('Request timeout - server may be unresponsive');
      setCommandsLoading(false);
      addToast('Failed to load command cards - timeout', 'error', 5000);
      timeoutId = null; // Mark as fired
    }, 10000); // 10 second timeout
    
    fetch('/api/commands')
      .then(r => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
      })
      .then(data => {
        // Only update if timeout hasn't fired
        if (timeoutId !== null || commandsLoading) {
          // Ensure data is an array
          let cards = Array.isArray(data) ? data : [];
          
          // Ensure Release Manager card is present (ID: -1) for sortability
          if (!cards.find(c => c.id === -1)) {
            cards = [{
              id: -1,
              description: 'Release Manager', 
              command: 'SYSTEM_RELEASE_MANAGER',
              pasteOnly: true,
              favorite: false
            }, ...cards];
          }
          
          setCommands(cards);
          setCommandsLoading(false);
        }
      })
      .catch(err => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        // Only show error if not already timed out
        if (commandsLoading) {
          console.error('Failed to load commands:', err);
          setCommandsError(err.message);
          setCommandsLoading(false);
          addToast(`Failed to load command cards: ${err.message}`, 'error', 5000);
        }
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
      // Command cards should ALWAYS execute directly in terminal, regardless of viewMode
      // Chat routing is only for user input from ChatView UI, not command cards
      
      if (cmd.command && cmd.command.trim().length > 0) {
        // Execute command directly in terminal
        termRef.sendCommand(cmd.command, cmd.delay);
        termRef.focus();

        // Zero-Click Workflow: If macro_payload exists, auto-inject after delay
        console.log('[SmartCard] Checking macro for:', cmd.name, 'Payload:', cmd.macro_payload ? 'YES' : 'NO');
        
        if (cmd.macro_payload && cmd.macro_payload.trim().length > 0) {
          const macroDelay = cmd.macro_delay || 1500; // Default 1500ms
          console.log('[SmartCard] Scheduling macro in', macroDelay, 'ms');
          
          setTimeout(() => {
            console.log('[SmartCard] Timer fired. Checking termRef...');
            // Re-acquire ref to be safe? No, termRef should be stable for the specific tab.
            // But let's check connection state explicitly.
            if (termRef) {
                const connected = termRef.isConnected ? termRef.isConnected() : 'unknown';
                console.log('[SmartCard] TermRef exists. Connected:', connected);
                
                if (connected === true || connected === 'unknown') {
                    console.log('[SmartCard] Sending payload...');
                    // Normalize newlines to \r for PTY execution and allow small delay for TUI processing
                    const payload = cmd.macro_payload.replace(/\n/g, '\r');
                    termRef.sendCommand(payload, 50);
                    console.log('[SmartCard] SENT.');
                } else {
                    console.error('[SmartCard] Terminal not connected, skipped.');
                }
            } else {
                console.error('[SmartCard] termRef is null inside timeout.');
            }
          }, macroDelay);
        }
      } else {
        // Focus terminal even if command is empty
        termRef.focus();
      }
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
    console.log('[handleSaveCommand] commandData:', commandData);
    console.log('[handleSaveCommand] editingCommand:', editingCommand);
    
    // Validate keybinding if manually specified
    const validation = validateKeybinding(
      commandData.keyBinding, 
      commands, 
      editingCommand?.id
    );
    
    console.log('[handleSaveCommand] validation result:', validation);
    
    if (!validation.valid) {
      addToast(validation.error, 'error', 5000);
      return;
    }
    
    let newCommands;
    if (editingCommand) {
      // Update existing
      newCommands = commands.map(c =>
        c.id === editingCommand.id ? { ...commandData, id: c.id } : c
      )
    } else {
      // Add new with smart keybinding
      const newId = Math.max(0, ...commands.map(c => c.id)) + 1
      
      // Auto-assign keybinding if not already set
      let finalData = { ...commandData };
      if (!finalData.keyBinding || finalData.keyBinding.trim() === '') {
        const nextKeybinding = getNextAvailableKeybinding(commands);
        if (nextKeybinding) {
          finalData.keyBinding = nextKeybinding;
        } else {
          // All 20 slots taken - alert user
          addToast('⚠️ All 20 default keybindings are assigned. Please assign a custom keybinding before saving.', 'error', 7000);
          return;
        }
      }
      
      newCommands = [...commands, { ...finalData, id: newId }]
    }
    saveCommands(newCommands)
    setIsModalOpen(false)
    setEditingCommand(null)
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
    <div className="sidebar" style={{ width: `${sidebarWidth}px` }}>
      {/* Row 1: View toggle tabs */}
      <div className="sidebar-view-tabs">
        <button 
          className={`sidebar-view-tab ${sidebarView === 'cards' ? 'active' : ''}`}
          onClick={() => setSidebarView('cards')}
        >
          <Command size={16} />
          Cards
        </button>
        {/* Workflows tab REMOVED v3.9.0 - consolidated to Forge Assist */}
        <button 
          className={`sidebar-view-tab ${sidebarView === 'files' ? 'active' : ''}`}
          onClick={() => {
            // Check if file access permission is set
            if (!fileAccessModeReady) {
              const ready = checkFileAccessPermission();
              if (!ready) {
                // Prompt will show, don't switch view yet
                return;
              }
            }
            setSidebarView('files');
          }}
        >
          <Folder size={16} />
          Files
        </button>
        <button
          className={`sidebar-view-tab ${sidebarView === 'debug' ? 'active' : ''}`}
          onClick={() => setSidebarView('debug')}
          title="Debug web applications with session recording"
        >
          <Bug size={16} />
          Web Tools
        </button>
      </div>

      {/* Row 2: Header - context-aware based on view */}
      <div className="sidebar-header">
        {sidebarView === 'cards' ? (
          <>
            <h3>⚡ Commands</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={handleAdd}>
                <Plus size={16} /> Add
              </button>
            </div>
          </>
        ) : sidebarView === 'files' ? (
          <>
            <h3>📁 Files</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="sidebar-path-hint">{activeTab?.currentDirectory ? getFolderNameFromPath(activeTab.currentDirectory) : 'Root'}</span>
            </div>
          </>
        ) : sidebarView === 'debug' ? (
          <>
            <h3>🌐 Web Tools</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {devMode && (
                <button
                  className="btn btn-primary"
                  onClick={() => setIsDiagnosticOverlayOpen(!isDiagnosticOverlayOpen)}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  {isDiagnosticOverlayOpen ? 'Hide' : 'Show'} Diagnostics
                </button>
              )}
            </div>
          </>
        ) : null}
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
        {/* Time-Travel button */}
        <button 
          className={`btn btn-ghost btn-icon ${isHistorySliderOpen ? 'active' : ''}`}
          onClick={() => setIsHistorySliderOpen(prev => !prev)} 
          title="Time Travel (Ctrl+Shift+H)"
        >
          <Clock size={18} />
        </button>
        {/* Feedback button */}
        <button 
          className="btn btn-ghost btn-icon"
          onClick={() => setIsFeedbackModalOpen(true)} 
          title="Send Feedback"
        >
          <MessageCircle size={18} />
        </button>
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
            className="btn btn-ghost btn-icon" 
            onClick={() => handleFontSizeChange(-1)} 
            title="Decrease Font Size"
            disabled={(fontTarget === 'terminal' ? fontSize : chatFontSize) <= MIN_FONT_SIZE}
          >
            <Minus size={18} />
          </button>
          <span className="font-size-display" title="Font Size">{fontTarget === 'terminal' ? `${fontSize}px` : `${chatFontSize}px`}</span>
          <button 
            className="btn btn-ghost btn-icon" 
            onClick={() => handleFontSizeChange(1)} 
            title="Increase Font Size"
            disabled={(fontTarget === 'terminal' ? fontSize : chatFontSize) >= MAX_FONT_SIZE}
          >
            <Plus size={18} />
          </button>
        </div>
        {/* Task Dashboard removed in v3.12.3 - was unimplemented scaffolding */}
        <button 
          className="btn btn-ghost btn-icon" 
          onClick={() => setIsSettingsModalOpen(true)} 
          title="Shell Settings"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Content area - Cards, Workflows, Files, Assistant, or Debug */}
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
              onToast={addToast}
              shellType={shellConfig.shellType}
            />
          </DndContext>
        ) : sidebarView === 'files' ? (
          <LensFilePicker
            currentPath={activeTab?.currentDirectory}
            onFileSelect={handleFileOpen}
            onSelectionChange={setContextFiles}
            terminalRef={getActiveTerminalRef()}
          />
        ) : sidebarView === 'debug' ? (
          <div style={{ overflowY: 'auto', height: '100%' }}>
            {devMode && (
              <DebugPanel
                terminalRef={getActiveTerminalRef()}
                tabId={activeTabId}
              />
            )}
            <div style={{ padding: '12px' }}>
              <WebAppDebuggerCard />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  // Sidebar resizer handlers
  const startDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    let lastWidth = startWidth;
    const onMove = (ev) => {
      const dx = (sidebarPosition === 'right') ? (startX - ev.clientX) : (ev.clientX - startX);
      let newWidth = startWidth + dx;
      newWidth = Math.max(200, Math.min(800, newWidth));
      lastWidth = newWidth;
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      localStorage.setItem('sidebarWidth', String(lastWidth));
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className={`app ${sidebarPosition === 'left' ? 'sidebar-left' : ''} ${showEditor ? 'with-editor' : ''}`}>
      {sidebarPosition === 'left' && (<>{sidebar}<div className="sidebar-resizer" onMouseDown={startDrag} /></>)}
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
          onToggleMode={toggleTabMode}
          onToggleViewMode={toggleTabViewMode}
          onChangeTheme={changeTabTheme}
          onOpenDashboard={() => setIsDeveloperDashboardOpen(true)}
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
            {/* Block terminal rendering until version is verified to prevent stale JS issues */}
            {!versionReady ? (
              <div className="terminal-loading" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                color: '#888'
              }}>
                Loading...
              </div>
            ) : tabs.map((tab) => (
              <div
                key={tab.id}
                className={`terminal-wrapper ${tab.id !== activeTabId ? 'hidden' : ''}`}
              >
                {/* Task Dashboard removed in v3.12.3 - was unimplemented scaffolding */}
                {/* v3.8.2: Terminal is the only view - ChatView and NotebookLayout removed */}
                <div className="view-layer terminal-layer active">
                  {tab.type === 'file' ? (
                    <MonacoEditor
                      file={tab.file || { path: tab.path, name: tab.title }}
                      onClose={() => closeTab(tab.id)}
                      onSave={handleEditorSave}
                      onModifiedChange={(modified) => updateTabModified(tab.id, modified)}
                      theme={tab.mode || theme}
                      rootPath={tab.currentDirectory || '.'}
                      terminalRef={null}
                    />
                  ) : (
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
                    tabName={tab.title}
                    currentDirectory={tab.currentDirectory || null}
                    onWaitingChange={(isWaiting) => handleWaitingChange(tab.id, isWaiting)}
                    onDirectoryChange={(folderName, fullPath) => handleDirectoryChange(tab.id, folderName, fullPath)}
                    onInteractiveTUI={(tuiType) => handleInteractiveTUI(tab.id, tuiType)}
                    onCopy={() => addToast('✓ Copied to clipboard', 'success', 1500)}
                    onPaste={(type, metadata) => {
                      // v3.9.8: Enhanced toast with metadata for better visibility
                      if (type === 'image') {
                        const sizeStr = metadata?.sizeKB > 1024 
                          ? `${(metadata.sizeKB / 1024).toFixed(1)}MB` 
                          : `${metadata?.sizeKB || '?'}KB`;
                        addToast(`📷 Image pasted (${sizeStr}) - Agent can see it`, 'success', 2500);
                      } else if (type === 'video') {
                        const sizeStr = metadata?.sizeKB > 1024 
                          ? `${(metadata.sizeKB / 1024).toFixed(1)}MB` 
                          : `${metadata?.sizeKB || '?'}KB`;
                        // Show different message based on frame extraction
                        if (metadata?.frameCount > 0) {
                          addToast(`🎬 Video pasted (${sizeStr}) - ${metadata.frameCount} frames extracted for AI`, 'success', 3000);
                        } else if (metadata?.ffmpegAvailable === false) {
                          addToast(`🎬 Video saved (${sizeStr}) - Install ffmpeg for AI visibility`, 'warning', 4000);
                        } else {
                          addToast(`🎬 Video pasted (${sizeStr})`, 'success', 2500);
                        }
                      } else {
                        const charInfo = metadata?.chars ? ` (${metadata.chars} chars)` : '';
                        addToast(`📋 Text pasted${charInfo}`, 'success', 1500);
                      }
                    }}
                    onFeedbackClick={() => setIsFeedbackModalOpen(true)}
                    onTerminalCommand={queryModelTier}
                    onRoutingUpdate={handleRoutingUpdate}
                  />
                  )}
                </div>
                {/* v3.8.2: NotebookLayout REMOVED - Terminal is the only view */}
              </div>
            ))}
          </div>
        </div>
      </div>
      {showEditor && editorFile && (
        <div className="editor-panel">
          {editorMode === 'agentic' ? (
            <AgenticEditor
              file={editorFile}
              proposedChanges={editorProposedChanges}
              anchors={editorAnchors}
              onClose={handleEditorClose}
              onSave={(content) => {
                handleEditorSave(editorFile);
                // TODO: Actually save content via API
              }}
              onRunAgent={(content, anchors) => {
                // Send to terminal as a copilot command with context
                const termRef = getActiveTerminalRef();
                if (termRef) {
                  const context = anchors?.length > 0 
                    ? `Focus on lines ${anchors[0].startLine}-${anchors[0].endLine}: ${anchors[0].prompt}`
                    : `Review and improve this file: ${editorFile.name}`;
                  addToast(`🤖 Agent context: ${context.substring(0, 50)}...`, 'info', 3000);
                }
              }}
              onAnchorCreate={(anchor) => {
                setEditorAnchors(prev => [...prev, anchor]);
                addToast(`📌 Anchor created on lines ${anchor.startLine}-${anchor.endLine}`, 'success', 2000);
              }}
              onChunkAccept={(chunk) => {
                addToast('✅ Change accepted', 'success', 1500);
              }}
              onChunkReject={(chunk) => {
                addToast('❌ Change rejected', 'info', 1500);
              }}
              theme={activeTab?.mode || theme}
            />
          ) : (
            <MonacoEditor
              file={editorFile}
              onClose={handleEditorClose}
              onSave={handleEditorSave}
              theme={activeTab?.mode || theme}
              rootPath={activeTab?.currentDirectory || '.'}
              terminalRef={getActiveTerminalRef()}
            />
          )}
        </div>
      )}
      {sidebarPosition === 'right' && (<><div className="sidebar-resizer" onMouseDown={startDrag} />{sidebar}</>)}

      <CommandModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingCommand(null)
        }}
        onSave={handleSaveCommand}
        initialData={editingCommand}
        commands={commands}
      />

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />

      <DeveloperDashboard
        isOpen={isDeveloperDashboardOpen}
        onClose={() => setIsDeveloperDashboardOpen(false)}
        devMode={devMode}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => {
          setIsSettingsModalOpen(false);
          setSettingsInitialTab('shell'); // Reset to default tab on close
        }}
        initialTab={settingsInitialTab}
        shellConfig={shellConfig}
        onSave={saveConfig}
        onToast={addToast}
        devMode={devMode}
        onDevModeChange={setDevMode}
        defaultTabTheme={defaultTabTheme}
        onDefaultTabThemeChange={(newTheme) => {
          setDefaultTabTheme(newTheme);
          localStorage.setItem('defaultTabTheme', newTheme);
        }}
        onRestartTour={() => {
          setIsSettingsModalOpen(false);
          restartTour();
        }}
      />

      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        updateInfo={updateInfo}
        currentVersion={currentVersion}
        isDevMode={window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'}
      />

      {/* WelcomeModal REMOVED per user request - replaced by guided tour */}

      <FileAccessPrompt
        isOpen={showFileAccessPrompt}
        onChoice={handleFileAccessChoice}
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Diagnostic Overlay - toggle via debug panel */}
      <DiagnosticOverlay
        isOpen={isDiagnosticOverlayOpen}
        onClose={() => setIsDiagnosticOverlayOpen(false)}
        position={sidebarPosition === 'right' ? 'left' : 'right'}
      />

      {/* v3.9.0: Workflow Canvas and Executor REMOVED - consolidated to Forge Assist + Task Dashboard */}
      
      {/* v3.8.2: ChatSidebar and NotebookLayout REMOVED - Terminal is the only view */}
      
      {/* History Slider - Time-Travel Scrubber */}
      {activeTabId && (
        <HistorySlider
          tabId={activeTabId}
          isOpen={isHistorySliderOpen}
          onClose={() => setIsHistorySliderOpen(false)}
          onPreview={(data) => {
            if (data) {
              addToast(`Viewing terminal state at ${new Date(data.timestamp).toLocaleTimeString()}`, 'info', 2000);
            }
          }}
          onChatAboutHistory={(content, timestamp) => {
            // v3.8.2: Just show toast, terminal is the only view
            setIsHistorySliderOpen(false);
            addToast(`Terminal state from ${timestamp.toLocaleTimeString()} available in history`, 'info', 4000);
          }}
          position="bottom"
        />
      )}

      {/* Forge Assist - Context-aware command palette (Ctrl+/) */}
      {/* Forge Assist - Context-aware command palette (Ctrl+/) */}
      {/* v3.9.0: Enhanced with Task Mode + SLM Integration */}
      <ForgeAssist
        isOpen={isForgeAssistOpen}
        onClose={() => setIsForgeAssistOpen(false)}
        onSendToTerminal={(cmd) => {
          const termRef = getActiveTerminalRef();
          if (termRef?.sendCommand) {
            termRef.sendCommand(cmd);
          } else if (termRef?.write) {
            termRef.write(ctx);
          }
        }}
        terminalBuffer={(() => {
          // Get terminal buffer on demand when ForgeAssist is open
          const termRef = getActiveTerminalRef();
          return termRef?.getBuffer?.() || '';
        })()}
        activeView="terminal"
        onToast={addToast}
        activeTabId={activeTabId}
        contextFiles={contextFiles}
      />

      {/* v3.8.2: Draggable Forge Assist floating button */}
      <button
        className={`forge-assist-floating-btn ${isDraggingBtn ? 'dragging' : ''}`}
        style={{
          position: 'fixed',
          right: `${forgeAssistBtnPos.right}px`,
          bottom: `${forgeAssistBtnPos.bottom}px`,
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'var(--accent-color, #8b5cf6)',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          cursor: isDraggingBtn ? 'grabbing' : 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          zIndex: 1000,
          transition: isDraggingBtn ? 'none' : 'transform 0.2s, box-shadow 0.2s',
          userSelect: 'none',
        }}
        onMouseDown={handleBtnMouseDown}
        onMouseEnter={(e) => {
          if (!isDraggingBtn) {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isDraggingBtn) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
          }
        }}
        title="Forge Assist - Drag to reposition (Ctrl+/)"
      >
        <Command size={24} />
      </button>

      {/* Guided Tour Overlay - First Run Experience (v3.3.0) */}
      {isTourActive && (
        <TourOverlay
          step={tourStepData}
          currentStep={tourCurrentStep}
          totalSteps={tourTotalSteps}
          onNext={tourNextStep}
          onSkip={skipTour}
        />
      )}
    </div>
  )
}

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
