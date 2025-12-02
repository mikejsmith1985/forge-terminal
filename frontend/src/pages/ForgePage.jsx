import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Row, Col, Card, Button, Modal, Form, Badge, Toast, ToastContainer, Collapse, Nav, Tab, Alert } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import ForgeTerminal from '../components/ForgeTerminal';
import ForgeFileTree from '../components/ForgeFileTree';
import ForgeEditor from '../components/ForgeEditor';
import AddLLMConfigModal from '../components/AddLLMConfigModal';
import { ProjectCreateModal } from '../components/shared';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../utils/api';
import { logInfo, setProjectContext, clearProjectContext, setService } from '../utils/logger';
import AppLayout from '../components/shared/AppLayout';
import { useForgeSettings } from '../hooks/useForgeSettings';

// Storage key for command cards
const STORAGE_KEY = 'devsmith_forge_commands';

// Maximum lines in debug output buffer
const MAX_DEBUG_LINES = 10000;

/**
 * CircularBuffer - Fixed-size buffer that overwrites oldest entries when full
 * Used for debug output to prevent memory issues with unlimited terminal output
 */
class CircularBuffer {
  constructor(maxSize = MAX_DEBUG_LINES) {
    this.maxSize = maxSize;
    this.buffer = [];
  }
  
  push(item) {
    this.buffer.push(item);
    // Remove oldest entries if over limit
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }
  
  getAll() {
    return [...this.buffer];
  }
  
  clear() {
    this.buffer = [];
  }
  
  get length() {
    return this.buffer.length;
  }
}

// Version key for cache invalidation - increment when DEFAULT_CARDS change
const CARDS_VERSION = 'v4';
const VERSION_KEY = 'devsmith_forge_cards_version';

// Maximum cards before warning
const MAX_CARDS_WARNING = 10;

// Default command cards - 3 cards for cleaner UI
const DEFAULT_CARDS = [
  { 
    id: 0, 
    keyBinding: 'Ctrl+Shift+0', 
    command: `You are an elite full-stack engineer with 20+ years of production experience.
You are working in a real codebase with tests, Docker, CI — use agentic execution for commands.

RULES (NO EXCEPTIONS):
1. NEVER ask for confirmation or clarification.
2. NEVER use placeholders or truncate code.
3. NEVER invent files unless declared in Phase 1 with path + justification (e.g., "Create src/new-feature/NewThing.tsx because...").
4. NEVER hard-code secrets, ports, or paths.
5. ALWAYS write complete, runnable code.
6. In Phase 1: Write implementation. In Phase 2: Write failing tests first (RED → GREEN → REFACTOR), then iterate until 100% pass.
7. For tests: Emit Playwright/Percy code + commands for agent execution; loop until user confirms green.
8. For Docker: Emit "docker-compose down -v && bash scripts/nuclear-complete-rebuild-enhanced.sh" for agent execution; never assume it ran.
9. ALWAYS evaluate architecture in Phase 1 — call out anti-patterns and suggest fixes.
10. ALWAYS address 100% of the request — no partial answers.

Two phases only:
PHASE 1 → Detailed plan + complete code (implementation first, tests in Phase 2)
PHASE 2 → Test-first fix loop until shippable (agent executes commands, loop on failures)

Branch and status injected — respect them.
Begin PHASE 1 now.

`, 
    description: '📝 Prompt Prepend', 
    context: 'Pastes the PromptDr prompt prefix to terminal. Continue typing your request after.',
    pasteOnly: true,
    favorite: true,
    order: 0,
  },
  { 
    id: 1, 
    keyBinding: 'Ctrl+Shift+1', 
    command: 'claude', 
    description: '🤖 Run Claude CLI', 
    context: 'Starts Claude Code CLI interactive session. Uses OAuth authentication - follow the browser link to log in when prompted.',
    pasteOnly: false,
    favorite: false,
    order: 1,
  },
  { 
    id: 2, 
    keyBinding: 'Ctrl+Shift+2', 
    command: 'copilot', 
    description: '🚀 Run Copilot CLI', 
    context: 'Starts modern Copilot CLI with chat UI. Requires Node.js 22+. First time: use /login to authenticate with GitHub.',
    pasteOnly: false,
    favorite: false,
    order: 2,
  },
];

/**
 * Parse a key binding string like "Ctrl+Shift+B" into a normalized object
 * for matching against keyboard events
 */
function parseKeyBinding(binding) {
  if (!binding) return null;
  
  const parts = binding.toLowerCase().split('+').map(p => p.trim());
  const result = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    key: '',
  };
  
  for (const part of parts) {
    switch (part) {
      case 'ctrl':
      case 'control':
        result.ctrl = true;
        break;
      case 'alt':
      case 'option':
        result.alt = true;
        break;
      case 'shift':
        result.shift = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
      case 'win':
      case 'windows':
        result.meta = true;
        break;
      default:
        // Handle function keys
        if (part.match(/^f\d+$/)) {
          result.key = part.toUpperCase();
        } else {
          result.key = part;
        }
    }
  }
  
  return result.key ? result : null;
}

/**
 * Check if a keyboard event matches a parsed binding
 */
