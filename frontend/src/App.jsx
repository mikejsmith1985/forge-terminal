import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Moon, Sun, Plus, Minus, Power, Settings, Palette, PanelLeft, PanelRight, Download, Folder, Command, Bug, Workflow, MessageCircle, MessageSquare, Clock, BookOpen } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary'
import ForgeTerminal from './components/ForgeTerminal'
import ForgeAssist from './components/ForgeAssist'
import CommandCards from './components/CommandCards'
import CommandModal from './components/CommandModal'
import FeedbackModal from './components/FeedbackModal'
import SettingsModal from './components/SettingsModal'
import UpdateModal from './components/UpdateModal'
// WelcomeModal REMOVED - replaced by guided tour (user request: 20+ times)
import WorkflowCards from './components/WorkflowCards'
import { WorkflowCanvas } from './components/workflow/WorkflowCanvas'
import { WorkflowExecutor } from './components/workflow/WorkflowExecutor'
import FileAccessPrompt from './components/FileAccessPrompt'
import ShellToggle from './components/ShellToggle'
import TabBar from './components/TabBar'
import SearchBar from './components/SearchBar'
import FileExplorer from './components/FileExplorer'
import LensFilePicker from './components/LensFilePicker'
import MonacoEditor from './components/MonacoEditor'
import AgenticEditor from './components/AgenticEditor'
import AMMonitor from './components/AMMonitor'
import DebugPanel from './components/DebugPanel'
import DiagnosticOverlay from './components/DiagnosticOverlay'
import HistorySlider from './components/HistorySlider'
import ChatSidebar from './components/ChatSidebar'
import ChatView, { cleanupChatMessages } from './components/ChatView'
import { NotebookLayout } from './components/notebook'
import { ToastContainer, useToast } from './components/Toast'
import { themes, themeOrder, applyTheme } from './themes'
import { useTabManager } from './hooks/useTabManager'
import { useDevMode } from './hooks/useDevMode'
import { useWorkflowManager } from './hooks/useWorkflowManager'
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
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState('shell') // For opening Settings to specific tab
  const [editingCommand, setEditingCommand] = useState(null)
  const [theme, setTheme] = useState('dark')
  const [colorTheme, setColorTheme] = useState(() => {
    return localStorage.getItem('colorTheme') || 'molten';
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
  const [sidebarView, setSidebarView] = useState('cards') // 'cards', 'files', 'workflows', or 'debug'
  const [editorFile, setEditorFile] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [editorMode, setEditorMode] = useState('agentic') // 'agentic' or 'classic' (Monaco)
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
  
  // Workflow UI state
  const [isWorkflowCanvasOpen, setIsWorkflowCanvasOpen] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState(null)
  const [isWorkflowExecutorOpen, setIsWorkflowExecutorOpen] = useState(false)
  const [executingWorkflow, setExecutingWorkflow] = useState(null)
  
  // Time-Travel UI state
  const [isHistorySliderOpen, setIsHistorySliderOpen] = useState(false)
  
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
    toggleTabAM,
    toggleTabMode,
    toggleTabViewMode,
    updateTabDirectory,
    reorderTabs,
  } = useTabManager(shellConfig);
  
  // DevMode state
  const { devMode, setDevMode, isInitialized: devModeInitialized } = useDevMode();
  
  // Workflow management
  const {
    workflows,
    loading: workflowsLoading,
    error: workflowsError,
    loadWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
  } = useWorkflowManager();

  // Tour action handlers for interactive steps
  const tourActionHandlers = useMemo(() => ({
    openRouterConfig: () => setIsRouterConfigOpen(true),
    closeRouterConfig: () => setIsRouterConfigOpen(false),
    ensureChatView: () => {
      // Switch active tab to chat view if not already
      if (activeTab && activeTab.viewMode !== 'chat') {
        toggleTabViewMode(activeTab.id);
      }
    },
    showFilesTab: () => {
      // Switch sidebar to Files tab
      setSidebarView('files');
    },
  }), [activeTab, toggleTabViewMode]);

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
  
  // AM Master Control state (global kill switch for ALL tabs)
  const [amMasterEnabled, setAMMasterEnabled] = useState(() => {
    const saved = localStorage.getItem('amMasterEnabled');
    return saved !== null ? saved === 'true' : true; // Default to ON
  });
  
  // AM Default state (global override for new tabs)
  const [amDefaultEnabled, setAMDefaultEnabled] = useState(() => {
    const saved = localStorage.getItem('amDefaultEnabled');
    return saved !== null ? saved === 'true' : true; // Default to ON for legal compliance
  });
  
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
          console.log('[Update] Version changed from', lastKnownVersion, 'to', currentVersion, '- refreshing NOW');
          localStorage.setItem('lastKnownVersion', currentVersion);
          // DON'T set versionReady - we're about to refresh
          // Refresh immediately - no delay, don't let stale JS initialize terminal
          window.location.reload();
          return; // Never reached, but explicit
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
      logger.theme('Applying theme for active tab', { 
        tabId: activeTab.id, 
        colorTheme: activeTab.colorTheme,
        mode: tabMode
      });
      setColorTheme(activeTab.colorTheme);
      
      // CRITICAL FIX: Ensure global theme class matches tab mode
      // This ensures components using .light/.dark selectors (like SystemCommandCard) work correctly
      if (tabMode !== theme) {
        setTheme(tabMode);
        document.documentElement.className = tabMode;
        // Force re-apply theme variables immediately after class change
        applyTheme(activeTab.colorTheme, tabMode);
      } else {
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
      
      // Show welcome if not already shown for this version
      if (!data.shown) {
        setIsWelcomeModalOpen(true);
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
    
    // Override AM setting based on global default
    if (!amDefaultEnabled && result.tab) {
      toggleTabAM(result.tabId); // Toggle it off if global default is off
    }
    
    logger.tabs('New tab created', { tabId: result.tabId, colorTheme: result.tab?.colorTheme, amEnabled: amDefaultEnabled, type: options.type });
    // Theme will be applied by the activeTab useEffect below
  }, [createTab, shellConfig, addToast, amDefaultEnabled, toggleTabAM]);

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
      // Clean up chat messages for this tab
      cleanupChatMessages(tabId);
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

  // Handle interactive TUI detection - auto-switch to terminal view
  // This is triggered when Claude Code or similar shows a multi-question wizard
  const handleInteractiveTUI = useCallback((tabId, tuiType) => {
    logger.terminal('Interactive TUI detected', { tabId, tuiType });
    
    // v3.7.1: Don't auto-switch to terminal if user is working in chat mode
    // If they launched a CLI from chat, they want to stay in chat
    // Only switch if they were already in terminal mode (shouldn't happen)
    // or if this is a complex wizard that truly needs direct terminal interaction
    const tab = tabs.find(t => t.id === tabId);
    if (tab && tab.viewMode === 'chat') {
      // User is in chat mode - don't interrupt their workflow
      logger.terminal('User in chat mode, not switching to terminal');
      return;
    }
    
    if (tab && tab.viewMode !== 'terminal') {
      // Switch to terminal view so user can interact directly
      toggleTabViewMode(tabId);
      addToast('Interactive prompt detected - switched to terminal', 'info', 3000);
    }
  }, [tabs, toggleTabViewMode, addToast]);

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

  // Handle AM toggle - toggle in state (no backend API needed)
  const handleToggleAM = useCallback((tabId) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const newEnabled = !tab.amEnabled;
    toggleTabAM(tabId);
    addToast(newEnabled ? 'AM Logging enabled' : 'AM Logging disabled', 'info', 2000);
    logger.tabs('AM toggled', { tabId, enabled: newEnabled });
  }, [tabs, toggleTabAM, addToast]);

  // Handle global AM default change
  const handleAMDefaultChange = useCallback((enabled) => {
    setAMDefaultEnabled(enabled);
    localStorage.setItem('amDefaultEnabled', enabled.toString());
    addToast(
      enabled 
        ? 'New tabs will have AM enabled by default' 
        : '⚠️ New tabs will have AM disabled by default',
      enabled ? 'success' : 'warning',
      3000
    );
    logger.settings('AM default changed', { enabled });
  }, [addToast]);

  // Handle AM Master Control toggle
  const handleAMMasterToggle = useCallback(async (enabled) => {
    if (!enabled) {
      // Show confirmation dialog
      const confirmed = window.confirm(
        'Disable AM System?\n\n' +
        'This will:\n' +
        '• Stop all AM logging across all tabs\n' +
        '• Remove shell hooks from ~/.bashrc, ~/.zshrc, etc.\n\n' +
        'Hooks will need to be re-configured when AM is re-enabled.\n\n' +
        'Continue?'
      );
      
      if (!confirmed) return;
      
      try {
        const res = await fetch('/api/am/master-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false })
        });
        
        const data = await res.json();
        
        if (data.success) {
          setAMMasterEnabled(false);
          localStorage.setItem('amMasterEnabled', 'false');
          
          // Show success message
          const removedFiles = data.removed || [];
          if (removedFiles.length > 0) {
            addToast(
              `AM disabled. Hooks removed from:\n${removedFiles.map(r => r.filePath).join('\n')}`,
              'success',
              5000
            );
          } else {
            addToast('AM disabled. No hooks found to remove.', 'success', 3000);
          }
          
          logger.settings('AM Master disabled', { removed: removedFiles });
        } else {
          addToast('Failed to disable AM: ' + data.error, 'error', 3000);
        }
      } catch (err) {
        console.error('Failed to disable AM:', err);
        addToast('Failed to disable AM system', 'error', 3000);
      }
    } else {
      // Enable: Simple toggle
      setAMMasterEnabled(true);
      localStorage.setItem('amMasterEnabled', 'true');
      addToast('AM enabled. You will need to configure shell hooks in Settings → Shell Hooks.', 'info', 4000);
      logger.settings('AM Master enabled', {});
    }
  }, [addToast]);
  
  // Workflow handlers
  const handleWorkflowRun = useCallback((workflow) => {
    logger.workflows('Workflow run requested', { workflowId: workflow.id, name: workflow.name });
    setExecutingWorkflow(workflow);
    setIsWorkflowExecutorOpen(true);
  }, []);
  
  const handleWorkflowEdit = useCallback((workflow) => {
    logger.workflows('Workflow edit requested', { workflowId: workflow.id });
    setEditingWorkflow(workflow);
    setIsWorkflowCanvasOpen(true);
  }, []);
  
  const handleWorkflowDelete = useCallback(async (workflowId) => {
    const workflow = workflows.find(wf => wf.id === workflowId);
    if (!workflow) return;
    
    const confirmed = window.confirm(`Delete workflow "${workflow.name}"?`);
    if (!confirmed) return;
    
    const result = await deleteWorkflow(workflowId);
    if (result.success) {
      addToast('Workflow deleted', 'success', 2000);
    } else {
      addToast(`Failed to delete workflow: ${result.error}`, 'error', 3000);
    }
  }, [workflows, deleteWorkflow, addToast]);
  
  const handleNewWorkflow = useCallback(() => {
    logger.workflows('New workflow requested');
    setEditingWorkflow(null);
    setIsWorkflowCanvasOpen(true);
  }, []);
  
  const handleWorkflowCanvasSave = useCallback(async (workflowData) => {
    let result;
    if (editingWorkflow) {
      // Update existing workflow
      result = await updateWorkflow(editingWorkflow.id, workflowData);
      if (result.success) {
        addToast('Workflow updated', 'success', 2000);
      }
    } else {
      // Create new workflow
      result = await createWorkflow(workflowData);
      if (result.success) {
        addToast('Workflow created', 'success', 2000);
      }
    }
    
    if (result.success) {
      setIsWorkflowCanvasOpen(false);
      setEditingWorkflow(null);
    } else {
      addToast(`Failed to save workflow: ${result.error}`, 'error', 3000);
    }
  }, [editingWorkflow, updateWorkflow, createWorkflow, addToast]);
  
  const handleWorkflowCanvasClose = useCallback(() => {
    setIsWorkflowCanvasOpen(false);
    setEditingWorkflow(null);
  }, []);
  
  const handleWorkflowExecutorClose = useCallback(() => {
    setIsWorkflowExecutorOpen(false);
    setExecutingWorkflow(null);
  }, []);
  
  const handleWorkflowExecuteCommand = useCallback((commandCard) => {
    // Execute command in terminal
    const terminalRef = getActiveTerminalRef();
    if (terminalRef && commandCard) {
      terminalRef.sendCommand(commandCard.command, commandCard.delay);
      terminalRef.focus();
    }
  }, [getActiveTerminalRef]);

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
        const cards = Array.isArray(data) ? data : [];
        setCommands(cards);
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
      // Command cards should ALWAYS execute directly in terminal, regardless of viewMode
      // Chat routing is only for user input from ChatView UI, not command cards
      
      // If command is empty but triggerAM is true, we still want to trigger AM
      // but we shouldn't send an empty command to the terminal as it might just print a newline
      if (cmd.command && cmd.command.trim().length > 0) {
        // Execute command directly in terminal
        termRef.sendCommand(cmd.command, cmd.delay);
        termRef.focus();
      } else {
        // Focus terminal even if command is empty
        termRef.focus();
      }

      // If this command card is configured to trigger AM, send an AM log entry
      // so the backend can start/associate a conversation without relying on text detection.
      try {
        if (cmd.triggerAM && activeTab?.amEnabled) {
          fetch('/api/am/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tabId: activeTabId,
              tabName: activeTab?.title || 'Terminal',
              workspace: window.location.pathname,
              entryType: 'COMMAND_CARD_EXECUTED',
              commandId: cmd.id,
              description: cmd.description,
              content: cmd.command,
              triggerAM: true,
              llmProvider: cmd.llmProvider || '',
              llmType: cmd.llmType || 'chat',
              timestamp: new Date().toISOString()
            }),
          })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.conversationId) {
              addToast(`🧠 AM tracking started: ${cmd.description}`, 'success', 2000);
              logger.am('LLM conversation started from command card', { 
                conversationId: data.conversationId, 
                provider: cmd.llmProvider || 'auto-detected',
                commandId: cmd.id 
              });
            }
          })
          .catch(err => console.warn('[AM] Failed to send command-card AM event:', err));
        }
      } catch (err) {
        console.warn('[AM] Error while triggering AM for command card:', err);
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
        <button 
          className={`sidebar-view-tab ${sidebarView === 'workflows' ? 'active' : ''}`}
          onClick={() => setSidebarView('workflows')}
        >
          <Workflow size={16} />
          Flows
        </button>
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
        {devMode && (
          <button 
            className={`sidebar-view-tab ${sidebarView === 'debug' ? 'active' : ''}`}
            onClick={() => setSidebarView('debug')}
          >
            <Bug size={16} />
            Debug
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
        ) : sidebarView === 'workflows' ? (
          <>
            <h3>🔄 Workflows</h3>
            <button className="btn btn-primary" onClick={handleNewWorkflow}>
              <Plus size={16} /> New
            </button>
          </>
        ) : sidebarView === 'files' ? (
          <>
            <h3>📁 Files</h3>
            <span className="sidebar-path-hint">{activeTab?.currentDirectory ? getFolderNameFromPath(activeTab.currentDirectory) : 'Root'}</span>
          </>
        ) : sidebarView === 'debug' ? (
          <>
            <h3>🐛 Debug</h3>
            {devMode && (
              <button 
                className="btn btn-primary"
                onClick={() => setIsDiagnosticOverlayOpen(!isDiagnosticOverlayOpen)}
              >
                {isDiagnosticOverlayOpen ? 'Hide' : 'Show'} Diagnostics
              </button>
            )}
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
            className={`btn btn-ghost btn-icon btn-sm ${fontTarget === 'terminal' ? 'active' : ''}`} 
            onClick={() => setFontTarget('terminal')} 
            title="Set target: Terminal"
            aria-pressed={fontTarget === 'terminal'}
          >
            <span role="img" aria-label="terminal">⌨️</span>
          </button>
          <button 
            className="btn btn-ghost btn-icon btn-sm" 
            onClick={() => handleFontSizeChange(-1)} 
            title="Decrease Font Size"
            disabled={(fontTarget === 'terminal' ? fontSize : chatFontSize) <= MIN_FONT_SIZE}
          >
            <Minus size={14} />
          </button>
          <span className="font-size-display" title="Font Size">{fontTarget === 'terminal' ? `${fontSize}px` : `${chatFontSize}px`}</span>
          <button 
            className="btn btn-ghost btn-icon btn-sm" 
            onClick={() => handleFontSizeChange(1)} 
            title="Increase Font Size"
            disabled={(fontTarget === 'terminal' ? fontSize : chatFontSize) >= MAX_FONT_SIZE}
          >
            <Plus size={14} />
          </button>
          <button 
            className={`btn btn-ghost btn-icon btn-sm ${fontTarget === 'chat' ? 'active' : ''}`} 
            onClick={() => setFontTarget('chat')} 
            title="Set target: Assistant"
            aria-pressed={fontTarget === 'chat'}
          >
            <span role="img" aria-label="assistant">🤖</span>
          </button>
        </div>
        <button 
          className="btn btn-ghost btn-icon" 
          onClick={() => setIsSettingsModalOpen(true)} 
          title="Shell Settings"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* AM Monitor - Shows LLM activity status (Dev Mode only) */}
      {activeTab && devMode && (
        <AMMonitor 
          tabId={activeTab.id} 
          amEnabled={activeTab.amEnabled || false}
          devMode={devMode}
        />
      )}
      
      {/* Model Router Indicator - Task 4: Shows what's ACTUALLY running */}
      {currentModelTier && (
        <div className="model-tier-indicator" style={{
          padding: '8px 12px',
          margin: '8px 0',
          background: routingInfo?.tierMismatch
            ? 'rgba(251, 191, 36, 0.15)' // Yellow for mismatch
            : 'rgba(139, 92, 246, 0.15)', // Purple for normal
          border: `1px solid ${routingInfo?.tierMismatch
            ? 'rgba(251, 191, 36, 0.3)'
            : 'rgba(139, 92, 246, 0.3)'}`,
          borderRadius: '6px',
          fontSize: '12px',
          color: routingInfo?.tierMismatch ? '#fbbf24' : '#a78bfa',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontWeight: 600 }}>
            Running: {currentModelTier}
          </span>
          {/* v3.5.3: Use real task type from SLM analysis */}
          <span style={{ opacity: 0.7 }}>
            {getTaskTypeIcon(routingInfo?.taskType)} {formatTaskType(routingInfo?.taskType) || 'Analyzing...'}
          </span>
          {/* Show complexity if available from SLM */}
          {routingInfo?.complexity > 0 && (
            <span style={{ 
              fontSize: '10px', 
              opacity: 0.6,
              background: routingInfo.complexity >= 7 ? 'rgba(239, 68, 68, 0.2)' : 
                         routingInfo.complexity >= 4 ? 'rgba(251, 191, 36, 0.2)' : 
                         'rgba(34, 197, 94, 0.2)',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              {routingInfo.complexity}/10
            </span>
          )}
          {routingInfo?.tierMismatch && (
            <span style={{ fontSize: '10px', opacity: 0.6 }}>
              (switched from {routingInfo.previousTier})
            </span>
          )}
          {/* SLM indicator */}
          {routingInfo?.usedSLM === false && (
            <span style={{ fontSize: '9px', opacity: 0.4 }} title="Using heuristic fallback (SLM not available)">
              ⚠️
            </span>
          )}
        </div>
      )}

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
        ) : sidebarView === 'workflows' ? (
          <WorkflowCards
            workflows={workflows}
            loading={workflowsLoading}
            error={workflowsError}
            onRun={handleWorkflowRun}
            onEdit={handleWorkflowEdit}
            onDelete={handleWorkflowDelete}
            onNewWorkflow={handleNewWorkflow}
          />
        ) : sidebarView === 'files' ? (
          <LensFilePicker
            currentPath={activeTab?.currentDirectory}
            onFileSelect={handleFileOpen}
            terminalRef={getActiveTerminalRef()}
          />
        ) : sidebarView === 'debug' ? (
          <DebugPanel
            terminalRef={getActiveTerminalRef()}
            tabId={activeTabId}
          />
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
          onToggleAM={handleToggleAM}
          onToggleMode={toggleTabMode}
          onToggleViewMode={toggleTabViewMode}
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
                {/* v3.3.0: Render BOTH ChatView and ForgeTerminal, show/hide based on viewMode
                    This preserves terminal state when switching between views
                    v3.8.0: Added NotebookLayout as third view mode */}
                <div className={`view-layer chat-layer ${tab.viewMode === 'chat' ? 'active' : ''}`}>
                  <ChatView
                    tabId={tab.id}
                    fontSize={chatFontSize}
                    onToggleTerminal={() => toggleTabViewMode(tab.id)}
                    onOpenSettings={() => {
                      setSettingsInitialTab('budget');
                      setIsSettingsModalOpen(true);
                    }}
                    onToggleForgeAssist={() => setIsForgeAssistOpen(prev => !prev)}
                    onRunInTerminal={(command) => {
                      // Ghost Driver: Switch to terminal and inject command
                      toggleTabViewMode(tab.id, 'terminal');
                      setTimeout(() => {
                        const termRef = terminalRefs.current[tab.id];
                        if (termRef) {
                          termRef.sendCommand(command);
                          termRef.focus();
                        }
                      }, 100);
                    }}
                    // v3.5.3: PTY bridge connection - use getter to ensure ref is current
                    terminalRef={terminalRefs.current[tab.id]}
                    getTerminalRef={() => terminalRefs.current[tab.id]}
                  />
                </div>
                <div className={`view-layer terminal-layer ${tab.viewMode === 'terminal' ? 'active' : ''}`}>
                  <ForgeTerminal
                    ref={(el) => {
                      if (el) {
                        terminalRefs.current[tab.id] = el;
                      }
                    }}
                    tabId={tab.id}
                    isVisible={tab.id === activeTabId && tab.viewMode === 'terminal'}
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
                    onInteractiveTUI={(tuiType) => handleInteractiveTUI(tab.id, tuiType)}
                    onCopy={() => addToast('Text copied to clipboard', 'success', 1500)}
                    onPaste={(type) => {
                      if (type === 'image') {
                        addToast('Image pasted', 'success', 1500);
                      } else {
                        addToast('Text pasted from clipboard', 'success', 1500);
                      }
                    }}
                    onFeedbackClick={() => setIsFeedbackModalOpen(true)}
                    onTerminalCommand={queryModelTier}
                    onRoutingUpdate={handleRoutingUpdate}
                    onSwitchToChat={() => toggleTabViewMode(tab.id, 'chat')}
                  />
                </div>
                {/* v3.8.0: Notebook view - Agentic Notebook interface */}
                <div className={`view-layer notebook-layer ${tab.viewMode === 'notebook' ? 'active' : ''}`}>
                  <NotebookLayout
                    tabId={tab.id}
                    fontSize={fontSize}
                    colorTheme={tab.colorTheme || colorTheme}
                    theme={tab.mode || 'dark'}
                    shellConfig={tab.shellConfig}
                    onToggleTerminal={() => toggleTabViewMode(tab.id)}
                    onOpenSettings={() => {
                      setSettingsInitialTab('budget');
                      setIsSettingsModalOpen(true);
                    }}
                  />
                </div>
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
        amMasterEnabled={amMasterEnabled}
        onAMMasterChange={handleAMMasterToggle}
        amDefaultEnabled={amDefaultEnabled}
        onAMDefaultChange={handleAMDefaultChange}
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

      {/* Workflow Canvas - Full-screen workflow editor */}
      {isWorkflowCanvasOpen && (
        <WorkflowCanvas
          workflow={editingWorkflow}
          onSave={handleWorkflowCanvasSave}
          onClose={handleWorkflowCanvasClose}
          commandCards={commands}
        />
      )}

      {/* Workflow Executor - Step-by-step execution panel */}
      {isWorkflowExecutorOpen && executingWorkflow && (
        <WorkflowExecutor
          workflow={executingWorkflow}
          onClose={handleWorkflowExecutorClose}
          onExecuteCommand={handleWorkflowExecuteCommand}
          commandCards={commands}
        />
      )}
      
      {/* Chat Sidebar - AI assistant for terminal context */}
      <ChatSidebar
        isOpen={isChatSidebarOpen}
        onClose={() => setIsChatSidebarOpen(false)}
        tabId={activeTabId}
        fontSize={chatFontSize}
        onOpenSettings={() => {
          setSettingsInitialTab('budget');
          setIsSettingsModalOpen(true);
        }}
      />
      
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
            // Switch to chat mode if in terminal mode
            if (activeTab?.viewMode === 'terminal') {
              toggleTabViewMode(activeTabId);
            }
            // Close history slider
            setIsHistorySliderOpen(false);
            // Show toast with hint
            addToast(`Analyzing terminal state from ${timestamp.toLocaleTimeString()}. Ask your question in chat.`, 'info', 4000);
            // TODO: Could pre-populate chat context with historical content
          }}
          position="bottom"
        />
      )}

      {/* Forge Assist - Context-aware command palette (Ctrl+/) */}
      <ForgeAssist
        isOpen={isForgeAssistOpen}
        onClose={() => setIsForgeAssistOpen(false)}
        onSendToTerminal={(cmd) => {
          const termRef = getActiveTerminalRef();
          if (termRef?.sendCommand) {
            termRef.sendCommand(cmd);
          } else if (termRef?.write) {
            termRef.write(cmd);
          }
        }}
        onSendToChat={(cmd) => {
          // If in chat view, would send to chat input
          // For now, just send to terminal
          const termRef = getActiveTerminalRef();
          if (termRef?.sendCommand) {
            termRef.sendCommand(cmd);
          }
        }}
        terminalBuffer={(() => {
          // Get terminal buffer on demand when ForgeAssist is open
          const termRef = getActiveTerminalRef();
          return termRef?.getBuffer?.() || '';
        })()}
        activeView={activeTab?.viewMode || 'chat'}
        onToast={addToast}
      />

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
