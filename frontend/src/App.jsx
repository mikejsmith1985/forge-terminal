import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Moon, Sun, Plus, Minus, Power, Settings, Palette, PanelLeft, PanelRight, Download, Folder, Command, Wrench, Plug, Tag, MessageCircle, Clock, BookOpen, QrCode, Menu, X, Lock, RefreshCw } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary'
import ForgeTerminal from './components/ForgeTerminal'
import PhaseDecisionCard from './components/PhaseDecisionCard'
import SddPipelinePanel from './components/SddPipelinePanel'
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
import ImageViewer from './components/ImageViewer'
import AgenticEditor from './components/AgenticEditor'
import DebugPanel from './components/DebugPanel'
import WebAppDebuggerCard from './components/WebAppDebuggerCard'
import FollowMeDebugger from './components/FollowMeDebugger'
import ConnectionDiagnosticCard from './components/ConnectionDiagnosticCard'
import DiagnosticOverlay from './components/DiagnosticOverlay'
import HistorySlider from './components/HistorySlider'
// TaskDashboard removed in v3.12.3 - was unimplemented scaffolding with no backend
// CodeTutorPanel import removed — Code Tutor fully disabled
import VaultPanel from './components/VaultPanel'
import { ToastContainer, useToast } from './components/Toast'
import { themes, themeOrder, applyTheme } from './themes'
import { useTabManager } from './hooks/useTabManager'
import { useSddGate } from './hooks/useSddGate'
import { useDevMode } from './hooks/useDevMode'
// useWorkflowManager REMOVED - v3.9.0: Workflows deleted
import { logger } from './utils/logger'
import { getNextAvailableKeybinding, validateKeybinding, getKeybindingAvailability } from './utils/keybindingManager'
import { performanceInstrumentation } from './utils/performanceInstrumentation'
import { isTempOrSystemPath } from './utils/projectFolder'
import useGuidedTour from './hooks/useGuidedTour'
import TourOverlay from './components/TourOverlay'
import { TOUR_STEPS } from './config/tourSteps'
import ConnectionDiagnosticWizard from './components/ConnectionDiagnosticWizard'
import LicenseGate from './components/LicenseGate'
import MCPSetupCard from './components/MCPSetupCard'
import MCPDiscoveryCard from './components/MCPDiscoveryCard'
import CompanionAccessCard from './components/CompanionAccessCard'
import OwnerReleaseCard from './components/OwnerReleaseCard'
import ForgeWorkflowCard from './components/ForgeWorkflowCard'

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
  const [licenseStatus, setLicenseStatus] = useState(null)
  const [commands, setCommands] = useState([])
  const [commandsLoading, setCommandsLoading] = useState(true)
  const [commandsError, setCommandsError] = useState(null)
  const [directoryCardVisible, setDirectoryCardVisible] = useState(
    () => localStorage.getItem('forge_directory_card_visible') !== 'false'
  )
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
    return localStorage.getItem('defaultTabTheme') || 'auto-cycle-dark';
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
  const [sidebarView, setSidebarView] = useState('cards') // 'cards', 'files', 'mcp', or 'tools'
  const [sidebarTabStyle, setSidebarTabStyle] = useState(
    () => localStorage.getItem('sidebarTabStyle') || 'icon-only'
  )
  const [preferredCliTool, setPreferredCliTool] = useState(
    () => localStorage.getItem('preferredCliTool') || 'claude'
  )
  const handleCliToolChange = (tool) => {
    setPreferredCliTool(tool)
    localStorage.setItem('preferredCliTool', tool)
  }
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

  // Code Tutor state — HIDDEN for subscription release (feature not yet vetted)
  // const [isTutorOpen, setIsTutorOpen] = useState(false)
  const [isTutorOpen] = useState(false)

  // Forge Vault state (v5.3.0: encrypted secret store)
  const [isVaultOpen, setIsVaultOpen] = useState(false)

  // Mobile companion app is a separate PWA (forge-companion/) — the desktop
  // UI does not adapt its layout to small viewports. `isCompact` is kept as
  // a constant so mobile-conditional code paths become dead and tree-shake out.
  const isCompact = false;
  
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
    sessionLoaded,
    sessionLoadFailed,
    createTab,
    closeTab,
    switchTab,
    updateTabTitle,
    updateTabShellConfig,
    updateTabColorTheme,
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
    showWebToolsTab: () => setSidebarView('tools'),

    // History Slider (Time Travel)
    openHistorySlider: () => setIsHistorySliderOpen(true),
    closeHistorySlider: () => setIsHistorySliderOpen(false),

    // Settings modal
    openSettings: () => setIsSettingsModalOpen(true),
    closeSettings: () => setIsSettingsModalOpen(false),

    // Legacy router config — removed feature, kept as no-ops for tour compatibility
    openRouterConfig: () => {},
    closeRouterConfig: () => {},
  }), [tabs, createTab, closeTab]);

  // Connection diagnostic wizard — shown on first run and on PTY spawn failure.
  // isActive/stepData drive the feature tour overlay (TourOverlay).
  const {
    isActive: isTourActive,
    currentStep: tourCurrentStep,
    totalSteps: tourTotalSteps,
    stepData: tourStepData,
    nextStep: tourNextStep,
    skipTour,
    isWizardVisible,
    wizardTriggerReason,
    triggerWizard,
    closeWizard,
    restartTour,
  } = useGuidedTour(tourActionHandlers);

  /** Called by ForgeTerminal when close code 4005 (fatal spawn failure) fires. */
  const handleSpawnFailed = useCallback(() => {
    triggerWizard('spawnFailed');
  }, [triggerWizard]);

  /** Opens a fresh terminal and closes the wizard. */
  const handleWizardOpenTerminal = useCallback(() => {
    createTab();
    closeWizard();
  }, [createTab, closeWizard]);
  
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

  // Active background release jobs mapping: repoPath -> { jobId, version, status }
  const [activeReleaseJobs, setActiveReleaseJobs] = useState(() => {
    try {
      const saved = localStorage.getItem('forge_active_release_jobs');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error('Failed to parse active release jobs', e);
      return {};
    }
  });

  const handleJobStatusChange = useCallback((repoPath, job) => {
    if (!repoPath) return;
    setActiveReleaseJobs(prev => {
      const updated = { ...prev };
      if (!job) {
        delete updated[repoPath];
      } else {
        updated[repoPath] = {
          jobId: job.job_id,
          version: job.version,
          status: job.status
        };
      }
      localStorage.setItem('forge_active_release_jobs', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const activeReleaseJobsRef = useRef(activeReleaseJobs);
  useEffect(() => {
    activeReleaseJobsRef.current = activeReleaseJobs;
  }, [activeReleaseJobs]);

  useEffect(() => {
    let shouldContinue = true;

    const pollAllJobs = async () => {
      const currentJobs = activeReleaseJobsRef.current;
      const activePaths = Object.keys(currentJobs);
      if (activePaths.length === 0) return;

      for (const repoPath of activePaths) {
        const jobInfo = currentJobs[repoPath];
        if (!jobInfo || !jobInfo.jobId) continue;

        try {
          const query = new URLSearchParams({
            repoPath,
            jobId: jobInfo.jobId,
            maxLogBytes: '100', // Cheap status check
          });
          const response = await fetch(`/api/project/release-jobs?${query.toString()}`);
          if (!shouldContinue) return;

          if (response.ok) {
            const body = await response.json();
            const updatedJob = body.job;
            if (updatedJob) {
              if (updatedJob.status === 'completed') {
                addToast(`Release v${updatedJob.version} completed successfully!`, 'success', 5000);
                handleJobStatusChange(repoPath, null);
              } else if (updatedJob.status === 'failed') {
                addToast(`Release v${updatedJob.version} failed.`, 'error', 6000);
                handleJobStatusChange(repoPath, null);
              } else if (updatedJob.status !== jobInfo.status) {
                // Status changed (e.g. queued -> running)
                handleJobStatusChange(repoPath, updatedJob);
              }
            }
          } else if (response.status === 404) {
            // Job not found, clear it
            handleJobStatusChange(repoPath, null);
          }
        } catch (err) {
          console.error('[GlobalReleasePoll] Failed to poll status for', repoPath, err);
        }
      }
    };

    const timer = setInterval(pollAllJobs, 2000);
    return () => {
      shouldContinue = false;
      clearInterval(timer);
    };
  }, [handleJobStatusChange, addToast]);

  const DEFAULT_FONT_SIZE = 14;
  const MIN_FONT_SIZE = 8;
  const MAX_FONT_SIZE = 30;

  // Get ref for active terminal
  const getActiveTerminalRef = useCallback(() => {
    return activeTabId ? terminalRefs.current[activeTabId] : null;
  }, [activeTabId]);

  // SDD phase orchestrator (specs/003): the decision-card gate for the active session.
  const sddGate = useSddGate({ activeSessionId: activeTabId });

  // Bind the active session + its repo to the SDD pipeline once the working directory is
  // known. The backend resolves the active feature from .specify/feature.json and returns
  // 409 for repos not running a Spec Kit pipeline, so this is safe to call broadly.
  const lastSddBindRef = useRef(null);
  useEffect(() => {
    const repoRoot = activeTab?.currentDirectory;
    const bindKey = `${activeTabId}:${repoRoot}`;
    if (!activeTabId || !repoRoot || lastSddBindRef.current === bindKey) return;
    lastSddBindRef.current = bindKey;
    fetch('/api/sdd/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ sessionId: activeTabId, repoRoot }),
    }).catch(() => { /* best-effort: a failed bind never blocks the terminal */ });
  }, [activeTabId, activeTab?.currentDirectory]);

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
    fetch('/api/license/status')
      .then(r => r.json())
      .then(d => setLicenseStatus(d.status))
      .catch(() => setLicenseStatus('ok'))

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

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  // The handler ref holds the latest closure (updated every render) so the
  // actual window listener never needs to be re-registered. This eliminates
  // the ~1-5ms gap between removeEventListener/addEventListener that was
  // causing ~10% of keypresses to be silently dropped.
  const keyboardHandlerRef = useRef(null);

  keyboardHandlerRef.current = (e) => {
    // Check for command shortcuts (Ctrl+Shift+... or Ctrl+Alt+...)
    // We check this BEFORE xterm check to allow global shortcuts to work even when terminal is focused
    if (e.ctrlKey && (e.shiftKey || e.altKey)) {
      // Construct the pressed key combination string using e.code for reliability.
      // e.code gives physical key identity (e.g. 'Digit1', 'KeyA') regardless of
      // OS modifier remapping, unlike e.key which varies across platforms.
      let pressed = 'Ctrl+';
      if (e.altKey) pressed += 'Alt+';
      if (e.shiftKey) pressed += 'Shift+';

      let code = e.code;
      if (code.startsWith('Digit')) code = code.replace('Digit', '');
      if (code.startsWith('Key')) code = code.replace('Key', '');

      pressed += code;

      const matchedCommand = commands.find(cmd => {
        if (!cmd.keyBinding) return false;
        const normalize = s => s.toLowerCase().replace(/\s+/g, '').replace('control', 'ctrl');
        return normalize(cmd.keyBinding) === normalize(pressed);
      });

      if (matchedCommand) {
        e.preventDefault();
        if (matchedCommand.pasteOnly) {
          handlePaste(matchedCommand);
        } else {
          handleExecute(matchedCommand);
        }
        return;
      }
    }

    // --- App-level shortcuts (fire before the xterm early-return) ---
    // Using { capture: true } on the listener means this handler runs in
    // the capture phase, before xterm's own keydown listeners. Calling
    // stopPropagation() here prevents xterm from also processing the key.

      // Ctrl+Shift+H: History Slider — HIDDEN for subscription release
      // if (e.ctrlKey && e.shiftKey && (e.key === 'h' || e.key === 'H')) {
      //   e.preventDefault();
      //   e.stopPropagation();
      //   setIsHistorySliderOpen(prev => !prev);
      //   return;
      // }

      // Ctrl+Shift+T: Code Tutor — HIDDEN for subscription release
      // if (e.ctrlKey && e.shiftKey && (e.key === 't' || e.key === 'T')) {
      //   e.preventDefault();
      //   e.stopPropagation();
      //   if (!isCompact) setIsTutorOpen(prev => !prev);
      //   return;
      // }

    // Ctrl+End: Scroll to bottom (safe — not a shell binding)
    if (e.ctrlKey && e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      const termRef = getActiveTerminalRef();
      if (termRef && termRef.scrollToBottom) {
        termRef.scrollToBottom();
      }
      return;
    }

    // Compute focus context once so all routing decisions below can reference it.
    const isXtermTextarea = e.target?.classList?.contains('xterm-helper-textarea');
    const target = e.target;
    const isInputField = target.tagName === 'INPUT' ||
                        target.tagName === 'TEXTAREA' ||
                        target.isContentEditable;

    // Ctrl+F: Open terminal search overlay.
    // Must appear BEFORE the xterm textarea guard so this shortcut fires
    // even when the terminal has keyboard focus. We exclude real input fields
    // (modals, rename boxes) so browser-native Ctrl+F still works there.
    if (e.ctrlKey && !e.shiftKey && (e.key === 'f' || e.key === 'F') && !isInputField) {
      e.preventDefault();
      e.stopPropagation(); // Prevent xterm from forwarding \x06 (Ctrl+F) to the PTY
      setIsSearchOpen(true);
      return;
    }

    // For all remaining keys: when the terminal helper textarea is focused
    // (terminal has keyboard focus), let xterm handle the event natively.
    if (isXtermTextarea) {
      return;
    }

    // Skip App-level shortcuts when the user is typing in a real input field.
    if (isInputField) {
      return;
    }

    // Check if target is within xterm terminal (for copy/paste support)
    const isTerminalFocused = target.closest?.('.xterm') ||
                             target.classList?.contains('xterm') ||
                             target.closest?.('.terminal-inner');

    // Allow Ctrl+C and Ctrl+V to pass through to xterm when terminal is focused
    if (isTerminalFocused && e.ctrlKey && (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V')) {
      return;
    }

    // Terminal focus redirect: when a plain printable character is typed but xterm
    // has lost focus (e.g., after clicking the scroll button, toolbar, or any non-input
    // UI element), transparently forward the character to the active terminal and
    // restore focus so all subsequent keypresses route correctly.
    //
    // Root cause of the recurring "number keys not accepted" bug: clicking ANY
    // focusable UI element (buttons, containers, panels) transfers browser focus away
    // from xterm's hidden textarea. Without this redirect, the first key the user
    // types after such an interaction is silently dropped — common when Copilot CLI
    // or other TUI apps show a numbered-selection menu immediately after a UI action.
    const isPlainPrintable = !e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1;
    const isAnyOverlayOpen = isSearchOpen || isForgeAssistOpen || isModalOpen ||
      isSettingsModalOpen || isFeedbackModalOpen ||
      isUpdateModalOpen || isDiagnosticOverlayOpen || isTutorOpen ||
      isVaultOpen || isHistorySliderOpen || isDeveloperDashboardOpen;

    if (isPlainPrintable && !isAnyOverlayOpen) {
      const termRef = getActiveTerminalRef();
      if (termRef?.isConnected()) {
        e.preventDefault();
        e.stopPropagation();
        // Restore focus so all subsequent keystrokes route directly to xterm
        termRef.focus();
        // Forward the character that triggered this redirect to the PTY directly,
        // since the current key event can no longer be re-routed to xterm's textarea.
        const activeSocket = termRef.getSocket();
        if (activeSocket?.readyState === WebSocket.OPEN) {
          activeSocket.send(e.key);
        }
        return;
      }
    }

    // Ctrl+/: Toggle Forge Assist(desktop only — modal not usable on compact screens)
    if (e.ctrlKey && !e.shiftKey && e.key === '/') {
      e.preventDefault();
      if (!isCompact) setIsForgeAssistOpen(prev => !prev);
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

      // Ctrl+1 through Ctrl+9: Switch to tab by number.
      // Use e.code ('Digit1'..'Digit9') for reliable digit detection —
      // e.key is unreliable with modifier combos on some OS/browser combos.
      if (e.code && e.code.startsWith('Digit')) {
        const digit = parseInt(e.code.charAt(5), 10);
        if (digit >= 1 && digit <= 9) {
          e.preventDefault();
          const tabIndex = digit - 1;
          if (tabIndex < tabs.length) {
            switchTab(tabs[tabIndex].id);
          }
          return;
        }
      }
    }
  };

  // Register the keyboard listener ONCE on mount. The stable wrapper delegates
  // to keyboardHandlerRef.current which is updated every render, so the listener
  // always sees fresh state without needing to be re-registered.
  useEffect(() => {
    const stableKeyboardHandler = (e) => keyboardHandlerRef.current?.(e);
    window.addEventListener('keydown', stableKeyboardHandler, { capture: true });
    return () => window.removeEventListener('keydown', stableKeyboardHandler, { capture: true });
  }, []);

  // Handle new tab creation
  const handleNewTab = useCallback((options = {}) => {
    logger.tabs('New tab button clicked', options);

    // Inherit the active tab's working directory so the new tab opens in the
    // same workspace rather than falling back to the server's process CWD.
    const activeTab = tabs.find(t => t.id === activeTabId);
    const inheritedDir = activeTab?.currentDirectory || null;
    
    const result = createTab({
      ...shellConfig,
      type: options.type || 'terminal' // 'terminal' or 'agent'
    }, inheritedDir);
    
    if (!result.success) {
      if (result.error === 'max_tabs') {
        logger.tabs('Max tabs limit reached');
        addToast('Maximum tab limit reached (20)', 'warning', 3000);
      } else if (result.error === 'not_initialized') {
        logger.tabs('Tab creation failed - state not yet ready');
        addToast('Terminal not ready yet. Please try again in a moment.', 'warning', 2000);
      } else {
        logger.tabs('Tab creation failed', { error: result.error });
        addToast('Failed to create new tab', 'error', 3000);
      }
      return;
    }
    
    // v3.12.12: AM feature completely removed
    
    logger.tabs('New tab created', { tabId: result.tabId, colorTheme: result.tab?.colorTheme, type: options.type });
    // Theme will be applied by the activeTab useEffect below
  }, [createTab, shellConfig, addToast, tabs, activeTabId]);

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
    
    // v3.14.12: Increased delay to ensure terminal is fully rendered after display:none -> display:flex
    // Use requestAnimationFrame to wait for next paint, then focus
    requestAnimationFrame(() => {
      setTimeout(() => {
        const termRef = terminalRefs.current[tabId];
        if (termRef) {
          termRef.focus();
        }
      }, 100);
    });
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

  // Handle directory change from the terminal: track the shell's current directory
  // for features that depend on it (git panel, release/workflow cards), but NEVER
  // rename the tab. The tab label is set once at tab creation (see tabLabel.js) and
  // is deliberately immune to navigation — this is the tab-naming rebuild's core
  // rule, and the reason the label no longer drifts (or corrupts) as an agent
  // navigates deep into a project.
  const handleDirectoryChange = useCallback((tabId, folderName, fullPath) => {
    // Skip temp/system directories so currentDirectory keeps pointing at the real
    // project root rather than a transient %TEMP% path (used by other features).
    if (fullPath && isTempOrSystemPath(fullPath)) {
      return;
    }
    if (fullPath) {
      updateTabDirectory(tabId, fullPath);
    }
  }, [updateTabDirectory]);

  // Helper to get folder name from a path
  const getFolderNameFromPath = (path) => {
    if (!path) return '';
    const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || normalized;
  };

  // Check if file is an image
  const isImageFile = (fileName) => {
    if (!fileName) return false;
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext);
  };

  // Check if file should open in browser (HTML files)
  const isBrowserFile = (fileName) => {
    if (!fileName) return false;
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ['html', 'htm'].includes(ext);
  };

  // File explorer handlers
  const handleFileOpen = useCallback(async (file) => {
    console.log('[App] handleFileOpen called:', file);
    
    if (!file || !file.path) {
      console.error('[App] Invalid file object:', file);
      addToast('Cannot open file: invalid file object', 'error', 3000);
      return;
    }

    const fileName = file.name || file.path.split(/[/\\]/).pop();
    
    // HTML files: open in browser
    if (isBrowserFile(fileName)) {
      try {
        // Get the active tab's current directory to resolve relative paths
        const cwd = activeTab?.currentDirectory || '.';
        
        // Resolve the full path
        let fullPath = file.path;
        if (!file.path.match(/^[A-Za-z]:/) && !file.path.startsWith('/') && !file.path.startsWith('\\\\')) {
          // Relative path - join with cwd
          fullPath = cwd.replace(/\\/g, '/') + '/' + file.path.replace(/\\/g, '/');
        }
        
        console.log('[App] Opening HTML in browser:', fullPath);
        
        // Use the backend API to open in system browser
        const response = await fetch('/api/open-external', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: fullPath }),
        });
        
        if (response.ok) {
          addToast(`🌐 Opened ${fileName} in browser`, 'success', 2000);
        } else {
          // Fallback: try file:// URL in new tab
          const fileUrl = `file:///${fullPath.replace(/\\/g, '/')}`;
          window.open(fileUrl, '_blank');
          addToast(`🌐 Opened ${fileName}`, 'success', 2000);
        }
      } catch (err) {
        console.error('[App] Failed to open in browser:', err);
        // Fallback to editor if browser open fails
        setEditorFile({ ...file, name: fileName });
        setShowEditor(true);
      }
      return;
    }

    // Images: use ImageViewer
    // Other files: use MonacoEditor
    // Both are handled by the existing render logic
    
    // For WSL terminals: convert Linux absolute paths to Windows-compatible paths
    // The Go backend is a Windows binary and cannot resolve /home/... paths natively
    let filePath = file.path;
    const isWSL = activeTab?.shellConfig?.shellType === 'wsl';
    const wslDistro = activeTab?.shellConfig?.wslDistro;
    if (isWSL && filePath.startsWith('/')) {
      if (filePath.startsWith('/mnt/') && filePath.length > 6) {
        // /mnt/c/Users/... → C:/Users/... (WSL accessing Windows drives)
        const parts = filePath.split('/');
        if (parts.length >= 3) {
          const drive = parts[2].toUpperCase();
          const remainder = parts.slice(3).join('/');
          filePath = `${drive}:/${remainder}`;
          console.log('[App] WSL /mnt/ path → Windows drive:', filePath);
        }
      } else if (wslDistro) {
        // /home/user/... → \\wsl.localhost\Ubuntu\home\user\...
        const linuxPath = filePath.slice(1).replace(/\//g, '\\');
        filePath = `\\\\wsl.localhost\\${wslDistro}\\${linuxPath}`;
        console.log('[App] WSL Linux path → UNC:', filePath);
      }
    }

    // Compute the correct rootPath for the file
    // If path is absolute, use the file's directory as rootPath
    // If relative, use the current tab's directory
    let computedRootPath = activeTab?.currentDirectory || '.';

    // For WSL terminals: convert rootPath (currentDirectory) from Linux path to Windows-compatible
    // Same logic as filePath conversion above — the Go backend is Windows-only
    if (isWSL && computedRootPath.startsWith('/')) {
      if (computedRootPath.startsWith('/mnt/') && computedRootPath.length > 5) {
        const parts = computedRootPath.split('/');
        if (parts.length >= 3) {
          const drive = parts[2].toUpperCase();
          const remainder = parts.slice(3).join('/');
          computedRootPath = remainder ? `${drive}:/${remainder}` : `${drive}:/`;
          console.log('[App] WSL rootPath /mnt/ → Windows drive:', computedRootPath);
        }
      } else if (wslDistro) {
        const linuxPath = computedRootPath.slice(1).replace(/\//g, '\\');
        computedRootPath = `\\\\wsl.localhost\\${wslDistro}\\${linuxPath}`;
        console.log('[App] WSL rootPath Linux → UNC:', computedRootPath);
      }
    }

    const isAbsolutePath = filePath.match(/^[A-Za-z]:/) || filePath.startsWith('/') || filePath.startsWith('\\\\');
    
    if (isAbsolutePath) {
      // For absolute paths, use the file's parent directory as rootPath
      // This allows reading files outside the current working directory
      const pathParts = filePath.replace(/\\/g, '/').split('/');
      pathParts.pop(); // Remove filename
      computedRootPath = pathParts.join('/') || '/';
      console.log('[App] Absolute path detected, using parent as rootPath:', computedRootPath);
    }
    
    setEditorFile({ ...file, path: filePath, name: fileName, rootPath: computedRootPath });
    setShowEditor(true);
  }, [activeTab, addToast]);

  // Ensure file has a name property
  // (Some callers only provide path)

  const handleEditorClose = useCallback(() => {
    setShowEditor(false);
    setEditorFile(null);
  }, []);

  const handleEditorSave = useCallback((file) => {
    addToast(`Saved: ${file.name}`, 'success', 2000);
  }, [addToast]);

  // v3.12.12: AM feature completely removed - all AM handlers deleted
  
  // Workflow handlers - REMOVED v3.9.0: Workflows deleted

  const loadCommands = useCallback(() => {
    setCommandsLoading(true);
    setCommandsError(null);

    // Use a mutable flag instead of reading stale `commandsLoading` from a closure.
    // Without this, a second call to loadCommands (e.g. the refresh button) would
    // capture commandsLoading=false from the previous render and the guard below
    // would be false, silently discarding the fetched cards and leaving the sidebar
    // frozen on "Loading command cards..." forever.
    let isRequestActive = true;

    const timeoutId = setTimeout(() => {
      if (!isRequestActive) return;
      isRequestActive = false;
      setCommandsError('Request timeout - server may be unresponsive');
      setCommandsLoading(false);
      addToast('Failed to load command cards - timeout', 'error', 5000);
    }, 10000);

    fetch('/api/commands')
      .then(r => {
        // Abort if the timeout already fired
        if (!isRequestActive) return null;
        clearTimeout(timeoutId);
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
      })
      .then(data => {
        if (data === null) return; // Request was already handled by the timeout
        if (!isRequestActive) return;
        isRequestActive = false;

        // Filter out the legacy Release Manager card (id: -1) which lives in the Tools tab
        const cards = (Array.isArray(data) ? data : []).filter(c => c.id !== -1);
        setCommands(cards);
        setCommandsLoading(false);
      })
      .catch(err => {
        clearTimeout(timeoutId);
        if (!isRequestActive) return;
        isRequestActive = false;
        console.error('Failed to load commands:', err);
        setCommandsError(err.message);
        setCommandsLoading(false);
        addToast(`Failed to load command cards: ${err.message}`, 'error', 5000);
      });
  }, [addToast])

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
    if (!termRef) return;

    // Command cards always execute directly in the terminal, regardless of viewMode.
    // Chat routing is only for user input from the ChatView UI, not command cards.
    if (cmd.command && cmd.command.trim().length > 0) {
      termRef.sendCommand(cmd.command, cmd.delay);
      termRef.focus();

      // If the card has a macro payload, inject it after macro_delay ms.
      // The total wait = time for the Enter key (cmd.delay) + macro_delay so the
      // payload arrives after the initial command has had time to start.
      // We capture termRef here so the macro always targets the correct terminal
      // even if the user switches tabs before the timeout fires.
      const hasMacroPayload = cmd.macro_payload && cmd.macro_payload.trim().length > 0;
      if (hasMacroPayload) {
        // Server-side macro injection (v7.8.5+).  The backend owns the PTY
        // and can wait for an *output-quiet* window before injecting, so
        // the payload survives cold-start variance, npm-install noise, and
        // WebSocket reconnects — all of which broke the old fixed-delay
        // browser-side bracketed-paste path.  See cmd/forge/handlers_macro.go.
        const macroMinDelayMs = (cmd.macro_delay !== undefined && cmd.macro_delay !== null)
          ? parseInt(cmd.macro_delay, 10)
          : 1500;
        const macroSessionId = activeTabId;
        if (macroSessionId) {
          // Delay the fetch until AFTER the Enter key fires (cmd.delay ms) plus a
          // 200 ms buffer so the server sees a live process when it starts polling.
          // Without this, the fetch races the Enter key and waitForPTYQuiet fires
          // on stale quiet output before the CLI has even been launched.
          const macroFireDelay = Math.max((cmd.delay || 0) + 200, 0);
          setTimeout(() => {
            fetch(`/api/terminal/${encodeURIComponent(macroSessionId)}/macro`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({
                payload: cmd.macro_payload,
                minDelayMs: macroMinDelayMs,
                // Forward the per-card mode override when present.
                // "bracketed" forces bracketed-paste regardless of detection,
                // which prevents chunked mode from mangling multiline payloads
                // by submitting each paragraph as a separate message.
                ...(cmd.macro_mode ? { mode: cmd.macro_mode } : {}),
              }),
            })
              .then((res) => res.json().catch(() => ({})).then((body) => ({ ok: res.ok, body })))
              .then(({ ok, body }) => {
                if (!ok) {
                  console.warn('[Macro] backend rejected payload', body);
                } else {
                  console.info('[Macro] delivered', body);
                }
              })
              .catch((err) => {
                console.warn('[Macro] fetch failed', err);
              });
          }, macroFireDelay);
        } else {
          console.warn('[Macro] no active tab id — cannot send macro');
        }
      }
    } else {
      // Focus terminal even if the command is empty
      termRef.focus();
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

  const handleHideDirectoryCard = () => {
    setDirectoryCardVisible(false)
    localStorage.setItem('forge_directory_card_visible', 'false')
  }

  const handleShowDirectoryCard = () => {
    setDirectoryCardVisible(true)
    localStorage.setItem('forge_directory_card_visible', 'true')
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
      const isToolAware = !!editingCommand.toolVariants && Object.keys(editingCommand.toolVariants).length > 0;
      let finalCommandData = { ...commandData, id: editingCommand.id };

      if (isToolAware) {
        // Save the edited values back to the active tool's variant maps
        const updatedToolVariants = {
          ...editingCommand.toolVariants,
          [preferredCliTool]: commandData.command
        };
        const updatedDescriptionVariants = {
          ...editingCommand.descriptionVariants,
          [preferredCliTool]: commandData.description
        };
        const updatedMacroVariants = {
          ...editingCommand.macroVariants,
          [preferredCliTool]: commandData.macro_payload
        };

        finalCommandData = {
          ...finalCommandData,
          toolVariants: updatedToolVariants,
          descriptionVariants: updatedDescriptionVariants,
          macroVariants: updatedMacroVariants,
          // Preserve base values for non-active tools/fallbacks
          command: editingCommand.command,
          description: editingCommand.description,
          macro_payload: editingCommand.macro_payload
        };
      }

      newCommands = commands.map(c =>
        c.id === editingCommand.id ? finalCommandData : c
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
      <div className={`sidebar-view-tabs ${sidebarTabStyle === 'icon-only' ? 'icon-only' : ''}`}>
        <button
          className={`sidebar-view-tab ${sidebarView === 'cards' ? 'active' : ''}`}
          onClick={() => setSidebarView('cards')}
          title="Cards"
        >
          <Command size={16} />
          <span className="tab-label">Cards</span>
        </button>
        <button
          className={`sidebar-view-tab ${sidebarView === 'files' ? 'active' : ''}`}
          onClick={() => {
            if (!fileAccessModeReady) {
              const ready = checkFileAccessPermission();
              if (!ready) return;
            }
            setSidebarView('files');
          }}
          title="Files"
        >
          <Folder size={16} />
          <span className="tab-label">Files</span>
        </button>
        <button
          className={`sidebar-view-tab ${sidebarView === 'mcp' ? 'active' : ''}`}
          onClick={() => setSidebarView('mcp')}
          title="MCP"
        >
          <Plug size={16} />
          <span className="tab-label">MCP</span>
        </button>
        <button
          className={`sidebar-view-tab ${sidebarView === 'tools' ? 'active' : ''}`}
          onClick={() => setSidebarView('tools')}
          title="Tools"
        >
          <Wrench size={16} />
          <span className="tab-label">Tools</span>
        </button>
      </div>

      {/* Row 2: Header - context-aware based on view */}
      <div className="sidebar-header">
        {sidebarView === 'cards' ? (
          <>
            <h3>⚡ Commands</h3>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {!directoryCardVisible && (
                <button
                  className="btn btn-secondary"
                  onClick={handleShowDirectoryCard}
                  title="Show Projects Browser"
                  style={{ padding: '5px 8px' }}
                >
                  <Folder size={14} />
                </button>
              )}
              {/* Reload cards from the server without a full page refresh.
                  Useful when an agent has added new command cards via the API
                  and you want to see them immediately. */}
              <button
                className="btn btn-secondary"
                onClick={loadCommands}
                disabled={commandsLoading}
                title="Reload command cards"
                style={{ padding: '5px 8px' }}
              >
                <RefreshCw
                  size={14}
                  style={commandsLoading ? { animation: 'spin 1s linear infinite' } : undefined}
                />
              </button>
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
        ) : sidebarView === 'mcp' ? (
          <>
            <h3>🔌 MCP</h3>
          </>
        ) : sidebarView === 'tools' ? (
          <>
            <h3>🛠️ Tools</h3>
          </>
        ) : null}
      </div>

      {/* Row 3: Theme controls */}
      <div className="theme-controls">
        <button
          className={`btn btn-ghost btn-icon ${sidebarTabStyle === 'icon-label' ? 'active' : ''}`}
          onClick={() => {
            const next = sidebarTabStyle === 'icon-only' ? 'icon-label' : 'icon-only';
            setSidebarTabStyle(next);
            localStorage.setItem('sidebarTabStyle', next);
          }}
          title={sidebarTabStyle === 'icon-only' ? 'Show tab labels' : 'Hide tab labels'}
        >
          <Tag size={18} />
        </button>
        <button className="btn btn-ghost btn-icon" onClick={cycleColorTheme} title={`Theme: ${themes[colorTheme]?.name || 'Molten Metal'}`}>
          <Palette size={18} />
        </button>
        <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title="Toggle Light/Dark">
          {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="btn btn-ghost btn-icon" onClick={toggleSidebarPosition} title={`Move sidebar to ${sidebarPosition === 'right' ? 'left' : 'right'}`}>
          {sidebarPosition === 'right' ? <PanelLeft size={18} /> : <PanelRight size={18} />}
        </button>
        {/* Time Travel — HIDDEN for subscription release (feature not yet vetted) */}
        {/* <button 
          className={`btn btn-ghost btn-icon ${isHistorySliderOpen ? 'active' : ''}`}
          onClick={() => setIsHistorySliderOpen(prev => !prev)} 
          title="Time Travel (Ctrl+Shift+H)"
        >
          <Clock size={18} />
        </button> */}
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
        {/* Remote Access — HIDDEN for subscription release (feature not yet vetted) */}
        <button 
          className="btn btn-ghost btn-icon" 
          onClick={() => setIsSettingsModalOpen(true)} 
          title="Shell Settings"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Content area - Cards, Files, MCP, or Tools */}
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
              cwd={activeTab?.currentDirectory}
              directoryCardVisible={directoryCardVisible}
              onHideDirectoryCard={handleHideDirectoryCard}
              preferredCliTool={preferredCliTool}
              onCliToolChange={handleCliToolChange}
            />
          </DndContext>
        ) : sidebarView === 'files' ? (
          <LensFilePicker
            currentPath={activeTab?.currentDirectory}
            onFileSelect={handleFileOpen}
            onSelectionChange={setContextFiles}
            terminalRef={getActiveTerminalRef()}
          />
        ) : sidebarView === 'mcp' ? (
          <div style={{ overflowY: 'auto', height: '100%' }}>
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <MCPDiscoveryCard />
              <MCPSetupCard />
              <CompanionAccessCard />
            </div>
          </div>
        ) : sidebarView === 'tools' ? (
          <div style={{ overflowY: 'auto', height: '100%' }}>
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <OwnerReleaseCard
                onExecuteCommand={handleExecute}
                onToast={addToast}
                shellType={shellConfig.shellType}
                cwd={activeTab?.currentDirectory}
                activeReleaseJobs={activeReleaseJobs}
                onJobStatusChange={handleJobStatusChange}
              />
              <ForgeWorkflowCard onExecuteCommand={handleExecute} onToast={addToast} cwd={activeTab?.currentDirectory} />
              <WebAppDebuggerCard />
              <FollowMeDebugger />
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

  if (licenseStatus === 'required' || licenseStatus === 'expired') {
    return <LicenseGate status={licenseStatus} />
  }

  return (
    <div className={`app ${sidebarPosition === 'left' ? 'sidebar-left' : ''} ${showEditor ? 'with-editor' : ''}`}>
      {!isCompact && sidebarPosition === 'left' && (<>{sidebar}<div className="sidebar-resizer" onMouseDown={startDrag} /></>)}
      <div className="terminal-pane">
        {!isCompact && (
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={handleTabSwitch}
            onTabClose={handleTabClose}
            onTabRename={handleTabRename}
            onNewTab={handleNewTab}
            onReorder={reorderTabs}
            onToggleMode={toggleTabMode}
            onToggleViewMode={toggleTabViewMode}
            onChangeTheme={changeTabTheme}
            onOpenDashboard={() => setIsDeveloperDashboardOpen(true)}
            onToggleForgeAssist={() => setIsForgeAssistOpen(prev => !prev)}
            isForgeAssistOpen={isForgeAssistOpen}
            // onToggleTutor — HIDDEN for subscription release
            // isTutorOpen — HIDDEN for subscription release
            onToggleVault={() => setIsVaultOpen(prev => !prev)}
            isVaultOpen={isVaultOpen}
            disableNewTab={tabs.length >= MAX_TABS}
            waitingTabs={waitingTabs}
            activeReleaseJobs={activeReleaseJobs}
            mode={theme}
            devMode={devMode}
          />
        )}
        {/* isCompact always false — mobile companion is a separate PWA */}

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
            {/* Block terminal rendering until version is verified AND either:
                  (a) session loaded successfully — tabs get their saved currentDirectory, or
                  (b) session load failed — render anyway with default state (currentDirectory=null).
                  Blocking on failure would permanently freeze the UI if the backend is
                  temporarily unavailable. We keep sessionLoaded=false on failure so the
                  save guard prevents overwriting a good session with default-only tabs. */}
            {(!versionReady || (!sessionLoaded && !sessionLoadFailed)) ? (
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
                      onError={(msg) => addToast(msg, 'error', 6000)}
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
                    tabName={tab.title}
                    currentDirectory={tab.currentDirectory || null}
                    onToast={addToast}
                    onSpawnFailed={handleSpawnFailed}
                    onWaitingChange={(isWaiting) => handleWaitingChange(tab.id, isWaiting)}
                    onDirectoryChange={(folderName, fullPath) => handleDirectoryChange(tab.id, folderName, fullPath)}
                    onSddGate={tab.id === activeTabId ? sddGate.handleWsMessage : undefined}
                    onCopy={() => addToast('✓ Copied to clipboard', 'success', 1500)}
                    onFileOpen={handleFileOpen}
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
          {/* US2: side drawer — no backdrop, terminal remains scrollable and interactive */}
          <PhaseDecisionCard
            isOpen={sddGate.isCardOpen}
            phase={sddGate.card?.phase}
            summary={sddGate.card?.summary}
            actions={sddGate.card?.actions}
            onAction={(action, clarifyText) => sddGate.submitDecision(action, clarifyText)}
            onDismiss={sddGate.dismiss}
            decisionError={sddGate.decisionError}
            isSubmitting={sddGate.isSubmitting}
            artifactPreview={sddGate.card?.artifactPreview ?? null}
            phases={sddGate.phaseStatuses}
          />
        </div>
        {/* US1: persistent phase status panel. Always visible so the idle indicator (FR-010)
             shows when no feature is bound; the component handles the empty-phases state. */}
        <SddPipelinePanel
          phases={sddGate.phaseStatuses}
          isVisible={true}
          isCardOpen={sddGate.isCardOpen}
        />
      </div>
      {showEditor && editorFile && (
        <div className="editor-panel">
          {isImageFile(editorFile.name) ? (
            <ImageViewer
              file={editorFile}
              onClose={handleEditorClose}
              rootPath={editorFile?.rootPath || activeTab?.currentDirectory || '.'}
            />
          ) : editorMode === 'agentic' ? (
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
              onError={(msg) => addToast(msg, 'error', 6000)}
              theme={activeTab?.mode || theme}
              rootPath={editorFile?.rootPath || activeTab?.currentDirectory || '.'}
              terminalRef={getActiveTerminalRef()}
            />
          )}
        </div>
      )}
      {!isCompact && sidebarPosition === 'right' && (<><div className="sidebar-resizer" onMouseDown={startDrag} />{sidebar}</>)}

      {/* Mobile companion lives in forge-companion/ — no in-app mobile layout. */}

      <CommandModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingCommand(null)
        }}
        onSave={handleSaveCommand}
        initialData={editingCommand}
        commands={commands}
        preferredCliTool={preferredCliTool}
      />

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />

      <DeveloperDashboard
        isOpen={isDeveloperDashboardOpen}
        onClose={() => setIsDeveloperDashboardOpen(false)}
        devMode={devMode}
        tabCount={tabs.length}
        projectDir={activeTab?.currentDirectory || ''}
      />

      {/* RemoteAccessModal removed — companion access will live in Settings > Companion Access card (future). */}

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
      
      {/* History Slider (Time Travel) — HIDDEN for subscription release (feature not yet vetted) */}
      {/* {activeTabId && (
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
            setIsHistorySliderOpen(false);
            addToast(`Terminal state from ${timestamp.toLocaleTimeString()} available in history`, 'info', 4000);
          }}
          position="bottom"
        />
      )} */}

      {/* Forge Assist - desktop only; not rendered on mobile/tablet */}
      {/* v3.9.0: Enhanced with Task Mode + SLM Integration */}
      {!isCompact && <ForgeAssist
        isOpen={isForgeAssistOpen}
        onClose={() => {
          setIsForgeAssistOpen(false);
        }}
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
      />}

      {/* Code Tutor Panel — HIDDEN for subscription release (feature not yet vetted) */}

      {/* Forge Vault Panel — AES-256-GCM encrypted secret store (v5.3.0) */}
      {!isCompact && <VaultPanel
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        onToast={addToast}
      />}

      {/* Connection Diagnostic Wizard — shown on first run and on PTY spawn failure */}
      <ConnectionDiagnosticWizard
        isVisible={isWizardVisible}
        triggerReason={wizardTriggerReason}
        onClose={closeWizard}
        onOpenNewTerminal={handleWizardOpenTerminal}
      />

      {/* Feature tour overlay — shown when restartTour() is called from Settings,
          or on first run if TOUR_STEPS has content for a new version. Only renders
          when the tour is active and there are steps to show. */}
      {isTourActive && TOUR_STEPS.length > 0 && (
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