function matchesBinding(event, binding) {
  if (!binding) return false;
  
  const eventKey = event.key.toLowerCase();
  const bindingKey = binding.key.toLowerCase();
  
  // When Shift is pressed, number keys produce symbols: 1=!, 2=@, 3=#, etc.
  // We need to check event.code for number keys to get the actual key pressed
  const shiftNumberMap = {
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
    '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  };
  
  // Get the actual key (accounting for Shift+number producing symbols)
  let actualEventKey = eventKey;
  if (event.shiftKey && shiftNumberMap[eventKey]) {
    actualEventKey = shiftNumberMap[eventKey];
  }
  // Also check event.code for digit keys (e.g., "Digit1" -> "1")
  if (event.code && event.code.startsWith('Digit')) {
    actualEventKey = event.code.replace('Digit', '').toLowerCase();
  }
  
  // Handle function keys
  if (bindingKey.startsWith('f') && bindingKey.match(/^f\d+$/)) {
    if (eventKey !== bindingKey) return false;
  } else {
    // Handle regular keys - check both eventKey and actualEventKey
    if (eventKey !== bindingKey && actualEventKey !== bindingKey) return false;
  }
  
  return (
    event.ctrlKey === binding.ctrl &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift &&
    event.metaKey === binding.meta
  );
}

/**
 * Forge Page
 * 
 * Full PTY terminal for Claude Code CLI and development work.
 * Features configurable command cards with keyboard shortcuts for quick execution.
 * 
 * Tabbed interface with:
 * - Terminal: Full PTY terminal with command cards
 * - File Explorer: Browse and edit workspace files
 * - AI Chat: Integrated AI assistant (coming soon)
 */
export default function ForgePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  
  // Forge settings hook - persists to localStorage
  const { 
    showImagePasteToast, 
    setShowImagePasteToast,
    lastProjectId,
    setLastProjectId,
    termTapUrl: persistedTermTapUrl,
    setTermTapUrl: setPersistedTermTapUrl,
    quickLaunchUrls,
    addQuickLaunchUrl,
    removeQuickLaunchUrl,
    resetQuickLaunchUrls,
    termTapAutoOpen,
    setTermTapAutoOpen,
  } = useForgeSettings();
  
  // Image paste toast state
  const [imagePasteToast, setImagePasteToast] = useState({ show: false, message: '', success: true });
  
  const terminalRef = useRef(null);
  
  const [cards, setCards] = useState(DEFAULT_CARDS);
  const [showModal, setShowModal] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [formData, setFormData] = useState({
    keyBinding: '',
    command: '',
    description: '',
    context: '',
    pasteOnly: false,
  });
  const [cardsExpanded, setCardsExpanded] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', variant: 'success' });
  
  // Tabbed interface state
  const [activeTab, setActiveTab] = useState('terminal');
  const [selectedFile, setSelectedFile] = useState(null);
  const [openFiles, setOpenFiles] = useState([]);
  const [untitledCounter, setUntitledCounter] = useState(1);
  
  // Workspace path state - load from localStorage
  const [workspacePath, setWorkspacePath] = useState(() => {
    return localStorage.getItem('devsmith_workspace_path') || '';
  });
  
  // Project selection state
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  
  // Project restoration banner state
  const [projectRestorationBanner, setProjectRestorationBanner] = useState({
    show: false,
    type: 'info', // 'info' for success, 'warning' for project deleted
    message: '',
  });
  
  // Folder picker state - API uses '/' as root (maps to /workspace inside container)
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderPickerPath, setFolderPickerPath] = useState('/');
  const [folderPickerItems, setFolderPickerItems] = useState([]);
  const [folderPickerLoading, setFolderPickerLoading] = useState(false);

  // LLM Config state for Forge app
  const [hasForgeConfig, setHasForgeConfig] = useState(null); // null = loading, true/false = checked
  const [showLLMModal, setShowLLMModal] = useState(false);
  const [forgeConfig, setForgeConfig] = useState(null);

  // URL detection and debug state
  const [detectedUrl, setDetectedUrl] = useState(null);
  // termTapUrl initialized from persisted value (useForgeSettings hook)
  const [termTapUrl, setTermTapUrlLocal] = useState(persistedTermTapUrl || '');
  const lastSwitchedUrlRef = useRef(null); // Track last URL we auto-switched tabs for
  
  // Quick Launch URL form state
  const [newQuickLaunchLabel, setNewQuickLaunchLabel] = useState('');
  const [newQuickLaunchUrl, setNewQuickLaunchUrl] = useState('');
  
  // Wrapper that updates both local state and localStorage
  const setTermTapUrl = useCallback((url) => {
    setTermTapUrlLocal(url);
    setPersistedTermTapUrl(url);
  }, [setPersistedTermTapUrl]);
  
  // Tab attention state - unified system for terminal and termtap tabs
  // needsAttention: has unread content, isPulsing: currently animating
  const [tabAttention, setTabAttention] = useState({
    terminal: { needsAttention: false, isPulsing: false },
    termtap: { needsAttention: false, isPulsing: false },
  });
  
  // Scroll preference state (persisted to localStorage)
  const [scrollBehavior, setScrollBehavior] = useState(() => {
    return localStorage.getItem('forge.scrollBehavior') || 'auto';
  });
  
  // Debug output buffer - using ref for CircularBuffer to avoid re-renders on every line
  const debugBufferRef = useRef(new CircularBuffer(MAX_DEBUG_LINES));
  const [debugLines, setDebugLines] = useState([]);
  const debugContainerRef = useRef(null);
  const [autoScrollDebug, setAutoScrollDebug] = useState(true);

  // Handle terminal data for URL detection and debug output
  const handleTerminalData = useCallback((text, timestamp) => {
    // Split text into lines and add to buffer with timestamps
    const lines = text.split('\n').filter(line => line.trim());
    const ts = timestamp || Date.now();
    
    lines.forEach(line => {
      debugBufferRef.current.push({
        id: ts + Math.random(),
        text: line,
        timestamp: ts,
      });
    });
    
    // Update state to trigger re-render
    setDebugLines(debugBufferRef.current.getAll());
    
    // Check for OAuth/authentication URLs
    const urlPatterns = [
      /https:\/\/console\.anthropic\.com\/oauth[^\s"')]+/g,
      /https:\/\/[^\s"')]*claude[^\s"')]+/g,
      /https:\/\/github\.com\/login\/oauth[^\s"')]+/g,
      /https:\/\/[^\s"')]*\/oauth\/authorize[^\s"')]+/g,
    ];
    
    for (const pattern of urlPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const url = matches[0];
        console.log('[ForgePage] Detected OAuth URL:', url);
        setDetectedUrl(url);
        setTermTapUrl(url);
        
        // Handle based on user preference
        if (termTapAutoOpen === true) {
          // Auto-open in new tab
          window.open(url, '_blank');
          setToast({
            show: true,
            message: 'URL opened in new tab',
            variant: 'info',
          });
        } else {
          // Highlight TermTap tab for user to click (or prompt if null)
          triggerTabAttention('termtap');
          if (termTapAutoOpen === null) {
            // First time - switch to TermTap tab to show preference prompt
            setActiveTab('termtap');
          }
        }
        break;
      }
    }
  }, [termTapAutoOpen, setTermTapUrl]);
  
  // Handle terminal unread output - triggers terminal tab attention when not visible
  const handleTerminalUnreadOutput = useCallback((hasUnread) => {
    if (hasUnread && activeTab !== 'terminal') {
      triggerTabAttention('terminal');
    }
  }, [activeTab]);
  
  // Trigger tab attention: pulse for 5 seconds, then stay lit until clicked
  const triggerTabAttention = useCallback((tabName) => {
    setTabAttention(prev => ({
      ...prev,
      [tabName]: { needsAttention: true, isPulsing: true }
    }));
    
    // After 5 seconds, stop pulsing but keep attention state (lit)
    setTimeout(() => {
      setTabAttention(prev => ({
        ...prev,
        [tabName]: { ...prev[tabName], isPulsing: false }
      }));
    }, 5000);
  }, []);
  
  // Clear tab attention when tab is clicked
  const handleTabClick = useCallback((tabName) => {
    setActiveTab(tabName);
    // Clear attention state for clicked tab
    setTabAttention(prev => ({
      ...prev,
      [tabName]: { needsAttention: false, isPulsing: false }
    }));
    // Clear unread state in terminal if switching to terminal
    if (tabName === 'terminal' && terminalRef.current?.scrollToBottom) {
      // Optional: auto-scroll to bottom when switching to terminal tab
      // terminalRef.current.scrollToBottom();
    }
  }, []);
  
  // Handle scroll to bottom button click
  const handleScrollToBottom = useCallback(() => {
    if (terminalRef.current?.scrollToBottom) {
      terminalRef.current.scrollToBottom();
    }
  }, []);
  
  // Handle scroll behavior preference change
  const handleScrollBehaviorChange = useCallback((value) => {
    setScrollBehavior(value);
    localStorage.setItem('forge.scrollBehavior', value);
  }, []);
  
  // Handle image paste result from terminal - show toast if enabled
  const handleImagePaste = useCallback((result) => {
    if (showImagePasteToast) {
      if (result.success) {
        setImagePasteToast({
          show: true,
          message: `Image uploaded: ${result.path}`,
          success: true,
        });
      } else {
        setImagePasteToast({
          show: true,
          message: `Image upload failed: ${result.error || 'Unknown error'}`,
          success: false,
        });
      }
    }
  }, [showImagePasteToast]);
  
  // Handle clearing uploaded images
  const handleClearUploads = useCallback(async () => {
    try {
      const response = await fetch('/api/forge/uploads', {
        method: 'DELETE',
      });
      const result = await response.json();
      
      if (result.success) {
        setToast({
          show: true,
          message: `Cleared ${result.files_deleted || 0} uploaded images`,
          variant: 'success',
        });
      } else {
        setToast({
          show: true,
          message: `Failed to clear uploads: ${result.error || 'Unknown error'}`,
          variant: 'danger',
        });
      }
    } catch (error) {
      console.error('[ForgePage] Clear uploads error:', error);
      setToast({
        show: true,
        message: `Failed to clear uploads: ${error.message}`,
        variant: 'danger',
      });
    }
  }, []);
  
  // Open URL in new browser tab
  const openUrlInNewTab = useCallback((url) => {
    if (!url) return;
    // Normalize URL - add protocol if missing
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      if (normalizedUrl.includes('.') || normalizedUrl.startsWith('localhost')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
    }
    setTermTapUrl(normalizedUrl);
    window.open(normalizedUrl, '_blank');
  }, [setTermTapUrl]);
  
  // Add new quick launch URL
  const handleAddQuickLaunch = useCallback(() => {
    if (newQuickLaunchLabel.trim() && newQuickLaunchUrl.trim()) {
      addQuickLaunchUrl(newQuickLaunchLabel.trim(), newQuickLaunchUrl.trim());
      setNewQuickLaunchLabel('');
      setNewQuickLaunchUrl('');
      setToast({
        show: true,
        message: `Added quick launch button: ${newQuickLaunchLabel.trim()}`,
        variant: 'success',
      });
    }
  }, [newQuickLaunchLabel, newQuickLaunchUrl, addQuickLaunchUrl]);
  
  // Handle URL detection from terminal - only auto-switch to termtap once per unique URL
  const handleUrlDetected = useCallback((url) => {
    // Only switch tabs if this is a NEW URL we haven't switched for yet
    if (url && url !== lastSwitchedUrlRef.current) {
      console.log('[ForgePage] New OAuth URL detected:', url);
      lastSwitchedUrlRef.current = url;
      setDetectedUrl(url);
      setTermTapUrl(url);
      
      // Handle based on user preference
      if (termTapAutoOpen === true) {
        window.open(url, '_blank');
      } else {
        triggerTabAttention('termtap');
        if (termTapAutoOpen === null) {
          setActiveTab('termtap');
        }
      }
    }
    // If same URL detected again, ignore (allows user to switch back to terminal)
  }, [triggerTabAttention, termTapAutoOpen, setTermTapUrl]);
  
  // Clear debug output
  const clearDebugOutput = useCallback(() => {
    debugBufferRef.current.clear();
    setDebugLines([]);
  }, []);
  
  // Auto-scroll debug output
  useEffect(() => {
    if (autoScrollDebug && debugContainerRef.current) {
      debugContainerRef.current.scrollTop = debugContainerRef.current.scrollHeight;
    }
  }, [debugLines, autoScrollDebug]);

  // Generate unique ID for new cards
  const generateId = useCallback(() => {
    return Date.now() + Math.random().toString(36).substr(2, 9);
  }, []);

  // Load cards from localStorage on mount (with version check for cache invalidation)
  useEffect(() => {
    const savedVersion = localStorage.getItem(VERSION_KEY);
    
    // If version mismatch, reset to defaults (silent reset)
    if (savedVersion !== CARDS_VERSION) {
      console.log('[ForgePage] Cards version mismatch, resetting to defaults');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CARDS));
      localStorage.setItem(VERSION_KEY, CARDS_VERSION);
      setCards(DEFAULT_CARDS);
      return;
    }
    
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Ensure all cards have required fields
          const validCards = parsed.map((card, index) => ({
            id: card.id || generateId(),
            keyBinding: card.keyBinding || '',
            command: card.command || '',
            description: card.description || '',
            context: card.context || '',
            pasteOnly: card.pasteOnly || false,
            favorite: card.favorite || false,
            order: typeof card.order === 'number' ? card.order : index,
          }));
          // Sort by favorite first, then by order
          validCards.sort((a, b) => {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return a.order - b.order;
          });
          setCards(validCards);
        }
      } catch (e) {
        console.error('[BuildPage] Failed to parse saved cards:', e);
      }
    }
  }, [generateId]);

  // Set service name for logging (used in log metadata)
  useEffect(() => {
    setService('forge');
  }, []);

  // Check if Forge has LLM configuration on mount
  useEffect(() => {
    const checkForgeConfig = async () => {
      try {
        const response = await apiRequest('/api/portal/app-llm-preferences');
        if (response && response.forge) {
          setHasForgeConfig(true);
          setForgeConfig(response.forge);
        } else {
          setHasForgeConfig(false);
          setForgeConfig(null);
        }
      } catch (error) {
        console.error('[ForgePage] Failed to check LLM config:', error);
        setHasForgeConfig(false);
        setForgeConfig(null);
      }
    };
    
    if (user) {
      checkForgeConfig();
    }
  }, [user]);

  // Fetch projects and handle project selection on mount
  useEffect(() => {
    const fetchProjectsAndInitialize = async () => {
      try {
        setProjectsLoading(true);
        const response = await apiRequest('/api/logs/projects');
        const projectList = response?.projects || [];
        setProjects(projectList);
        
        // Check if there's a saved project to restore
        if (lastProjectId !== null) {
          const savedProject = projectList.find(p => p.id === lastProjectId);
          
          if (savedProject) {
            // Project found - restore it
            console.log('[ForgePage] Restoring project:', savedProject.name);
            setSelectedProject(savedProject);
            setProjectContext({ 
              id: savedProject.id, 
              name: savedProject.name, 
              slug: savedProject.slug 
            });
            
            // Restore workspace path
            if (savedProject.workspace_path) {
              setWorkspacePath(savedProject.workspace_path);
              localStorage.setItem('devsmith_workspace_path', savedProject.workspace_path);
            }
            
            // Show info banner
            setProjectRestorationBanner({
              show: true,
              type: 'info',
              message: `Restored project: ${savedProject.name}`,
            });
          } else {
            // Project was deleted - show warning, fallback to Forge Sessions
            console.warn('[ForgePage] Saved project not found, falling back to Forge Sessions');
            setSelectedProject(null);
            setWorkspacePath('');
            setLastProjectId(null); // Clear the invalid saved ID
            setProjectContext({ id: null, name: 'Forge Sessions', slug: 'forge-sessions' });
            
            // Show warning banner
            setProjectRestorationBanner({
              show: true,
              type: 'warning',
              message: 'Previously selected project no longer exists. Switched to Forge Sessions.',
            });
          }
        } else {
          // No saved project - default to Forge Sessions
          setSelectedProject(null);
          setWorkspacePath('');
          setProjectContext({ id: null, name: 'Forge Sessions', slug: 'forge-sessions' });
        }
      } catch (error) {
        console.error('[ForgePage] Failed to fetch projects:', error);
        // On error, use Forge Sessions context as fallback
        setProjectContext({ id: null, name: 'Forge Sessions', slug: 'forge-sessions' });
      } finally {
        setProjectsLoading(false);
      }
    };
    
    fetchProjectsAndInitialize();
    logInfo('Forge page opened', { component: 'ForgePage' });
    
    return () => {
      // Clear forge-specific context on unmount, revert to default
      clearProjectContext();
    };
  }, [lastProjectId, setLastProjectId]);

  // Show toast notification (must be defined before handlers that use it)
  const showToast = useCallback((message, variant = 'success') => {
    setToast({ show: true, message, variant });
  }, []);

  // ============ Project Selection Handlers ============
  
  // Handle project dropdown change - unified handler for project selection
  const handleProjectDropdownChange = useCallback((e) => {
    const value = e.target.value;
    
    if (value === 'create-new') {
      // Open create project modal
      setShowCreateProjectModal(true);
    } else if (value === 'forge-sessions' || value === '') {
      // Switch to Forge Sessions (untracked)
      setSelectedProject(null);
      setWorkspacePath('');
      setLastProjectId(null); // Clear persisted project
      localStorage.removeItem('devsmith_workspace_path');
      setProjectContext({ id: null, name: 'Forge Sessions', slug: 'forge-sessions' });
      showToast('Switched to Forge Sessions (untracked mode)', 'info');
    } else {
      // Select a specific project
      const project = projects.find(p => String(p.id) === value);
      if (project) {
        setSelectedProject(project);
        setLastProjectId(project.id); // Persist project selection
        setProjectContext({ 
          id: project.id, 
          name: project.name, 
          slug: project.slug 
        });
        // Set workspace path from project
        if (project.workspace_path) {
          setWorkspacePath(project.workspace_path);
          localStorage.setItem('devsmith_workspace_path', project.workspace_path);
        } else {
          setWorkspacePath('');
          localStorage.removeItem('devsmith_workspace_path');
        }
        showToast(`Switched to project: ${project.name}`, 'success');
      }
    }
  }, [projects, showToast, setLastProjectId]);

  // Handle project created from ProjectCreateModal
  const handleProjectCreated = useCallback((newProject) => {
    setShowCreateProjectModal(false);
    // Add to local projects list
    setProjects(prev => [...prev, newProject]);
    // Auto-select the new project
    setSelectedProject(newProject);
    setLastProjectId(newProject.id); // Persist project selection
    setProjectContext({ 
      id: newProject.id, 
      name: newProject.name, 
      slug: newProject.slug 
    });
    // Set workspace path if provided
    if (newProject.workspace_path) {
      setWorkspacePath(newProject.workspace_path);
      localStorage.setItem('devsmith_workspace_path', newProject.workspace_path);
    }
    showToast(`Created and selected project: ${newProject.name}`, 'success');
  }, [showToast, setLastProjectId]);

  // ============ End Project Selection Handlers ============

  // Export debug output to Health Logs service
  const exportToHealthLogs = useCallback(() => {
    if (debugLines.length === 0) {
      showToast('No terminal output to export', 'warning');
      return;
    }
    
    // Warn user if exporting large amounts of data
    if (debugLines.length > 5000) {
      showToast(`Warning: Exporting ${debugLines.length} lines - this may be a large payload`, 'warning');
    }
    
    // Concatenate all debug lines into a single message
    const outputText = debugLines.map(line => 
      `[${new Date(line.timestamp).toLocaleTimeString()}] ${line.text}`
    ).join('\n');
    
    // Create metadata with export context
    const metadata = {
      source: 'forge_terminal',
      line_count: debugLines.length,
      export_timestamp: new Date().toISOString(),
      first_line_timestamp: debugLines[0]?.timestamp ? new Date(debugLines[0].timestamp).toISOString() : null,
      last_line_timestamp: debugLines[debugLines.length - 1]?.timestamp ? new Date(debugLines[debugLines.length - 1].timestamp).toISOString() : null,
    };
    
    // Send to Health Logs via logInfo
    logInfo(`Forge Terminal Debug Export (${debugLines.length} lines)`, {
      ...metadata,
      terminal_output: outputText,
    });
    
    showToast(`Exported ${debugLines.length} lines to Health Logs`, 'success');
  }, [debugLines, showToast]);

  // Handler for when LLM config is saved
  const handleLLMConfigSaved = useCallback(async () => {
    setShowLLMModal(false);
    showToast('AI model configured for Forge!', 'success');
    // Re-fetch config to update state
    try {
      const response = await apiRequest('/api/portal/app-llm-preferences');
      if (response && response.forge) {
        setHasForgeConfig(true);
        setForgeConfig(response.forge);
      }
    } catch (error) {
      console.error('[ForgePage] Failed to refresh config:', error);
    }
  }, [showToast]);

  // Save cards to localStorage
  const saveCards = useCallback((newCards) => {
    setCards(newCards);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newCards));
  }, []);

  // Execute or paste a command in the terminal
  const executeCommand = useCallback((command, description, pasteOnly = false) => {
    if (!command) {
      showToast('No command configured for this card', 'warning');
      return;
    }
    
    if (pasteOnly) {
      // Paste-only mode: send without Enter key
      if (terminalRef.current && terminalRef.current.pasteCommand) {
        const success = terminalRef.current.pasteCommand(command);
        if (success) {
          showToast(`Pasted: ${description || 'prompt'}`, 'info');
          terminalRef.current.focus();
        } else {
          showToast('Terminal not connected', 'danger');
        }
      } else {
        showToast('Terminal not ready', 'warning');
      }
    } else {
      // Execute mode: send with Enter key
      if (terminalRef.current && terminalRef.current.sendCommand) {
        const success = terminalRef.current.sendCommand(command);
        if (success) {
          showToast(`Executed: ${description || command}`, 'success');
          terminalRef.current.focus();
        } else {
          showToast('Terminal not connected', 'danger');
        }
      } else {
        showToast('Terminal not ready', 'warning');
      }
    }
  }, [showToast]);

  // Copy command to clipboard
  const copyCommand = useCallback(async (command, description) => {
    if (!command) {
      showToast('No command to copy', 'warning');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(command);
      showToast(`Copied: ${description || 'command'}`, 'info');
    } catch (error) {
      console.error('[ForgePage] Failed to copy:', error);
      showToast('Failed to copy to clipboard', 'danger');
    }
  }, [showToast]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl+End - Scroll terminal to bottom
      if (event.ctrlKey && event.key === 'End') {
        event.preventDefault();
        handleScrollToBottom();
        return;
      }
      
      // Check each card's key binding
      for (const card of cards) {
        const binding = parseKeyBinding(card.keyBinding);
        if (binding && matchesBinding(event, binding)) {
          event.preventDefault();
          executeCommand(card.command, card.description, card.pasteOnly);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cards, executeCommand, handleScrollToBottom]);

  // Card management functions
  const handleAddCard = () => {
    setEditingCard(null);
    // Auto-populate keybinding for cards 0-10, empty for 11+
    const nextKeyBinding = cards.length <= 10 ? `Ctrl+Shift+${cards.length}` : '';
    setFormData({
      keyBinding: nextKeyBinding,
      command: '',
      description: '',
      context: '',
      pasteOnly: false,
    });
    setShowModal(true);
  };

  const handleEditCard = (card) => {
    setEditingCard(card);
    setFormData({
      keyBinding: card.keyBinding,
      command: card.command,
      description: card.description,
      context: card.context || '',
      pasteOnly: card.pasteOnly || false,
    });
    setShowModal(true);
  };

  const handleDeleteCard = (cardId) => {
    const newCards = cards.filter(c => c.id !== cardId);
    saveCards(newCards);
    showToast('Card deleted', 'success');
  };

  const handleToggleFavorite = (cardId) => {
    const newCards = cards.map(c => 
      c.id === cardId ? { ...c, favorite: !c.favorite } : c
    );
    // Re-sort with favorites first
    newCards.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return a.order - b.order;
    });
    saveCards(newCards);
  };

  const handleSaveCard = () => {
    if (!formData.keyBinding || !formData.command) {
      showToast('Key binding and command are required', 'danger');
      return;
    }

    let newCards;
    if (editingCard) {
      newCards = cards.map(c => 
        c.id === editingCard.id 
          ? { ...c, ...formData }
          : c
      );
    } else {
      const newCard = {
        id: generateId(),
        ...formData,
        favorite: false,
        order: cards.length,
      };
      newCards = [...cards, newCard];
    }
    
    saveCards(newCards);
    setShowModal(false);
    showToast(editingCard ? 'Card updated' : 'Card added', 'success');
  };

  const handleResetCards = () => {
    setShowResetConfirm(true);
  };

  const confirmResetCards = () => {
    saveCards(DEFAULT_CARDS);
    setShowResetConfirm(false);
    showToast('Cards reset to defaults', 'success');
  };

  // File selection handler
  const handleFileSelect = (file) => {
    setSelectedFile(file);
    if (file && !openFiles.find(f => f.path === file.path)) {
      setOpenFiles([...openFiles, file]);
    }
    setActiveTab('editor');
  };

  // Create a new untitled file
  const createUntitledFile = useCallback(() => {
    const fileName = untitledCounter === 1 ? 'untitled.md' : `untitled-${untitledCounter}.md`;
    const newFile = {
      name: fileName,
      path: `untitled://${fileName}`,
      content: '',
      isUntitled: true,
    };
    setUntitledCounter(prev => prev + 1);
    setOpenFiles(prev => [...prev, newFile]);
    setSelectedFile(newFile);
    return newFile;
  }, [untitledCounter]);

  // Handle Editor tab click - create untitled file if no file is open
  const handleEditorTabClick = useCallback(() => {
    if (!selectedFile && openFiles.length === 0) {
      createUntitledFile();
    }
    setActiveTab('editor');
  }, [selectedFile, openFiles.length, createUntitledFile]);

  // Handle file rename (from editor)
  const handleFileRename = useCallback((oldFile, newName) => {
    const updatedFile = { ...oldFile, name: newName };
    // If it's an untitled file, update the path too
    if (oldFile.isUntitled) {
      updatedFile.path = `untitled://${newName}`;
    }
    setOpenFiles(prev => prev.map(f => f.path === oldFile.path ? updatedFile : f));
    if (selectedFile?.path === oldFile.path) {
      setSelectedFile(updatedFile);
    }
  }, [selectedFile]);

  // Handle workspace path change from config modal
  const handleWorkspacePathChange = (newPath) => {
    setWorkspacePath(newPath);
    localStorage.setItem('devsmith_workspace_path', newPath);
  };

  // Folder picker functions
  const fetchFolderContents = async (path) => {
    console.log('[FolderPicker] fetchFolderContents called with path:', path);
    setFolderPickerLoading(true);
    try {
      const url = `/api/forge/files?path=${encodeURIComponent(path)}`;
      console.log('[FolderPicker] Fetching URL:', url);
      const response = await fetch(url);
      console.log('[FolderPicker] Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('[FolderPicker] Response data:', data);
        // Filter to only show directories - API returns 'entries' with 'is_dir' field
        const folders = (data.entries || data.files || []).filter(f => f.is_dir || f.isDirectory);
        console.log('[FolderPicker] Filtered folders:', folders);
        setFolderPickerItems(folders);
        setFolderPickerPath(path);
      } else {
        console.error('[FolderPicker] Failed to fetch folder contents, status:', response.status);
        setFolderPickerItems([]);
      }
    } catch (error) {
      console.error('[FolderPicker] Error fetching folder contents:', error);
      setFolderPickerItems([]);
    } finally {
      setFolderPickerLoading(false);
    }
  };

  const openFolderPicker = () => {
    console.log('[FolderPicker] openFolderPicker called');
    setShowFolderPicker(true);
    // Always start from root - API uses '/' as root of the mounted workspace
    setFolderPickerPath('/');
    fetchFolderContents('/');
  };

  const handleFolderNavigate = (folderPath) => {
    fetchFolderContents(folderPath);
  };

  const handleFolderGoUp = () => {
    const parentPath = folderPickerPath.split('/').slice(0, -1).join('/') || '/';
    fetchFolderContents(parentPath);
  };

  const handleFolderSelect = () => {
    handleWorkspacePathChange(folderPickerPath);
    setShowFolderPicker(false);
  };

  return (
    <AppLayout
      appName="Forge"
      appIcon="hammer"
      isBeta={true}
    >
      {/* Toast notifications */}
      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 9999 }}>
        <Toast
          show={toast.show}
          onClose={() => setToast({ ...toast, show: false })}
          delay={3000}
          autohide
          bg={toast.variant}
        >
          <Toast.Body className={toast.variant === 'dark' ? 'text-white' : ''}>
            {toast.message}
          </Toast.Body>
        </Toast>
        
        {/* Image paste toast */}
        <Toast
          show={imagePasteToast.show}
          onClose={() => setImagePasteToast({ ...imagePasteToast, show: false })}
          delay={3000}
          autohide
          bg={imagePasteToast.success ? 'success' : 'danger'}
        >
          <Toast.Body className="text-white">
            <i className={`bi ${imagePasteToast.success ? 'bi-check-circle' : 'bi-exclamation-triangle'} me-2`}></i>
            {imagePasteToast.message}
          </Toast.Body>
        </Toast>
      </ToastContainer>

      {/* Project Restoration Banner */}
      {projectRestorationBanner.show && (
        <div className={`alert alert-${projectRestorationBanner.type === 'warning' ? 'warning' : 'info'} alert-dismissible fade show mb-3`} role="alert">
          <i className={`bi bi-${projectRestorationBanner.type === 'warning' ? 'exclamation-triangle' : 'info-circle'} me-2`}></i>
          {projectRestorationBanner.message}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setProjectRestorationBanner({ show: false, type: 'info', message: '' })}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Main Content Card */}
      <div className="frosted-card p-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="mb-0">
            <i className="bi bi-hammer text-primary me-2"></i>
            Forge Workspace
          </h2>
        </div>

        {/* Tab Navigation - matches Health app styling */}
        <ul className="nav nav-tabs mb-3">
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'terminal' ? 'forge-tab-active' : 'forge-tab-inactive'} ${tabAttention.terminal.isPulsing ? 'forge-tab-pulsing' : ''} ${tabAttention.terminal.needsAttention && !tabAttention.terminal.isPulsing ? 'forge-tab-attention' : ''}`}
              onClick={() => handleTabClick('terminal')}
            >
              <i className="bi bi-terminal me-2"></i>
              Terminal
              {tabAttention.terminal.needsAttention && <span className="badge bg-info ms-2">New</span>}
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'files' ? 'forge-tab-active' : 'forge-tab-inactive'}`}
              onClick={() => handleTabClick('files')}
            >
              <i className="bi bi-folder2-open me-2"></i>
              Files
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'editor' ? 'forge-tab-active' : 'forge-tab-inactive'}`}
              onClick={handleEditorTabClick}
            >
              <i className="bi bi-code-slash me-2"></i>
              Editor
              {selectedFile && <span className="ms-1 small">({selectedFile.name})</span>}
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'termtap' ? 'forge-tab-active' : 'forge-tab-inactive'} ${tabAttention.termtap.isPulsing ? 'forge-tab-pulsing' : ''} ${tabAttention.termtap.needsAttention && !tabAttention.termtap.isPulsing ? 'forge-tab-attention' : ''}`}
              onClick={() => handleTabClick('termtap')}
            >
              <i className="bi bi-terminal me-2"></i>
              TermTap
              {detectedUrl && <span className="badge bg-warning text-dark ms-2">URL</span>}
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'debug' ? 'forge-tab-active' : 'forge-tab-inactive'}`}
              onClick={() => handleTabClick('debug')}
            >
              <i className="bi bi-bug me-2"></i>
              Terminal Debug
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'settings' ? 'forge-tab-active' : 'forge-tab-inactive'}`}
              onClick={() => handleTabClick('settings')}
            >
              <i className="bi bi-gear me-2"></i>
              Settings
            </button>
          </li>
        </ul>

        {/* LLM Configuration Warning */}
        {!hasForgeConfig && (
          <div className="alert alert-warning d-flex align-items-center mb-3" role="alert">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            <div className="flex-grow-1">
              <strong>AI Model Not Configured:</strong> Configure your AI model in the{' '}
              <Link to="/llm-config" className="alert-link">AI Factory</Link>{' '}
              to enable AI-powered features in Forge.
            </div>
            <Link to="/llm-config" className="btn btn-warning btn-sm ms-3">
              Configure AI
            </Link>
          </div>
        )}

        {/* Tab Content */}
        <div className="forge-workspace">
          {/* Terminal Tab - ALWAYS RENDERED (hidden via CSS) to preserve WebSocket state */}
          {/* This fixes GH#125: Terminal state reset when switching to browser tab */}
          <div style={{ 
            height: '100%', 
            display: activeTab === 'terminal' ? 'flex' : 'none', 
            flexDirection: 'column' 
          }}>
              {/* Command Cards */}
              <div className="frosted-card mb-3 p-2" style={{ background: isDarkMode ? 'rgba(30, 33, 48, 0.6)' : 'rgba(240, 242, 247, 0.95)' }}>
                <div 
                  className="d-flex justify-content-between align-items-center px-2 py-1"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setCardsExpanded(!cardsExpanded)}
                >
                  <span className="small" style={{ color: isDarkMode ? '#e0e0e0' : '#333' }}>
                    <i className={`bi bi-chevron-${cardsExpanded ? 'down' : 'right'} me-1`}></i>
                    Command Cards ({cards.length})
                    {cards.length >= MAX_CARDS_WARNING && (
                      <Badge bg="warning" className="ms-2">Max {MAX_CARDS_WARNING}</Badge>
                    )}
                  </span>
                  <div className="d-flex gap-1">
                    <Button 
                      variant={isDarkMode ? 'outline-primary' : 'outline-primary'}
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleAddCard(); }}
                      title="Add Card"
                    >
                      <i className="bi bi-plus"></i>
                    </Button>
                    <Button 
                      variant={isDarkMode ? 'outline-secondary' : 'outline-secondary'}
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleResetCards(); }}
                      title="Reset to Defaults"
                    >
                      <i className="bi bi-arrow-counterclockwise"></i>
                    </Button>
                  </div>
                </div>
                <Collapse in={cardsExpanded}>
                  <div className="px-2 pb-2">
                    <div 
                      className="d-flex flex-wrap gap-2 mt-2" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '160px', 
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        paddingRight: '8px'
                      }}
                    >
                      {cards.map(card => (
                        <div 
                          key={card.id}
                          className={`command-card p-2 ${card.favorite ? 'favorite' : ''}`}
                          style={{ 
                            width: '195px', 
                            cursor: 'pointer',
                            border: card.favorite ? '2px solid #ffc107' : `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                            borderRadius: '8px',
                            background: isDarkMode ? 'rgba(45, 49, 72, 0.8)' : 'rgba(255, 255, 255, 0.9)',
                          }}
                          onClick={() => handleEditCard(card)}
                          title={card.context || card.command}
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <Badge 
                              bg={card.pasteOnly ? 'info' : 'primary'} 
                              style={{ fontSize: '1.1rem', padding: '0.5em 0.7em', fontWeight: '600' }}
                            >
                              {card.keyBinding}
                            </Badge>
                            <div className="d-flex gap-2 align-items-center">
                              <i 
                                className={`bi bi-star${card.favorite ? '-fill text-warning' : ''}`}
                                style={{ cursor: 'pointer', fontSize: '0.9rem', color: card.favorite ? '#ffc107' : (isDarkMode ? '#aaa' : '#666') }}
                                onClick={(e) => { e.stopPropagation(); handleToggleFavorite(card.id); }}
                                title="Toggle favorite"
                              ></i>
                              <i 
                                className="bi bi-pencil"
                                style={{ cursor: 'pointer', fontSize: '0.9rem', color: isDarkMode ? '#aaa' : '#666' }}
                                onClick={(e) => { e.stopPropagation(); handleEditCard(card); }}
                                title="Edit card"
                              ></i>
                              <i 
                                className="bi bi-trash"
                                style={{ cursor: 'pointer', fontSize: '0.9rem', color: isDarkMode ? '#aaa' : '#666' }}
                                onClick={(e) => { e.stopPropagation(); handleDeleteCard(card.id); }}
                                title="Delete card"
                              ></i>
                            </div>
                          </div>
                          <div 
                            className="text-truncate mt-1" 
                            style={{ 
                              fontSize: '0.8rem', 
                              fontWeight: '500',
                              color: isDarkMode ? '#e0e0e0' : '#333'
                            }}
                          >
                            {card.description || 'Unnamed'}
                          </div>
                          <div className="d-flex gap-1 mt-2">
                            <Button
                              variant="outline-secondary"
                              size="sm"
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                              onClick={(e) => { e.stopPropagation(); copyCommand(card.command, card.description); }}
                              title="Copy command to clipboard"
                            >
                              <i className="bi bi-clipboard"></i>
                            </Button>
                            <Button
                              variant={card.pasteOnly ? 'info' : 'outline-secondary'}
                              size="sm"
                              className="flex-grow-1"
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                              onClick={(e) => { e.stopPropagation(); executeCommand(card.command, card.description, true); }}
                              title="Paste command to terminal"
                            >
                              <i className="bi bi-terminal me-1"></i>Paste
                            </Button>
                            {!card.pasteOnly && (
                              <Button
                                variant="primary"
                                size="sm"
                                className="flex-grow-1"
                                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                onClick={(e) => { e.stopPropagation(); executeCommand(card.command, card.description, false); }}
                                title="Run command immediately"
                              >
                                <i className="bi bi-play-fill me-1"></i>Run
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Collapse>
              </div>

              {/* Terminal */}
              <div className="forge-pane forge-pane-terminal" style={{ flex: 1, position: 'relative' }}>
                <ForgeTerminal 
                  ref={terminalRef} 
                  isDarkMode={isDarkMode} 
                  onData={handleTerminalData} 
                  onUrlDetected={handleUrlDetected}
                  onUnreadOutput={handleTerminalUnreadOutput}
                  onImagePaste={handleImagePaste}
                  isVisible={activeTab === 'terminal'}
                />
                {/* Scroll to Bottom button - shown when terminal has unread output */}
                {tabAttention.terminal.needsAttention && activeTab === 'terminal' && (
                  <Button
                    variant="info"
                    size="sm"
                    className="position-absolute"
                    style={{ 
                      bottom: '10px', 
                      right: '10px', 
                      zIndex: 100,
                      opacity: 0.9,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                    onClick={handleScrollToBottom}
                    title="Scroll to bottom (Ctrl+End)"
                  >
                    <i className="bi bi-chevron-double-down me-1"></i>
                    New Output
                  </Button>
                )}
              </div>
            </div>

          {/* Files Tab */}
          {activeTab === 'files' && (
            <div className="forge-pane forge-pane-files" style={{ height: 'calc(100vh - 350px)', minHeight: '400px', overflow: 'hidden', width: '100%' }}>
              <ForgeFileTree 
                onFileSelect={handleFileSelect}
                workspacePath={workspacePath}
              />
            </div>
          )}

          {/* Editor Tab */}
          {activeTab === 'editor' && (
            <div className="forge-pane forge-pane-editor" style={{ height: 'calc(100vh - 350px)', minHeight: '400px' }}>
              <ForgeEditor 
                file={selectedFile}
                openFiles={openFiles}
                onFileSelect={setSelectedFile}
                onFileRename={handleFileRename}
                onCloseFile={(file) => {
                  const newFiles = openFiles.filter(f => f.path !== file.path);
                  setOpenFiles(newFiles);
                  if (selectedFile?.path === file.path) {
                    setSelectedFile(newFiles[0] || null);
                  }
                }}
                workspacePath={workspacePath}
              />
            </div>
          )}

          {/* Settings Tab - Inline config (previously modal) */}
          {activeTab === 'settings' && (
            <div className="forge-pane p-4" style={{ height: 'calc(100vh - 350px)', minHeight: '400px', overflowY: 'auto' }}>
              <h4 className="mb-4">
                <i className="bi bi-gear me-2"></i>
                Workspace Settings
              </h4>
              
              <Form>
                {/* Project Selection - Unified Dropdown */}
                <Form.Group className="mb-4">
                  <Form.Label className="fw-bold">
                    <i className="bi bi-collection me-2"></i>
                    Project
                  </Form.Label>
                  {projectsLoading ? (
                    <div className="d-flex align-items-center text-muted p-2">
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Loading projects...
                    </div>
                  ) : (
                    <Form.Select
                      value={selectedProject?.id || 'forge-sessions'}
                      onChange={handleProjectDropdownChange}
                      style={{
                        backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
                        color: isDarkMode ? '#e0e0e0' : '#333',
                        borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
                      }}
                    >
                      <option value="forge-sessions">📁 Forge Sessions (untracked work)</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}{project.workspace_path ? ` — ${project.workspace_path}` : ''}
                        </option>
                      ))}
                      <option value="create-new">➕ Create a new project...</option>
                    </Form.Select>
                  )}
                  <Form.Text className="text-muted">
                    Select a project to track logs and terminal sessions. Use "Forge Sessions" for ad-hoc untracked work.
                  </Form.Text>
                </Form.Group>

                <hr className="my-4" style={{ borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />

                <Form.Group className="mb-4">
                  <Form.Label className="fw-bold">
                    <i className="bi bi-folder2 me-2"></i>
                    Workspace Path
                  </Form.Label>
                  <Form.Control
                    type="text"
                    value={selectedProject?.workspace_path || '(No workspace — Forge Sessions mode)'}
                    readOnly
                    disabled
                    style={{
                      backgroundColor: isDarkMode ? 'rgba(30, 33, 48, 0.4)' : 'rgba(0,0,0,0.05)',
                      color: isDarkMode ? '#a0a0a0' : '#666',
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      cursor: 'not-allowed'
                    }}
                  />
                  <Form.Text className="text-muted">
                    Workspace path is set by the selected project. To change it, edit the project or select a different one.
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label className="fw-bold">
                    <i className="bi bi-terminal me-2"></i>
                    Terminal Settings
                  </Form.Label>
                  <div className="p-3 rounded" style={{ 
                    background: isDarkMode ? 'rgba(30, 33, 48, 0.6)' : 'rgba(99, 102, 241, 0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(99, 102, 241, 0.2)'}`
                  }}>
                    <p className="text-muted mb-2 small">
                      Terminal uses PTY backend for full interactive support. 
                      Commands run in the workspace directory when set.
                    </p>
                    <div className="d-flex gap-2 mb-3">
                      <Badge bg="success">PTY Enabled</Badge>
                      <Badge bg="info">WebSocket Connected</Badge>
                      {workspacePath && <Badge bg="primary">CWD: {workspacePath.split('/').pop() || workspacePath}</Badge>}
                    </div>
                    
                    <Form.Label className="small text-muted">Scroll Behavior</Form.Label>
                    <div className="d-flex gap-2 align-items-center">
                      <Form.Check
                        type="radio"
                        id="scroll-auto"
                        name="scrollBehavior"
                        label="Auto-scroll"
                        checked={scrollBehavior === 'auto'}
                        onChange={() => handleScrollBehaviorChange('auto')}
                      />
                      <Form.Check
                        type="radio"
                        id="scroll-manual"
                        name="scrollBehavior"
                        label="Manual"
                        checked={scrollBehavior === 'manual'}
                        onChange={() => handleScrollBehaviorChange('manual')}
                      />
                    </div>
                    <Form.Text className="text-muted d-block mt-1">
                      Auto-scroll follows new output when at bottom. Manual scroll only scrolls on Ctrl+End.
                    </Form.Text>
                  </div>
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label className="fw-bold">
                    <i className="bi bi-image me-2"></i>
                    Image Paste Settings
                  </Form.Label>
                  <div className="p-3 rounded" style={{ 
                    background: isDarkMode ? 'rgba(30, 33, 48, 0.6)' : 'rgba(99, 102, 241, 0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(99, 102, 241, 0.2)'}`
                  }}>
                    <p className="text-muted mb-2 small">
                      Paste images directly into the terminal for CLI tools like Claude.
                      Images are uploaded to the workspace and the file path is inserted.
                    </p>
                    
                    <Form.Check
                      type="switch"
                      id="show-image-paste-toast"
                      label="Show toast notification when image is pasted"
                      checked={showImagePasteToast}
                      onChange={(e) => setShowImagePasteToast(e.target.checked)}
                      className="mb-3"
                    />
                    
                    <div className="d-flex gap-2 align-items-center">
                      <Button 
                        variant="outline-danger" 
                        size="sm"
                        onClick={handleClearUploads}
                      >
                        <i className="bi bi-trash me-1"></i>
                        Clear Uploaded Images
                      </Button>
                      <span className="text-muted small">
                        Removes all images from .forge-uploads/
                      </span>
                    </div>
                  </div>
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label className="fw-bold">
                    <i className="bi bi-card-list me-2"></i>
                    Command Cards
                  </Form.Label>
                  <div className="p-3 rounded" style={{ 
                    background: isDarkMode ? 'rgba(30, 33, 48, 0.6)' : 'rgba(99, 102, 241, 0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(99, 102, 241, 0.2)'}`
                  }}>
                    <p className="text-muted mb-2 small">
                      {cards.length} command cards configured. Cards are stored locally in your browser.
                    </p>
                    <div className="d-flex gap-2">
                      <Button 
                        variant="outline-primary" 
                        size="sm"
                        onClick={handleAddCard}
                      >
                        <i className="bi bi-plus me-1"></i>
                        Add Card
                      </Button>
                      <Button 
                        variant="outline-warning" 
                        size="sm"
                        onClick={handleResetCards}
                      >
                        <i className="bi bi-arrow-counterclockwise me-1"></i>
                        Reset to Defaults
                      </Button>
                    </div>
                  </div>
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label className="fw-bold">
                    <i className="bi bi-lightning me-2"></i>
                    TermTap Quick Launch URLs
                  </Form.Label>
                  <div className="p-3 rounded" style={{ 
                    background: isDarkMode ? 'rgba(30, 33, 48, 0.6)' : 'rgba(99, 102, 241, 0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(99, 102, 241, 0.2)'}`
                  }}>
                    <p className="text-muted mb-2 small">
                      Configure quick launch buttons for the TermTap tab. These open URLs in a new browser tab.
                    </p>
                    
                    {/* Current Quick Launch URLs */}
                    {quickLaunchUrls.length > 0 ? (
                      <div className="mb-3">
                        {quickLaunchUrls.map((item) => (
                          <div 
                            key={item.id} 
                            className="d-flex align-items-center gap-2 mb-2 p-2 rounded"
                            style={{
                              background: isDarkMode ? 'rgba(20, 22, 36, 0.6)' : 'rgba(255,255,255,0.8)',
                              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`
                            }}
                          >
                            <Badge bg="secondary">{item.label}</Badge>
                            <span className="flex-grow-1 text-truncate small" style={{ color: isDarkMode ? '#a0a0a0' : '#666' }}>
                              {item.url}
                            </span>
                            <Button 
                              variant="outline-danger" 
                              size="sm"
                              onClick={() => removeQuickLaunchUrl(item.id)}
                              title="Remove"
                            >
                              <i className="bi bi-trash"></i>
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted small mb-3">No quick launch URLs configured.</p>
                    )}
                    
                    {/* Add New URL Form */}
                    <div className="d-flex gap-2 mb-2">
                      <Form.Control
                        type="text"
                        size="sm"
                        placeholder="Label (e.g., :3000)"
                        value={newQuickLaunchLabel}
                        onChange={(e) => setNewQuickLaunchLabel(e.target.value)}
                        style={{
                          width: '120px',
                          backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
                          color: isDarkMode ? '#e0e0e0' : '#333',
                          borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
                        }}
                      />
                      <Form.Control
                        type="text"
                        size="sm"
                        placeholder="URL (e.g., http://localhost:3000)"
                        value={newQuickLaunchUrl}
                        onChange={(e) => setNewQuickLaunchUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddQuickLaunch();
                          }
                        }}
                        className="flex-grow-1"
                        style={{
                          backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
                          color: isDarkMode ? '#e0e0e0' : '#333',
                          borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
                        }}
                      />
                      <Button 
                        variant="outline-primary" 
                        size="sm"
                        onClick={handleAddQuickLaunch}
                        disabled={!newQuickLaunchLabel.trim() || !newQuickLaunchUrl.trim()}
                      >
                        <i className="bi bi-plus me-1"></i>
                        Add
                      </Button>
                    </div>
                    
                    <Button 
                      variant="outline-warning" 
                      size="sm"
                      onClick={resetQuickLaunchUrls}
                    >
                      <i className="bi bi-arrow-counterclockwise me-1"></i>
                      Reset to Defaults
                    </Button>
                  </div>
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label className="fw-bold">
                    <i className="bi bi-terminal me-2"></i>
                    TermTap Behavior
                  </Form.Label>
                  <div className="p-3 rounded" style={{ 
                    background: isDarkMode ? 'rgba(30, 33, 48, 0.6)' : 'rgba(99, 102, 241, 0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(99, 102, 241, 0.2)'}`
                  }}>
                    <p className="text-muted mb-2 small">
                      When a URL is detected in terminal output (like OAuth login links):
                    </p>
                    <div className="d-flex flex-column gap-2">
                      <Form.Check
                        type="radio"
                        id="termtap-auto-open"
                        name="termtap-behavior"
                        label={<><i className="bi bi-box-arrow-up-right me-2"></i>Auto-open in new browser tab</>}
                        checked={termTapAutoOpen === true}
                        onChange={() => setTermTapAutoOpen(true)}
                        style={{ color: isDarkMode ? '#e0e0e0' : '#333' }}
                      />
                      <Form.Check
                        type="radio"
                        id="termtap-highlight"
                        name="termtap-behavior"
                        label={<><i className="bi bi-bell me-2"></i>Highlight TermTap tab (click to open)</>}
                        checked={termTapAutoOpen === false}
                        onChange={() => setTermTapAutoOpen(false)}
                        style={{ color: isDarkMode ? '#e0e0e0' : '#333' }}
                      />
                    </div>
                    {termTapAutoOpen === null && (
                      <Alert variant="info" className="mt-2 mb-0 py-2 small">
                        <i className="bi bi-info-circle me-2"></i>
                        No preference set. Visit the TermTap tab to configure.
                      </Alert>
                    )}
                  </div>
                </Form.Group>
              </Form>
            </div>
          )}
          
          {/* TermTap Tab Content - URL handler for detected terminal URLs */}
          {activeTab === 'termtap' && (
            <div className="d-flex flex-column h-100" style={{ minHeight: '400px' }}>
              {/* First-time preference prompt */}
              {termTapAutoOpen === null ? (
                <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center p-4">
                  <div className="text-center mb-4">
                    <i className="bi bi-terminal" style={{ fontSize: '4rem', opacity: 0.7, color: isDarkMode ? '#6366f1' : '#4f46e5' }}></i>
                    <h4 className="mt-3 mb-2">Welcome to TermTap</h4>
                    <p className="text-muted">
                      TermTap detects URLs in your terminal output (like OAuth login links)
                      <br />and helps you open them quickly.
                    </p>
                  </div>
                  
                  <div className="p-4 rounded mb-4" style={{
                    background: isDarkMode ? 'rgba(30, 33, 48, 0.8)' : 'rgba(99, 102, 241, 0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(99, 102, 241, 0.2)'}`,
                    maxWidth: '500px'
                  }}>
                    <h6 className="mb-3">How would you like to handle detected URLs?</h6>
                    <div className="d-grid gap-3">
                      <Button 
                        variant={isDarkMode ? 'outline-light' : 'outline-primary'}
                        size="lg"
                        className="text-start py-3"
                        onClick={() => setTermTapAutoOpen(true)}
                      >
                        <i className="bi bi-box-arrow-up-right me-3"></i>
                        <span>
                          <strong>Auto-open in new tab</strong>
                          <br />
                          <small className="text-muted">Detected URLs open automatically in your browser</small>
                        </span>
                      </Button>
                      <Button 
                        variant={isDarkMode ? 'outline-light' : 'outline-primary'}
                        size="lg"
                        className="text-start py-3"
                        onClick={() => setTermTapAutoOpen(false)}
                      >
                        <i className="bi bi-bell me-3"></i>
                        <span>
                          <strong>Highlight tab for me to click</strong>
                          <br />
                          <small className="text-muted">TermTap tab will pulse when a URL is detected</small>
                        </span>
                      </Button>
                    </div>
                    <p className="text-muted small mt-3 mb-0">
                      <i className="bi bi-info-circle me-1"></i>
                      You can change this later in Settings.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* URL Bar */}
                  <div className="p-2 border-bottom" style={{
                    background: isDarkMode ? 'rgba(30, 33, 48, 0.95)' : '#f8f9fa',
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                  }}>
                    <div className="d-flex align-items-center gap-2">
                      {/* URL Input */}
                      <div className="flex-grow-1 d-flex align-items-center gap-2 px-2 py-1 rounded" style={{
                        background: isDarkMode ? 'rgba(20, 22, 36, 0.8)' : '#ffffff',
                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`
                      }}>
                        <i className="bi bi-link-45deg text-muted"></i>
                        <input 
                          type="text"
                          className="form-control form-control-sm border-0"
                          value={termTapUrl}
                          onChange={(e) => setTermTapUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && termTapUrl) {
                              openUrlInNewTab(termTapUrl);
                            }
                          }}
                          placeholder="Enter URL and press Enter to open in new tab..."
                          style={{
                            background: 'transparent',
                            color: isDarkMode ? '#e0e0e0' : '#333',
                            boxShadow: 'none'
                          }}
                        />
                      </div>
                      
                      {/* Action buttons */}
                      <Button 
                        variant="primary"
                        size="sm"
                        onClick={() => openUrlInNewTab(termTapUrl)}
                        disabled={!termTapUrl}
                        title="Open in new tab (Enter)"
                      >
                        <i className="bi bi-box-arrow-up-right me-1"></i>
                        Open
                      </Button>
                      <Button 
                        variant="outline-danger" 
                        size="sm"
                        onClick={() => { 
                          setTermTapUrl(''); 
                          setDetectedUrl(null); 
                        }}
                        disabled={!termTapUrl}
                        title="Clear"
                      >
                        <i className="bi bi-x-lg"></i>
                      </Button>
                    </div>
                    
                    {/* Quick Launch Buttons */}
                    <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                      <span className="small text-muted">Quick Launch:</span>
                      {quickLaunchUrls.map((item) => (
                        <Button 
                          key={item.id}
                          variant={isDarkMode ? 'outline-light' : 'outline-secondary'}
                          size="sm"
                          onClick={() => openUrlInNewTab(item.url)}
                          title={item.url}
                        >
                          {item.label}
                        </Button>
                      ))}
                      {quickLaunchUrls.length === 0 && (
                        <span className="text-muted small">No quick launch buttons. Add some in Settings.</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Main Content Area */}
                  <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center p-4" style={{ 
                    background: isDarkMode ? '#1a1d2e' : '#ffffff',
                    minHeight: '300px'
                  }}>
                    {detectedUrl ? (
                      /* Detected URL state */
                      <div className="text-center">
                        <Badge bg="success" className="mb-3" style={{ fontSize: '1rem' }}>
                          <i className="bi bi-check-circle me-2"></i>
                          URL Detected from Terminal
                        </Badge>
                        <div className="p-3 rounded mb-3" style={{
                          background: isDarkMode ? 'rgba(30, 33, 48, 0.8)' : 'rgba(0,0,0,0.05)',
                          maxWidth: '500px',
                          wordBreak: 'break-all'
                        }}>
                          <code style={{ color: isDarkMode ? '#a5b4fc' : '#4f46e5' }}>{detectedUrl}</code>
                        </div>
                        <Button 
                          variant="primary"
                          size="lg"
                          onClick={() => openUrlInNewTab(detectedUrl)}
                        >
                          <i className="bi bi-box-arrow-up-right me-2"></i>
                          Open in New Tab
                        </Button>
                        <p className="text-muted small mt-3">
                          {termTapAutoOpen 
                            ? 'Auto-open is enabled. URLs will open automatically next time.'
                            : 'Click the button above to open this URL.'}
                        </p>
                      </div>
                    ) : (
                      /* Empty state */
                      <div className="text-center text-muted">
                        <i className="bi bi-terminal" style={{ fontSize: '3rem', opacity: 0.5 }}></i>
                        <p className="mt-3 mb-1">No URLs detected yet</p>
                        <p className="small">
                          URLs from terminal output (like OAuth login links) will appear here
                          <br />
                          Use Quick Launch buttons above for frequently used URLs
                        </p>
                        <div className="mt-3 p-3 rounded" style={{
                          background: isDarkMode ? 'rgba(30, 33, 48, 0.6)' : 'rgba(99, 102, 241, 0.08)',
                          maxWidth: '400px'
                        }}>
                          <small className="d-flex align-items-center justify-content-center gap-2">
                            <i className={`bi bi-${termTapAutoOpen ? 'box-arrow-up-right' : 'bell'}`}></i>
                            {termTapAutoOpen 
                              ? 'Detected URLs will auto-open in new tab'
                              : 'Tab will highlight when URL detected'}
                          </small>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          
          {/* Debug Tab Content */}
          {activeTab === 'debug' && (
            <div className="p-4 h-100 d-flex flex-column">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h5 className="mb-0">
                  <i className="bi bi-terminal me-2"></i>
                  Terminal Debug Output
                </h5>
                <div className="d-flex align-items-center gap-2">
                  <Form.Check 
                    type="switch"
                    id="autoScrollDebug"
                    label="Auto-scroll"
                    checked={autoScrollDebug}
                    onChange={(e) => setAutoScrollDebug(e.target.checked)}
                    className="small"
                  />
                  <Badge bg="secondary">{debugLines.length} lines</Badge>
                  <Button 
                    variant="outline-secondary" 
                    size="sm"
                    onClick={exportToHealthLogs}
                    disabled={debugLines.length === 0}
                    title="Export terminal output to DevSmith Health Logs"
                  >
                    <i className="bi bi-cloud-upload me-1"></i>
                    Export to Health Logs
                  </Button>
                  <Button 
                    variant="outline-danger" 
                    size="sm"
                    onClick={clearDebugOutput}
                  >
                    <i className="bi bi-trash me-1"></i>
                    Clear
                  </Button>
                </div>
              </div>
              
              <div 
                ref={debugContainerRef}
                className="flex-grow-1 overflow-auto font-monospace small rounded p-3"
                style={{
                  background: isDarkMode ? 'rgba(20, 22, 36, 0.95)' : '#f8f9fa',
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                  fontSize: '0.75rem',
                  lineHeight: '1.4'
                }}
              >
                {debugLines.length > 0 ? (
                  debugLines.map((line, idx) => (
                    <div 
                      key={line.id} 
                      className="d-flex"
                      style={{ 
                        color: isDarkMode ? '#a0a0a0' : '#666',
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`,
                        padding: '2px 0'
                      }}
                    >
                      <span className="text-muted me-2" style={{ minWidth: '50px' }}>
                        {(idx + 1).toString().padStart(4, ' ')}
                      </span>
                      <span className="text-muted me-2" style={{ minWidth: '90px' }}>
                        {new Date(line.timestamp).toLocaleTimeString()}
                      </span>
                      <span style={{ color: isDarkMode ? '#e0e0e0' : '#333' }}>
                        {line.text}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted p-4">
                    <i className="bi bi-terminal" style={{ fontSize: '2rem' }}></i>
                    <p className="mt-2 mb-0">No terminal output captured yet.</p>
                    <p className="small mb-0">Output will appear here as it's generated.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card Edit Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header 
          closeButton 
          style={{
            backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
            color: isDarkMode ? '#e0e0e0' : '#333',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
          }}
        >
          <Modal.Title>{editingCard ? 'Edit Command Card' : 'Add Command Card'}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{
          backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
          color: isDarkMode ? '#e0e0e0' : '#333'
        }}>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Key Binding</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., Ctrl+Shift+B"
                value={formData.keyBinding}
                onChange={(e) => setFormData({ ...formData, keyBinding: e.target.value })}
                style={{
                  backgroundColor: isDarkMode ? '#2a2f45' : '#f8f9fa',
                  color: isDarkMode ? '#e0e0e0' : '#333',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
                }}
              />
              <Form.Text className="text-muted">
                Supports Ctrl, Alt, Shift, Meta/Cmd + any key or F1-F12
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                type="text"
                placeholder="Short description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{
                  backgroundColor: isDarkMode ? '#2a2f45' : '#f8f9fa',
                  color: isDarkMode ? '#e0e0e0' : '#333',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
                }}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Command</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="Command to execute"
                value={formData.command}
                onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                className="font-monospace"
                style={{
                  backgroundColor: isDarkMode ? '#2a2f45' : '#f8f9fa',
                  color: isDarkMode ? '#e0e0e0' : '#333',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
                }}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Context / Notes</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                placeholder="When to use this command (shown on hover)"
                value={formData.context}
                onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                style={{
                  backgroundColor: isDarkMode ? '#2a2f45' : '#f8f9fa',
                  color: isDarkMode ? '#e0e0e0' : '#333',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
                }}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Paste only (don't execute)"
                checked={formData.pasteOnly}
                onChange={(e) => setFormData({ ...formData, pasteOnly: e.target.checked })}
              />
              <Form.Text className="text-muted">
                If checked, command will be pasted into terminal without pressing Enter
              </Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{
          backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
          borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
        }}>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveCard}>
            {editingCard ? 'Update' : 'Add'} Card
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Folder Picker Modal */}
      <Modal 
        show={showFolderPicker} 
        onHide={() => setShowFolderPicker(false)}
        size="lg"
        centered
      >
        <Modal.Header 
          closeButton
          style={{
            backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            color: isDarkMode ? '#e0e0e0' : '#333'
          }}
        >
          <Modal.Title>
            <i className="bi bi-folder2 me-2"></i>
            Select Workspace Folder
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{
          backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
          color: isDarkMode ? '#e0e0e0' : '#333',
          maxHeight: '60vh',
          overflowY: 'auto'
        }}>
          {/* Current Path Display */}
          <div className="mb-3 p-2 rounded d-flex align-items-center gap-2" style={{
            backgroundColor: isDarkMode ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
            border: `1px solid ${isDarkMode ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.3)'}`
          }}>
            <i className="bi bi-folder-fill text-primary"></i>
            <code style={{ color: isDarkMode ? '#e0e0e0' : '#333' }}>/workspace{folderPickerPath === '/' ? '' : folderPickerPath}</code>
          </div>

          {/* Navigation */}
          <div className="mb-3 d-flex gap-2">
            <Button 
              variant={isDarkMode ? 'outline-light' : 'outline-secondary'}
              size="sm"
              onClick={handleFolderGoUp}
              disabled={folderPickerPath === '/'}
            >
              <i className="bi bi-arrow-up me-1"></i>
              Go Up
            </Button>
            <Button
              variant={isDarkMode ? 'outline-light' : 'outline-secondary'}
              size="sm"
              onClick={() => fetchFolderContents('/')}
            >
              <i className="bi bi-house me-1"></i>
              Root
            </Button>
          </div>

          {/* Folder List */}
          {folderPickerLoading ? (
            <div className="text-center py-4">
              <div className="spinner-border spinner-border-sm me-2" role="status"></div>
              Loading folders...
            </div>
          ) : folderPickerItems.length === 0 ? (
            <div className="text-center py-4 text-muted">
              <i className="bi bi-folder-x fs-3 d-block mb-2"></i>
              No subfolders in this directory
            </div>
          ) : (
            <div className="list-group" style={{
              backgroundColor: isDarkMode ? '#2a2f45' : '#f8f9fa',
              borderRadius: '0.5rem'
            }}>
              {folderPickerItems.map((folder) => (
                <button
                  key={folder.path}
                  className="list-group-item list-group-item-action d-flex align-items-center gap-2"
                  style={{
                    backgroundColor: isDarkMode ? '#2a2f45' : '#ffffff',
                    color: isDarkMode ? '#e0e0e0' : '#333',
                    borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                  }}
                  onClick={() => handleFolderNavigate(folder.path)}
                >
                  <i className="bi bi-folder-fill text-warning"></i>
                  {folder.name}
                </button>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer style={{
          backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
          borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
        }}>
          <Button variant="secondary" onClick={() => setShowFolderPicker(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleFolderSelect}>
            <i className="bi bi-check-lg me-1"></i>
            Select This Folder
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Reset Cards Confirmation Modal */}
      <Modal show={showResetConfirm} onHide={() => setShowResetConfirm(false)} centered>
        <Modal.Header 
          closeButton 
          style={{
            backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
            color: isDarkMode ? '#e0e0e0' : '#333',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
          }}
        >
          <Modal.Title>
            <i className="bi bi-exclamation-triangle-fill text-warning me-2"></i>
            Reset Command Cards
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{
          backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
          color: isDarkMode ? '#e0e0e0' : '#333'
        }}>
          <p>This will delete all your custom command cards and restore the defaults.</p>
          <p className="mb-0 text-warning"><strong>This cannot be undone.</strong></p>
        </Modal.Body>
        <Modal.Footer style={{
          backgroundColor: isDarkMode ? '#1e2130' : '#ffffff',
          borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
        }}>
          <Button variant="secondary" onClick={() => setShowResetConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmResetCards}>
            <i className="bi bi-arrow-counterclockwise me-1"></i>
            Reset to Defaults
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Project Create Modal */}
      <ProjectCreateModal
        show={showCreateProjectModal}
        onHide={() => setShowCreateProjectModal(false)}
        onCreated={handleProjectCreated}
        isDarkMode={isDarkMode}
      />
    </AppLayout>
  );
}