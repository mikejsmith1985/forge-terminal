import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { ArrowDownToLine } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { getTerminalTheme } from '../themes';
import { logger } from '../utils/logger';
import { diagnosticCore } from '../utils/diagnosticCore';

// Paste error logger
const logPasteError = (error, context = {}) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    type: 'clipboard',
    error: error.message || String(error),
    errorName: error.name || 'Unknown',
    context,
    userAgent: navigator.userAgent,
  };
  
  // Log to console
  console.error('[Paste Error]', errorLog);
  
  // Persist to sessionStorage
  try {
    const existingLogs = JSON.parse(sessionStorage.getItem('paste-error-log') || '[]');
    existingLogs.push(errorLog);
    // Keep only last 50 errors
    if (existingLogs.length > 50) {
      existingLogs.shift();
    }
    sessionStorage.setItem('paste-error-log', JSON.stringify(existingLogs));
  } catch (storageErr) {
    console.warn('[Paste Error] Failed to persist to sessionStorage:', storageErr);
  }
  
  // If Follow Me is recording, it will capture the console.error automatically
  return errorLog;
};

// Debounce helper for resize events
function debounce(fn, ms) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

// Throttle helper - runs at most once per interval (non-blocking)
function throttle(fn, ms) {
  let lastRun = 0;
  let scheduled = false;
  return (...args) => {
    const now = Date.now();
    if (now - lastRun >= ms) {
      lastRun = now;
      fn(...args);
    } else if (!scheduled) {
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        lastRun = Date.now();
        fn(...args);
      }, ms - (now - lastRun));
    }
  };
}

// Use requestIdleCallback with fallback for non-blocking work
// This allows prompt detection to fire quickly when the browser is idle,
// rather than forcing a fixed delay. The timeout parameter (2000ms) is a 
// maximum wait time, not a minimum - the callback fires as soon as the
// browser has idle time available (typically 10-100ms after last activity).
const scheduleIdleWork = (callback) => {
  if (typeof requestIdleCallback !== 'undefined') {
    return requestIdleCallback(callback, { timeout: 2000 });
  }
  // Fallback for browsers without requestIdleCallback
  return setTimeout(callback, 100);
};

const cancelIdleWork = (id) => {
  if (typeof cancelIdleCallback !== 'undefined') {
    cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
};

// ============================================================================
// CLI Prompt Detection for Auto-Respond Feature
// ============================================================================
// Detects when CLI tools (Copilot, Claude, npm, etc.) are waiting for user input
// and determines the appropriate response type.

/**
 * Strip ANSI escape codes from text for pattern matching
 */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

// ----------------------------------------------------------------------------
// PATTERN DEFINITIONS
// ----------------------------------------------------------------------------

// Menu-style prompts where an option is already selected (just press Enter)
// These search the ENTIRE buffer, not just the last line
const MENU_SELECTION_PATTERNS = [
  // Copilot CLI: "❯ 1. Yes" or "> 1. Yes" (numbered menu with selection indicator)
  /[›❯>]\s*1\.\s*Yes\b/i,
  // Generic inquirer-style: "❯ Yes" anywhere in buffer
  /[›❯>]\s*Yes\b/i,
  // Copilot CLI: "❯ Run this command"
  /[›❯>]\s*Run\s+this\s+command/i,
  // Selected option with checkmark or bullet
  /[●◉✓✔]\s*Yes\b/i,
  // NEW: Tool permission - "❯ Allow" or "❯ 1. Allow"
  /[›❯>]\s*(?:\d+\.\s*)?Allow\b/i,
  /[›❯>]\s*Allow\s+tool:/i,
  /[●◉✓✔]\s*Allow\b/i,
];

// Context patterns that indicate a CLI is showing a confirmation menu
// Must be combined with MENU_SELECTION_PATTERNS
const MENU_CONTEXT_PATTERNS = [
  // Copilot CLI instruction line
  /Confirm with number keys or.*Enter/i,
  // Generic "use arrow keys" instruction
  /use.*arrow.*keys.*select/i,
  /↑↓.*keys.*Enter/i,
  // "Do you want to run" question
  /Do you want to run this command\??/i,
  /Do you want to run\??/i,
  // Cancel with Esc instruction (common in TUI prompts)
  /Cancel with Esc/i,
  // Copilot path confirmation and permission dialogs
  /Path confirmation/i,
  /Allow directory access/i,
  /allowed directory list/i,
  /Do you want to add these directories/i,
  // NEW: Tool permission prompts (Copilot without --allow-all-tools)
  /Allow\s+tool:/i,
  /Allow\s+this\s+tool\?/i,
  /tool.*permission/i,
  /tool.*authorization/i,
  /Grant.*permission/i,
  /requires.*permission/i,
  /allow.*to\s+(execute|run|access)/i,
];

// EXCLUSION patterns - menus where we should NOT auto-respond
// These are user choice menus where the user needs to pick an option, not confirm
const AUTO_RESPOND_EXCLUSION_PATTERNS = [
  // Model selection menus (Copilot /model command)
  /Select a model/i,
  /Choose.*model/i,
  /gpt-4|gpt-3\.5|claude|o1-|o3-|gemini/i, // Model names in selection context
  // Generic selection menus (not confirmation)
  /Select an option/i,
  /Choose an option/i,
  /Pick.*:/i,
  // Multiple numbered options with 3+ items (not just Yes/No which has 2)
  // This detects lists like "1. Option A\n2. Option B\n3. Option C"
  /\d+\.\s*\S+.*\n.*\d+\.\s*\S+.*\n.*\d+\.\s*\S+/i,
];

// Y/N style prompts: These expect typing 'y' or 'n' then Enter
const YN_PROMPT_PATTERNS = [
  // Standard y/n patterns at end of line
  /\(y\/n\)[:?]?\s*$/i,
  /\[Y\/n\][:?]?\s*$/i,
  /\[y\/N\][:?]?\s*$/i,
  /\(yes\/no\)[:?]?\s*$/i,
  /\[yes\/no\][:?]?\s*$/i,
  // Question followed by y/n
  /\?\s*\(y\/n\)[:?]?\s*$/i,
  /\?\s*\[Y\/n\][:?]?\s*$/i,
  /\?\s*\[y\/N\][:?]?\s*$/i,
  // npm/yarn style
  /\?\s*›?\s*\(Y\/n\)[:?]?\s*$/i,
  /Are you sure.*\?\s*$/i,
  // PowerShell -Confirm prompts: [Y] Yes  [A] Yes to All  [N] No... (default is "Y"):
  /\[Y\]\s*Yes\s+\[A\]\s*Yes to All\s+\[N\]\s*No/i,
  /\(default is "Y"\)\s*:?\s*$/i,
  // Generic confirmation ending with colon after Yes/No options
  /\[Y\].*\[N\].*:\s*$/i,
  // NEW: Tool permission Y/N prompts
  /Allow\s+this\s+tool\?\s*\(y\/n\)/i,
  /Grant\s+permission\?\s*\(y\/n\)/i,
];

// Question patterns that indicate waiting for input (used with context)
const QUESTION_PATTERNS = [
  /Do you want to run this command\?/i,
  /Do you want to proceed\?/i,
  /Do you want to continue\?/i,
  /Would you like to proceed\?/i,
  /Proceed\?/i,
  /Continue\?/i,
  /Run this command\?/i,
];

// TUI frame indicators (box drawing characters indicate a TUI is active)
const TUI_FRAME_INDICATORS = [
  // Box drawing corners and lines
  /[╭╮╯╰│─┌┐└┘├┤┬┴┼]/,
  // Copilot CLI footer
  /Remaining requests:\s*[\d.]+%/i,
  // Ctrl+c Exit indicator
  /Ctrl\+c\s+Exit/i,
];

// ----------------------------------------------------------------------------
// DETECTION FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Detect if CLI is showing a menu-style prompt with "Yes" selected
 * @param {string} cleanText - ANSI-stripped text buffer
 * @param {boolean} debugLog - Enable debug logging
 * @returns {{ detected: boolean, confidence: 'high'|'medium'|'low' }}
 */
function detectMenuPrompt(cleanText, debugLog = false) {
  // Check if "Yes" option is selected (has selection indicator)
  const hasYesSelected = MENU_SELECTION_PATTERNS.some(p => p.test(cleanText));
  
  if (!hasYesSelected) {
    return { detected: false, confidence: 'low' };
  }
  
  // Check for supporting context (instructions, question, etc.)
  const hasMenuContext = MENU_CONTEXT_PATTERNS.some(p => p.test(cleanText));
  const hasQuestion = QUESTION_PATTERNS.some(p => p.test(cleanText));
  const hasTuiFrame = TUI_FRAME_INDICATORS.some(p => p.test(cleanText));
  
  // High confidence: Yes is selected AND we see menu instructions or TUI frame
  if (hasYesSelected && (hasMenuContext || hasTuiFrame)) {
    return { detected: true, confidence: 'high' };
  }
  
  // Medium confidence: Yes is selected AND there's a relevant question
  if (hasYesSelected && hasQuestion) {
    return { detected: true, confidence: 'medium' };
  }
  
  // Low confidence: Just the selection indicator alone
  // We still detect it but with lower confidence
  if (hasYesSelected) {
    return { detected: true, confidence: 'low' };
  }
  
  return { detected: false, confidence: 'low' };
}

/**
 * Detect if CLI is showing a Y/N style prompt
 * @param {string} cleanText - ANSI-stripped text buffer
 * @param {boolean} debugLog - Enable debug logging
 * @returns {{ detected: boolean }}
 */
function detectYnPrompt(cleanText, debugLog = false) {
  // Get last few lines for y/n detection (these appear at end)
  // Use more lines for PowerShell prompts which can span multiple lines
  const lines = cleanText.split(/[\r\n]/).filter(l => l.trim());
  const lastLines = lines.slice(-5).join('\n'); // Increased from 3 to 5 lines
  
  const hasYnPrompt = YN_PROMPT_PATTERNS.some(p => p.test(lastLines));
  
  return { detected: hasYnPrompt };
}

/**
 * Check if the buffer matches exclusion patterns (user selection menus where we shouldn't auto-respond)
 * @param {string} cleanText - ANSI-stripped text buffer
 * @returns {boolean} - true if we should NOT auto-respond
 */
function shouldExcludeFromAutoRespond(cleanText) {
  return AUTO_RESPOND_EXCLUSION_PATTERNS.some(p => p.test(cleanText));
}

/**
 * Main detection function - determines if CLI is waiting for user input
 * @param {string} text - Raw terminal output buffer
 * @param {boolean} debugLog - Enable debug logging
 * @returns {{ waiting: boolean, responseType: 'enter'|'y-enter'|null, confidence: string, excluded: boolean }}
 */
function detectCliPrompt(text, debugLog = false) {
  if (!text || text.length < 10) {
    return { waiting: false, responseType: null, confidence: 'none', excluded: false };
  }
  
  // Strip ANSI escape codes
  const cleanText = stripAnsi(text);
  
  // Use smaller buffer for performance (reduced from 2000)
  const bufferToCheck = cleanText.slice(-800);
  
  // FIRST: Check exclusion patterns - these are user choice menus where we should NOT auto-respond
  // This prevents auto-respond from firing during /model selection and similar menus
  if (shouldExcludeFromAutoRespond(bufferToCheck)) {
    if (debugLog) {
      console.log('[AutoRespond] EXCLUDED - matches exclusion pattern (model selection, etc.)');
    }
    return { waiting: false, responseType: null, confidence: 'none', excluded: true };
  }
  
  // Priority 1: Check for menu-style prompts (Copilot, Claude, etc.)
  const menuResult = detectMenuPrompt(bufferToCheck, debugLog);
  if (menuResult.detected && menuResult.confidence !== 'low') {
    return { 
      waiting: true, 
      responseType: 'enter', 
      confidence: menuResult.confidence,
      excluded: false
    };
  }
  
  // Priority 2: Check for Y/N style prompts
  const ynResult = detectYnPrompt(bufferToCheck, debugLog);
  if (ynResult.detected) {
    return { 
      waiting: true, 
      responseType: 'y-enter', 
      confidence: 'high',
      excluded: false
    };
  }
  
  // Priority 3: Low confidence menu detection (still report as waiting but may not auto-respond)
  if (menuResult.detected && menuResult.confidence === 'low') {
    return { 
      waiting: true, 
      responseType: 'enter', 
      confidence: 'low',
      excluded: false
    };
  }
  
  return { waiting: false, responseType: null, confidence: 'none', excluded: false };
}


/**
 * Terminal Component
 * 
 * Full PTY terminal using xterm.js connected via WebSocket.
 */
// ----------------------------------------------------------------------------
// DIRECTORY DETECTION FROM TERMINAL OUTPUT
// ----------------------------------------------------------------------------

/**
 * Extract the current directory from terminal output/prompt
 * Supports PowerShell, CMD, and Bash/WSL prompts
 * @param {string} text - Raw terminal output
 * @returns {string|null} - Extracted directory path or null
 */
function extractDirectory(text) {
  // Strip ANSI codes
  const clean = stripAnsi(text);
  
  // Get last few lines where prompt would be
  const lines = clean.split(/[\r\n]/).filter(l => l.trim());
  const lastLines = lines.slice(-5);
  
  for (let i = lastLines.length - 1; i >= 0; i--) {
    const line = lastLines[i].trim();
    
    // PowerShell prompt: "PS C:\Users\foo>" or "PS C:\Users\foo> "
    // Relaxed regex: Allow optional leading chars (in case of leftover ANSI artifacts)
    // and handle both "PS >" and "PS ...>" formats
    const psMatch = line.match(/PS\s+([A-Za-z]:\\[^>]*?)>\s*$/i);
    if (psMatch) {
      return psMatch[1];
    }
    
    // CMD prompt: "C:\Users\foo>" or "C:\Users\foo>command"
    // Relaxed regex: Don't enforce start of line
    const cmdMatch = line.match(/([A-Za-z]:\\[^>]*?)>/);
    if (cmdMatch) {
      return cmdMatch[1];
    }
    
    // Bash/WSL prompt with path: "user@host:~/projects$" or "user@host:/home/user$"
    // Also handles: "user@host:~/projects$ " (with trailing space)
    const bashMatch = line.match(/[@][\w.-]+:([~\/][^\$#]*?)[\$#]\s*$/);
    if (bashMatch) {
      return bashMatch[1];
    }
    
    // Simple bash prompt: "~/projects$ " or "/home/user$ "
    const simpleBashMatch = line.match(/^([~\/][^\$#\s]+)[\$#]\s*$/);
    if (simpleBashMatch) {
      return simpleBashMatch[1];
    }
  }
  
  return null;
}

/**
 * Get the folder name (basename) from a path
 * @param {string} path - Full path (Windows or Unix style)
 * @returns {string} - Just the folder name
 */
function getFolderName(path) {
  if (!path) return null;
  
  // Handle home directory
  if (path === '~' || path === '~/' || path === '/') {
    return '~';
  }
  
  // Normalize path separators and remove trailing slashes
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  
  // Handle ~ paths
  if (normalized.startsWith('~/')) {
    const parts = normalized.split('/');
    return parts[parts.length - 1] || '~';
  }
  
  // Get the last part of the path
  const parts = normalized.split('/');
  const lastPart = parts[parts.length - 1];
  
  // For Windows root like "C:" return "C:"
  if (/^[A-Za-z]:$/.test(lastPart)) {
    return lastPart;
  }
  
  return lastPart || normalized;
}

const ForgeTerminal = forwardRef(function ForgeTerminal({
  className,
  style,
  theme = 'dark', // 'dark' or 'light'
  colorTheme = 'molten', // theme color scheme
  fontSize = 14,
  onConnectionChange = null,
  onWaitingChange = null, // Callback when prompt waiting state changes
  onDirectoryChange = null, // Callback when directory changes (for tab rename)
  onCopy = null, // Callback when text is copied (for toast notification)
  onPaste = null, // Callback when text is pasted (for toast notification)
  shellConfig = null, // { shellType: 'powershell'|'cmd'|'wsl', wslDistro: string, wslHomePath: string }
  tabId = null, // Unique identifier for this terminal tab
  tabName = null, // Tab display name
  isVisible = true, // Whether this terminal is currently visible
  autoRespond = false, // Auto-respond "yes" to CLI confirmation prompts
  // amEnabled = false, // v3.12.12: AM feature removed
  currentDirectory = null, // Current working directory to restore on connect
  visionEnabled = false, // Forge Vision overlay enabled (Dev Mode)
  assistantEnabled = false, // Forge Assistant panel enabled (Dev Mode)
  isAgentMode = false, // New prop: Agent Mode (full screen chat)
}, ref) {
  const terminalRef = useRef(null);
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const keydownHandlerRef = useRef(null);
  const shellConfigRef = useRef(shellConfig);
  const currentDirectoryRef = useRef(currentDirectory);
  const connectFnRef = useRef(null);
  // PERF FIX: Use a fixed-size circular buffer instead of string concat
  const outputBufferRef = useRef({ data: '', writePos: 0 });
  const lastOutputRef = useRef(''); // Keep for compatibility but update less often
  const waitingCheckIdleRef = useRef(null); // Changed from timeout to idle callback
  const autoRespondRef = useRef(autoRespond);
  // const amEnabledRef = useRef(amEnabled); // v3.12.12: AM feature removed
  const tabNameRef = useRef(tabName);
  const lastDirectoryRef = useRef(null);
  const onDirectoryChangeRef = useRef(onDirectoryChange);
  const onCopyRef = useRef(onCopy);
  const onPasteRef = useRef(onPaste);
  // v3.12.12: AM logging refs removed - AM feature deprecated
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const maxReconnectAttempts = 5;
  // Track effective max for display (higher in dev mode)
  const effectiveMaxAttemptsRef = useRef(maxReconnectAttempts);
  const isCopyingRef = useRef(false); // Prevent clipboard spam
  const isPastingRef = useRef(false); // Prevent double paste handling
  
  // State for scroll button visibility
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  
  // PERF FIX: Track isWaiting in ref to avoid stale closures in hot paths
  const isWaitingRef = useRef(false);
  
  // Vision state
  const visionEnabledRef = useRef(visionEnabled);

  // Keep autoRespond ref updated and sync with backend SequenceEngine
  useEffect(() => {
    autoRespondRef.current = autoRespond;
    
    // CRITICAL FIX: Send AUTO_RESPOND_TOGGLE to backend to enable SequenceEngine
    // Without this, the backend's advanced pattern detection never runs
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg = {
        type: 'AUTO_RESPOND_TOGGLE',
        enabled: autoRespond
      };
      wsRef.current.send(JSON.stringify(msg));
      logger.terminal(`Auto-respond backend sync: ${autoRespond ? 'enabled' : 'disabled'}`, { tabId });
    }
  }, [autoRespond, tabId]);

  // v3.12.12: AM feature removed - amEnabled effect deleted

  // Keep tabName ref updated
  useEffect(() => {
    tabNameRef.current = tabName;
  }, [tabName]);

  // Keep shellConfig ref updated
  useEffect(() => {
    shellConfigRef.current = shellConfig;
  }, [shellConfig]);

  // Keep currentDirectory ref updated
  useEffect(() => {
    currentDirectoryRef.current = currentDirectory;
  }, [currentDirectory]);

  // Keep onDirectoryChange ref updated
  useEffect(() => {
    onDirectoryChangeRef.current = onDirectoryChange;
  }, [onDirectoryChange]);
  
  // Keep onCopy ref updated
  useEffect(() => {
    onCopyRef.current = onCopy;
  }, [onCopy]);

  // Keep onPaste ref updated
  useEffect(() => {
    onPasteRef.current = onPaste;
  }, [onPaste]);
  
  // Keep visionEnabled ref updated and send control message to backend
  useEffect(() => {
    visionEnabledRef.current = visionEnabled;
    
    // Send enable/disable message to backend
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg = {
        type: visionEnabled ? 'VISION_ENABLE' : 'VISION_DISABLE'
      };
      wsRef.current.send(JSON.stringify(msg));
      logger.terminal(`Vision ${visionEnabled ? 'enabled' : 'disabled'}`, { tabId });
    }
  }, [visionEnabled, tabId]);

  // Refit terminal when becoming visible
  useEffect(() => {
    if (isVisible && fitAddonRef.current && xtermRef.current) {
      // Small delay to ensure the container is properly sized
      setTimeout(() => {
        fitAddonRef.current.fit();
        // Critical fix: Re-focus after fit on visibility change
        queueMicrotask(() => {
          if (xtermRef.current) {
            xtermRef.current.focus();
          }
        });
      }, 50);
    }
  }, [isVisible]);

  // Fix spacebar issue: Focus terminal on window focus
  useEffect(() => {
    if (!isVisible) return;
    
    const handleWindowFocus = () => {
      if (xtermRef.current && isVisible) {
        // Use queueMicrotask for more reliable focus recovery
        queueMicrotask(() => {
          if (xtermRef.current) {
            xtermRef.current.focus();
          }
        });
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && xtermRef.current && isVisible) {
        // Use queueMicrotask for more reliable focus recovery
        queueMicrotask(() => {
          if (xtermRef.current) {
            xtermRef.current.focus();
          }
        });
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isVisible]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    sendCommand: (command, delay) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Send the command and Enter key separately with a small delay.
        // This ensures proper execution in both regular shells and TUI applications.
        // In TUI contexts (Claude CLI, Copilot CLI), the TUI needs time to process
        // the pasted text before receiving the Enter key.

        // Use provided delay or default to 15ms
        // If delay is explicitly 0, we still use it (fast execution)
        const executionDelay = (delay !== undefined && delay !== null) ? parseInt(delay, 10) : 15;

        // First, send the command text
        wsRef.current.send(command);

        // Then send Enter key after a small delay to allow text processing
        // 15ms is enough for xterm.js and PTY to process the text before Enter
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send('\r');
          }
        }, executionDelay);

        // Always log commands to AM for crash recovery
        if (command) {
          fetch('/api/am/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tabId: tabId,
              tabName: tabNameRef.current || 'Terminal',
              workspace: window.location.pathname,
              entryType: 'COMMAND_EXECUTED',
              content: command,
            }),
          }).catch(err => console.warn('[AM] Failed to log command:', err));
        }

        return true;
      }
      console.warn('[Terminal] Cannot send command - WebSocket not connected');
      return false;
    },
    pasteCommand: (text) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Sanitize text: replace all newlines/carriage returns with spaces
        // This prevents each line from being executed as a separate command
        const sanitized = text.replace(/[\r\n]+/g, ' ').trim();
        
        // CRITICAL FIX: Write to local terminal FIRST so user sees what was pasted
        // The backend will echo it back, but that can be delayed
        if (xtermRef.current && sanitized) {
          xtermRef.current.write(sanitized);
        }
        
        // Send text WITHOUT Enter key - user can continue typing
        wsRef.current.send(sanitized);
        
        // Always log user input to AM for crash recovery
        if (sanitized) {
          fetch('/api/am/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tabId: tabId,
              tabName: tabNameRef.current || 'Terminal',
              workspace: window.location.pathname,
              entryType: 'USER_INPUT',
              content: sanitized,
            }),
          }).catch(err => console.warn('[AM] Failed to log user input:', err));
        }
        
        return true;
      }
      console.warn('[Terminal] Cannot paste - WebSocket not connected');
      return false;
    },
    focus: () => {
      if (xtermRef.current) {
        xtermRef.current.focus();
      }
    },
    isConnected: () => { return wsRef.current && wsRef.current.readyState === WebSocket.OPEN; }, getTerminal: () => xtermRef.current, getSocket: () => wsRef.current, wsRef: wsRef, terminal: xtermRef.current, reconnect: () => {
      // Clear any pending reconnection timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Reset reconnection attempts
      reconnectAttemptsRef.current = 0;
      
      // Close existing connection
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      // Clear terminal
      if (xtermRef.current) {
        xtermRef.current.clear();
        xtermRef.current.write('\r\n\x1b[38;2;249;115;22m[Forge Terminal]\x1b[0m Reconnecting...\r\n\r\n');
      }
      // Reconnect with new shell config
      if (connectFnRef.current) {
        connectFnRef.current();
      }
    },
    // Search methods
    findNext: (query) => {
      if (searchAddonRef.current && query) {
        return searchAddonRef.current.findNext(query, { caseSensitive: false, wholeWord: false, regex: false });
      }
      return false;
    },
    findPrevious: (query) => {
      if (searchAddonRef.current && query) {
        return searchAddonRef.current.findPrevious(query, { caseSensitive: false, wholeWord: false, regex: false });
      }
      return false;
    },
    clearSearch: () => {
      if (searchAddonRef.current) {
        searchAddonRef.current.clearDecorations();
      }
    },
    scrollToBottom: () => {
      if (xtermRef.current) {
        xtermRef.current.scrollToBottom();
        setShowScrollButton(false);
      }
    },
    isWaitingForPrompt: () => isWaiting,
  }), [isWaiting]); // Only update when state changes

  // Vision action handler
  const handleVisionAction = useCallback((action) => {
    if (action.type === 'INJECT_COMMAND' && action.command) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(action));
        logger.terminal('Vision command injected', { tabId, command: action.command });
      }
    } else if (action.type === 'SHOW_ERROR' && action.message) {
      // Show error via terminal write
      if (xtermRef.current) {
        xtermRef.current.writeln(`\r\n\x1b[31mError: ${action.message}\x1b[0m\r\n`);
      }
    }
  }, [tabId]);
  
  // Update terminal theme when theme or colorTheme prop changes
  useEffect(() => {
    if (xtermRef.current) {
      const term = xtermRef.current;
      const newTheme = getTerminalTheme(colorTheme, theme);
      
      logger.terminal('Theme updated', { 
        tabId, 
        colorTheme, 
        baseTheme: theme,
        isVisible 
      });
      
      term.options.theme = newTheme;
      // Force background update
      if (terminalRef.current) {
        terminalRef.current.style.backgroundColor = newTheme.background;
      }
      term.refresh(0, term.rows - 1);
    }
  }, [theme, colorTheme, tabId, isVisible]);

  // Handle fontSize changes
  useEffect(() => {
    if (xtermRef.current && fitAddonRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      fitAddonRef.current.fit();
    }
  }, [fontSize]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Record init event for diagnostics
    diagnosticCore.recordInitEvent('terminal_mounting', { tabId });

    // Initialize xterm.js
    const initialTheme = getTerminalTheme(colorTheme, theme);
    const term = new Terminal({
      cursorBlink: true,
      fontSize: fontSize,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, Monaco, monospace',
      theme: initialTheme,
      allowProposedApi: true,
      scrollback: 5000,
      clipboardMode: 'off', // Disabled: we handle Ctrl+V ourselves in custom handler
    });

    // Add fit addon
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;
    
    // Critical fix: Re-focus after fit addon loads (it steals focus during init)
    queueMicrotask(() => {
      term.focus();
    });

    // Add search addon
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;
    
    // Critical fix: Re-focus after search addon loads
    queueMicrotask(() => {
      term.focus();
    });

    // Open terminal
    term.open(terminalRef.current);
    xtermRef.current = term;
    diagnosticCore.recordInitEvent('xterm_created', { tabId });
    
    // CYPRESS TESTING: Expose terminal instance for E2E tests
    // This allows cy.getTerminalOutput() to read the actual buffer
    if (window.Cypress) {
      window.term = term;
    }
    
    // Critical fix: Force focus immediately after terminal.open()
    // This ensures the terminal textarea receives focus before React re-renders
    queueMicrotask(() => {
      term.focus();
    });

    // ROBUST PASTE HANDLER: Listen for the native paste event on the textarea
    // This works even when navigator.clipboard.read() is blocked or fails
    // We use the container and capture phase to ensure we get the event before xterm swallows it
    // v3.8.2: Now handles BOTH images AND text for faster paste (no async clipboard API)
    // v3.9.8: Enhanced with video support and better agent visibility metadata
    // v3.9.8: Added fallback for clipboard permission issues
    // v3.11.1: Fixed paste reliability - this is now the PRIMARY handler
    // The Ctrl+V handler just lets the event through, and uses clipboard API as fallback
    const handlePaste = async (e) => {
      // v3.11.1: Mark that paste event fired and is handling it
      // This tells the Ctrl+V fallback not to run
      isPastingRef.current = true;
      setTimeout(() => { isPastingRef.current = false; }, 500);
      
      // v3.11.3 FIX: Check for images/videos FIRST before text
      // Some screenshot tools put file path as text AND image in clipboard
      // We want the image, not the path!
      if (e.clipboardData) {
        const text = e.clipboardData.getData('text/plain');
        const hasMedia = Array.from(e.clipboardData.items || []).some(item => 
          item.type.startsWith('image/') || item.type.startsWith('video/')
        );
        
        // If there's BOTH text and media, prioritize media (don't send text path)
        if (hasMedia) {
          console.log('[Terminal] Media detected in clipboard, ignoring text path');
          // Fall through to media handling below
        } else if (text) {
          // Text-only paste: Send directly to PTY
          e.preventDefault();
          e.stopPropagation();
          
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('[Terminal] Paste event - sending text directly:', text.length, 'chars');
            wsRef.current.send(text);
            // Enhanced toast with character count
            if (onPasteRef.current) onPasteRef.current('text', { chars: text.length });
          } else {
            console.warn('[Terminal] WebSocket not ready for paste');
          }
          return;
        }
        
        // Check for images or videos in the paste event
        if (e.clipboardData.items) {
          let mediaFound = false;
          for (const item of e.clipboardData.items) {
            const isImage = item.type.startsWith('image/');
            const isVideo = item.type.startsWith('video/');
            
            if (isImage || isVideo) {
              mediaFound = true;
              e.preventDefault(); // Stop xterm from handling it
              e.stopPropagation(); // Stop bubbling
              
              const mediaType = isImage ? 'image' : 'video';
              const mimeType = item.type;
              console.log(`[Terminal] ${mediaType} detected in paste event:`, mimeType);
              
              try {
                const blob = item.getAsFile();
                if (!blob) continue;
                
                // Get file size for metadata
                const fileSizeKB = Math.round(blob.size / 1024);
                const fileSizeMB = (blob.size / (1024 * 1024)).toFixed(2);
                
                // Determine extension from MIME type
                const extMap = {
                  'image/png': '.png',
                  'image/jpeg': '.jpg',
                  'image/gif': '.gif',
                  'image/webp': '.webp',
                  'image/bmp': '.bmp',
                  'video/mp4': '.mp4',
                  'video/webm': '.webm',
                  'video/quicktime': '.mov',
                  'video/x-msvideo': '.avi',
                };
                const ext = extMap[mimeType] || (isImage ? '.png' : '.mp4');
                
                const formData = new FormData();
                const filename = `clipboard-${Date.now()}${ext}`;
                formData.append('file', blob, filename);
                
                // Show uploading indicator with media type
                if (xtermRef.current) {
                  const sizeStr = fileSizeKB > 1024 ? `${fileSizeMB}MB` : `${fileSizeKB}KB`;
                  xtermRef.current.write(`\x1b[33m[Uploading ${mediaType} (${sizeStr})...]\x1b[0m`);
                }
                
                const response = await fetch('/api/files/upload', {
                  method: 'POST',
                  body: formData
                });
                
                if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
                
                const data = await response.json();
                const filePath = data.path;
                
                // Clear uploading indicator
                if (xtermRef.current) {
                  xtermRef.current.write('\r\x1b[K');
                }
                
                // Handle video frame extraction results
                let framePaths = [];
                let ffmpegAvailable = false;
                if (data.isVideo) {
                  ffmpegAvailable = data.ffmpegAvailable;
                  framePaths = data.framePaths || [];
                  
                  if (!ffmpegAvailable) {
                    // ffmpeg not installed - warn user
                    if (xtermRef.current) {
                      xtermRef.current.write(`\x1b[33m[Note: Install ffmpeg to enable video frame extraction for AI agents]\x1b[0m\r\n`);
                    }
                  } else if (framePaths.length > 0) {
                    // Show frame extraction success
                    if (xtermRef.current) {
                      xtermRef.current.write(`\x1b[32m[Extracted ${framePaths.length} frames for AI visibility]\x1b[0m\r\n`);
                    }
                  }
                }
                
                // Send file path(s) to terminal with enhanced format for agent visibility
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  // For videos with extracted frames, send frame paths instead
                  // AI agents can understand images, not video files
                  if (isVideo && framePaths.length > 0) {
                    // Send each frame path for the agent to see
                    for (let i = 0; i < framePaths.length; i++) {
                      const framePath = framePaths[i];
                      const pathStr = framePath.includes(' ') ? `"${framePath}"` : framePath;
                      const textToSend = `see file at ${pathStr}`;
                      wsRef.current.send(textToSend);
                      // Small delay between frames to avoid overwhelming
                      if (i < framePaths.length - 1) {
                        await new Promise(r => setTimeout(r, 100));
                      }
                    }
                    console.log(`[Terminal] Sent ${framePaths.length} video frames to backend`);
                  } else {
                    // For images (or videos without frame extraction), send the file path
                    const pathStr = filePath.includes(' ') ? `"${filePath}"` : filePath;
                    const textToSend = `see file at ${pathStr}`;
                    wsRef.current.send(textToSend);
                    console.log(`[Terminal] Sent ${mediaType} path to backend:`, textToSend);
                  }
                  
                  // Enhanced callback with metadata for better toast
                  if (onPasteRef.current) {
                    onPasteRef.current(mediaType, {
                      filename,
                      path: filePath,
                      size: blob.size,
                      sizeKB: fileSizeKB,
                      mimeType,
                      framePaths: framePaths,
                      frameCount: framePaths.length,
                      ffmpegAvailable,
                    });
                  }
                }
              } catch (err) {
                logPasteError(err, { 
                  location: 'handlePaste-imageUpload',
                  mimeType,
                  blobSize: blob?.size 
                });
                console.error(`[Terminal] ${mediaType} upload failed:`, err);
                if (xtermRef.current) {
                  xtermRef.current.write(`\r\x1b[K\x1b[31m[${mediaType} upload failed: ${err.message}]\x1b[0m\r\n`);
                }
                // Still return - we handled the paste, just failed to upload
                return;
              }
              break; // Only handle one media item
            }
          }
          
          if (mediaFound) return;
        }
      }
      
      // v3.9.8 FALLBACK: If clipboardData was empty or we couldn't get text,
      // try the async clipboard API as a last resort
      // This handles edge cases where the paste event fires but clipboardData is empty
      // BUT only if we haven't already processed media above
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const fallbackText = await navigator.clipboard.readText();
          if (fallbackText && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Terminal] Paste fallback - async clipboard API:', fallbackText.length, 'chars');
            wsRef.current.send(fallbackText);
            if (onPasteRef.current) onPasteRef.current('text', { chars: fallbackText.length });
            return;
          }
        }
      } catch (clipboardErr) {
        // Clipboard permission denied - only show error if we have no other content
        // This avoids showing paste error when image upload is in progress
        console.warn('[Terminal] Clipboard API permission denied:', clipboardErr.message);
        // Don't show error toast - the paste event handler in the native event
        // may still work, or the user can right-click paste
      }
    };

    // v3.12.3 FIX: Attach paste listener to BOTH the container AND the xterm textarea
    // The xterm textarea is where paste events actually fire when clipboardMode is 'off'
    if (terminalRef.current) {
      // Container listener (capture phase) - catches paste from anywhere in the terminal area
      terminalRef.current.addEventListener('paste', handlePaste, true);
      
      // Also attach to the xterm textarea directly - this is where keyboard paste events fire
      const xtermTextarea = terminalRef.current.querySelector('.xterm-helper-textarea');
      if (xtermTextarea) {
        xtermTextarea.addEventListener('paste', handlePaste, true);
        console.log('[Terminal] Paste listener attached to xterm textarea');
      } else {
        console.warn('[Terminal] xterm textarea not found - paste may not work reliably');
      }
    }

    // VS Code proven solution: Use xterm's attachCustomKeyEventHandler
    // This runs BEFORE xterm processes the key and allows conditional intercept
    term.attachCustomKeyEventHandler((arg) => {
      // PERF FIX: Only record diagnostics when explicitly enabled (avoid function call overhead)
      if (diagnosticCore.isEnabled()) {
        diagnosticCore.recordKeyboardEvent(arg);
      }

      // CRITICAL FIX: Explicitly allow spacebar no matter what
      // This prevents xterm from blocking spacebar due to event bubbling issues
      if (arg.code === 'Space') {
        return true;
      }
      
      // v3.12.13 FIX: Remove Backspace interception - let xterm handle it naturally
      // The previous "fix" that sent \x7f directly caused freezing issues with Copilot CLI
      // because xterm's internal state wasn't updated. By returning true, xterm will:
      // 1. Process the backspace locally (update cursor position, etc.)
      // 2. Call onData() with the correct character (\x7f or \x08)
      // 3. We send that via websocket in the onData handler
      // This is the standard flow and works with all CLIs.
      if (arg.code === 'Backspace') {
        return true; // Let xterm handle backspace naturally
      }
      
      // Handle Ctrl+C (Copy vs Interrupt)
      if (arg.ctrlKey && arg.code === 'KeyC' && arg.type === 'keydown') {
        // Prevent spamming copy operations which can crash the renderer
        if (isCopyingRef.current) {
          return false;
        }

        const selection = term.getSelection();
        
        if (selection) {
          // If there is a selection, COPY it
          isCopyingRef.current = true;
          console.log('[Terminal] Ctrl+C with selection - copying to clipboard');
          
          navigator.clipboard.writeText(selection)
            .then(() => {
              console.log('[Terminal] Copied to clipboard:', selection.length, 'chars');
              if (onCopyRef.current) {
                onCopyRef.current();
              }
            })
            .catch((err) => {
              console.error('[Terminal] Clipboard write failed:', err);
            })
            .finally(() => {
              // Add a small delay before allowing another copy to prevent rapid-fire events
              setTimeout(() => {
                isCopyingRef.current = false;
              }, 200);
            });
          
          return false; // Prevent xterm from handling (blocking the SIGINT)
        }
        
        // If NO selection, return true to let xterm handle it
        // xterm will send the standard \x03 (SIGINT) to your Go backend
        console.log('[Terminal] Ctrl+C without selection - letting xterm send SIGINT');
        return true;
      }

      // v3.12.8 FIX: Revert to v3.8.1 SIMPLE approach - directly read clipboard on Ctrl+V
      // PROBLEM: The complex approach (return true, wait for paste event, fallback timer) is UNRELIABLE
      // because xterm has clipboardMode: 'off' and native paste events don't fire consistently.
      // SOLUTION: Directly read clipboard using navigator.clipboard.read() API, handle all media types,
      // then return false to prevent xterm from doing anything. Simple and reliable.
      if (arg.ctrlKey && arg.code === 'KeyV' && arg.type === 'keydown') {
        console.log('[Terminal] Ctrl+V pressed - reading clipboard directly (v3.12.8 simple approach)');
        isPastingRef.current = true;
        setTimeout(() => { isPastingRef.current = false; }, 500);

        // Immediately read clipboard and handle all content types
        (async () => {
          try {
            // Try navigator.clipboard.read() first - this supports images AND text
            const items = await navigator.clipboard.read();

            for (const item of items) {
              // Check for images or videos FIRST - these need special upload handling
              const imageType = item.types.find(t => t.startsWith('image/'));
              const videoType = item.types.find(t => t.startsWith('video/'));
              const mediaType = imageType || videoType;

              if (mediaType) {
                const isImage = !!imageType;
                const mediaKind = isImage ? 'image' : 'video';
                console.log(`[Terminal] Found ${mediaKind} in clipboard:`, mediaType);
                const blob = await item.getType(mediaType);

                // Get file size for metadata
                const fileSizeKB = Math.round(blob.size / 1024);
                const fileSizeMB = (blob.size / (1024 * 1024)).toFixed(2);
                const sizeStr = fileSizeKB > 1024 ? `${fileSizeMB}MB` : `${fileSizeKB}KB`;

                // Determine extension from MIME type
                const extMap = {
                  'image/png': '.png',
                  'image/jpeg': '.jpg',
                  'image/gif': '.gif',
                  'image/webp': '.webp',
                  'video/mp4': '.mp4',
                  'video/webm': '.webm',
                  'video/quicktime': '.mov',
                };
                const ext = extMap[mediaType] || (isImage ? '.png' : '.mp4');

                // Show uploading indicator
                if (xtermRef.current) {
                  xtermRef.current.write(`\x1b[33m[Uploading ${mediaKind} (${sizeStr})...]\x1b[0m`);
                }

                const formData = new FormData();
                const filename = `clipboard-${Date.now()}${ext}`;
                formData.append('file', blob, filename);

                const response = await fetch('/api/files/upload', {
                  method: 'POST',
                  body: formData
                });

                if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);

                const data = await response.json();
                const filePath = data.path;

                // Clear uploading indicator
                if (xtermRef.current) {
                  xtermRef.current.write('\r\x1b[K');
                }

                // Handle video frame extraction results
                let framePaths = [];
                let ffmpegAvailable = false;
                const isVideo = !isImage;
                if (data.isVideo) {
                  ffmpegAvailable = data.ffmpegAvailable;
                  framePaths = data.framePaths || [];

                  if (!ffmpegAvailable) {
                    if (xtermRef.current) {
                      xtermRef.current.write(`\x1b[33m[Note: Install ffmpeg to enable video frame extraction for AI agents]\x1b[0m\r\n`);
                    }
                  } else if (framePaths.length > 0) {
                    if (xtermRef.current) {
                      xtermRef.current.write(`\x1b[32m[Extracted ${framePaths.length} frames for AI visibility]\x1b[0m\r\n`);
                    }
                  }
                }

                // Send file path(s) to terminal
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  if (isVideo && framePaths.length > 0) {
                    // Send each frame path for the agent to see
                    for (let i = 0; i < framePaths.length; i++) {
                      const framePath = framePaths[i];
                      const pathStr = framePath.includes(' ') ? `"${framePath}"` : framePath;
                      wsRef.current.send(`see file at ${pathStr}`);
                      if (i < framePaths.length - 1) {
                        await new Promise(r => setTimeout(r, 100));
                      }
                    }
                    console.log(`[Terminal] Sent ${framePaths.length} video frames to PTY`);
                  } else {
                    const pathStr = filePath.includes(' ') ? `"${filePath}"` : filePath;
                    const textToSend = `see file at ${pathStr}`;
                    wsRef.current.send(textToSend);
                    console.log(`[Terminal] Sent ${mediaKind} path to PTY:`, textToSend);
                  }

                  if (onPasteRef.current) {
                    onPasteRef.current(mediaKind, {
                      filename,
                      path: filePath,
                      size: blob.size,
                      sizeKB: fileSizeKB,
                      mimeType: mediaType,
                      framePaths,
                      frameCount: framePaths.length,
                      ffmpegAvailable,
                    });
                  }
                }
                return; // Done - we found and handled media
              }

              // Check for text in items (after checking for media)
              const textType = item.types.find(t => t === 'text/plain');
              if (textType) {
                const textBlob = await item.getType(textType);
                const text = await textBlob.text();
                if (text && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  console.log('[Terminal] Pasting text from clipboard:', text.length, 'chars');
                  wsRef.current.send(text);
                  if (onPasteRef.current) onPasteRef.current('text', { chars: text.length });
                  return; // Done - we found and handled text
                }
              }
            }
          } catch (readErr) {
            // navigator.clipboard.read() failed - try readText() as fallback (text-only)
            console.warn('[Terminal] clipboard.read() failed, trying readText():', readErr.message);

            try {
              const text = await navigator.clipboard.readText();
              if (text && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                console.log('[Terminal] Pasting text via readText() fallback:', text.length, 'chars');
                wsRef.current.send(text);
                if (onPasteRef.current) onPasteRef.current('text', { chars: text.length });
                return;
              }
            } catch (textErr) {
              console.error('[Terminal] All clipboard read methods failed:', textErr.message);
              logPasteError(textErr, { location: 'ctrlV-allFallbacksFailed' });
            }
          }
        })();

        // Return FALSE to prevent xterm from handling (we handle everything above)
        // This is the key difference from the broken v3.12.2-v3.12.7 approach
        return false;
      }

      return true; // Let all other keys pass through standard xterm processing
    });

    // Initial fit - PERFORMANCE FIX: Call directly instead of setTimeout(0)
    fitAddon.fit();
    // Critical fix: Re-focus after fit() call (fit triggers hidden re-render)
    queueMicrotask(() => {
      term.focus();
    });

    // Record that handlers are now attached
    diagnosticCore.recordInitEvent('handlers_attached', { tabId });

    // Connect to WebSocket
    const connectWebSocket = () => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Use window.location.host to respect the current port (3000)
      // If running in dev mode (Vite on 5173), we might need to proxy, but the built app runs on 3000.
      // The issue might be if window.location.host is somehow 9000?
      // No, the user said they are on 3000.
      // Wait, if the user is seeing 9000 in logs, maybe they are running the Vite dev server?
      // But I built the app and am serving it via Go.
      
      // Let's ensure we use the current host.
      let wsUrl = `${wsProtocol}//${window.location.host}/ws`;
      
      // Add shell config query params
      const cfg = shellConfigRef.current;
      const params = new URLSearchParams();
      // CRITICAL: Pass tabID for AM/LLM logging
      params.set('tabId', tabId);
      if (cfg && cfg.shellType) {
        params.set('shell', cfg.shellType);
        if (cfg.shellType === 'wsl') {
          if (cfg.wslDistro) params.set('distro', cfg.wslDistro);
          if (cfg.wslHomePath) params.set('wslHome', cfg.wslHomePath);
        } else if (cfg.shellType === 'cmd') {
          if (cfg.cmdHomePath) params.set('cmdHome', cfg.cmdHomePath);
        } else if (cfg.shellType === 'powershell') {
          if (cfg.psHomePath) params.set('psHome', cfg.psHomePath);
        }
      }
      wsUrl += '?' + params.toString();

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        logger.terminal('WebSocket connected', { 
          tabId, 
          shellType: cfg?.shellType,
          wsUrl: wsUrl.replace(window.location.host, '[host]'),
          reconnectAttempts: reconnectAttemptsRef.current
        });
        
        // Capture reconnect state BEFORE resetting
        const wasReconnection = reconnectAttemptsRef.current > 0;
        
        // Reset reconnection state
        reconnectAttemptsRef.current = 0;
        setReconnecting(false);
        setIsConnected(true);
        
        // Use orange for the welcome message to match theme
        const shellLabel = cfg?.shellType ? ` (${cfg.shellType.toUpperCase()})` : '';
        const reconnectLabel = wasReconnection ? ' [Reconnected]' : '';
        term.write(`\r\n\x1b[38;2;249;115;22m[Forge Terminal]\x1b[0m Connected${shellLabel}${reconnectLabel}.\r\n\r\n`);

        // Send initial size
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        logger.terminal('Initial size sent', { tabId, cols, rows });

        // Restore directory if available
        if (currentDirectoryRef.current) {
          const dir = currentDirectoryRef.current;
          logger.terminal('Restoring directory', { tabId, directory: dir });
          
          // PERFORMANCE FIX: Increased delay from 100ms to 800ms
          // 100ms was too aggressive for some systems causing directory restore to fail
          // when the shell wasn't fully ready to receive input
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              // Different cd command syntax for different shells
              const shellType = cfg?.shellType || 'powershell';
              let cdCommand = '';
              
              if (shellType === 'wsl') {
                // For bash/WSL: Don't quote if path starts with ~, bash needs to expand it
                // For paths with spaces, escape them instead of quoting the whole path
                if (dir.startsWith('~')) {
                  cdCommand = `cd ${dir.replace(/ /g, '\\ ')}\r`;
                } else {
                  cdCommand = `cd "${dir}"\r`;
                }
              } else if (shellType === 'cmd') {
                // CMD needs /d flag to change drive too
                cdCommand = `cd /d "${dir}"\r`;
              } else {
                // PowerShell
                cdCommand = `cd "${dir}"\r`;
              }
              
              ws.send(cdCommand);
              logger.terminal('Directory restore command sent', { tabId, command: cdCommand.trim() });
            }
          }, 800);
        }

        // CRITICAL FIX: Sync auto-respond state to backend SequenceEngine on connect
        // This enables the backend's advanced pattern detection when restoring a session
        if (autoRespondRef.current) {
          ws.send(JSON.stringify({
            type: 'AUTO_RESPOND_TOGGLE',
            enabled: true
          }));
          logger.terminal('Auto-respond backend sync on connect: enabled', { tabId });
        }

        if (onConnectionChange) onConnectionChange(true);
      };

      // =========================================================================
      // PERFORMANCE-OPTIMIZED MESSAGE HANDLER
      // =========================================================================
      // Key optimizations:
      // 1. Minimal work in hot path - just write to terminal
      // 2. Defer expensive operations (regex, directory detection) to idle time
      // 3. Batch AM logging instead of per-message
      // 4. Check JSON type BEFORE parsing to avoid exception spam
      // 5. Use fixed buffer instead of string concatenation
      // =========================================================================

      ws.onmessage = (event) => {
        // CRITICAL: Keep hot path minimal - just write to terminal
        let textData = '';

        if (event.data instanceof ArrayBuffer) {
          // Binary data from PTY - write immediately
          const data = new Uint8Array(event.data);
          term.write(data);
          textData = new TextDecoder().decode(data);
        } else if (typeof event.data === 'string') {
          const str = event.data;
          // PERF FIX: Check for JSON marker BEFORE parsing to avoid exception spam
          if (str.length > 0 && str[0] === '{') {
            try {
              const msg = JSON.parse(str);
              
              // Handle server errors (e.g. failed to start PTY)
              if (msg.error) {
                console.error('[Terminal] Server error:', msg.error);
                if (xtermRef.current) {
                  xtermRef.current.write(`\r\n\x1b[31mError: ${msg.error}\x1b[0m\r\n`);
                }
                // Don't close connection - let normal close handling manage reconnection
                return;
              }
            } catch (e) {
              // Malformed JSON starting with { - just write it
              term.write(str);
              textData = str;
            }
          } else {
            // Regular text - write immediately
            term.write(str);
            textData = str;
          }
        } else {
          term.write(event.data);
          textData = String(event.data);
        }

        // PERF FIX: Append to buffer efficiently (reuse buffer object)
        const buf = outputBufferRef.current;
        buf.data = (buf.data + textData).slice(-800);

        // v3.12.12: AM logging removed

        // Simple debounce pattern matching v1.23.8 proven behavior
        // 1. Cancel any pending check (new data arrived)
        // 2. Schedule a new check after 1500ms of idle time
        // This ensures we only check when the stream settles
        if (waitingCheckIdleRef.current) {
          cancelIdleWork(waitingCheckIdleRef.current);
        }
        
        waitingCheckIdleRef.current = scheduleIdleWork(() => {
          waitingCheckIdleRef.current = null;

          // Update lastOutputRef for compatibility
          lastOutputRef.current = buf.data;

          // Now do the expensive regex work
          const { waiting, responseType, confidence, excluded } = detectCliPrompt(buf.data, false);
          
          // DEBUG: Log auto-respond check (uncomment for debugging)
          if (autoRespondRef.current) {
            console.log('[AutoRespond] Check:', { 
              waiting, 
              responseType, 
              confidence,
              excluded,
              autoRespondEnabled: autoRespondRef.current,
              wsReady: ws.readyState === WebSocket.OPEN,
              bufferLen: buf.data.length
            });
          }

          if (waiting !== isWaitingRef.current) {
            isWaitingRef.current = waiting;
            setIsWaiting(waiting);
            if (onWaitingChange) {
              onWaitingChange(waiting);
            }
          }

          // Directory detection (also uses regex)
          const detectedDir = extractDirectory(buf.data);
          if (detectedDir && detectedDir !== lastDirectoryRef.current) {
            lastDirectoryRef.current = detectedDir;
            const folderName = getFolderName(detectedDir);
            if (folderName && onDirectoryChangeRef.current) {
              onDirectoryChangeRef.current(folderName, detectedDir);
            }
          }

          // Auto-respond logic - CRITICAL: Skip if excluded (model selection, etc.)
          const shouldAutoRespond = waiting && 
            !excluded &&
            autoRespondRef.current && 
            ws.readyState === WebSocket.OPEN;
            
          if (shouldAutoRespond) {
            console.log('[AutoRespond] SENDING response:', { responseType, confidence });
            logger.terminal('Auto-responding to CLI prompt', { tabId, responseType, confidence });
            
            if (responseType === 'enter') {
              ws.send('\r');
            } else {
              ws.send('y\r');
            }
            
            // Clear buffer and state after auto-respond
            buf.data = '';
            lastOutputRef.current = '';
            isWaitingRef.current = false;
            setIsWaiting(false);
            if (onWaitingChange) {
              onWaitingChange(false);
            }
          }
        });
      };

      ws.onerror = (error) => {
        logger.terminal('WebSocket error', { tabId, error: error.message || 'unknown' });
        term.write('\r\n\x1b[1;31m[Error]\x1b[0m Connection error.\r\n');
      };

      ws.onclose = (event) => {
        logger.terminal('WebSocket closed', { tabId, code: event.code, reason: event.reason });
        
        setIsConnected(false);
        if (onConnectionChange) onConnectionChange(false);
        
        // Provide meaningful disconnect messages based on close code
        let disconnectMessage = 'Terminal session ended.';
        let messageColor = '1;33'; // Yellow by default
        let shouldReconnect = false;
        
        switch (event.code) {
          case 1000:
            // Normal closure
            disconnectMessage = 'Session closed normally.';
            break;
          case 1001:
          case 1012:
            disconnectMessage = 'Server is restarting...';
            shouldReconnect = true;
            break;
          case 1006:
            // Abnormal closure (no close frame received) - likely server restart
            disconnectMessage = 'Connection lost. Attempting to reconnect...';
            messageColor = '1;33'; // Yellow
            shouldReconnect = true;
            break;
          case 1011:
            // Server error
            disconnectMessage = 'Server encountered an error.';
            messageColor = '1;31'; // Red
            shouldReconnect = true;
            break;
          case 1013:
            disconnectMessage = 'Server is overloaded, trying again...';
            messageColor = '1;33'; // Yellow
            shouldReconnect = true;
            break;
          case 4000:
            // Custom: PTY process exited - reconnect to get new shell
            disconnectMessage = 'Shell process exited. Reconnecting...';
            shouldReconnect = true;
            break;
          case 4001:
            // Custom: Session timeout - reconnect to restore
            disconnectMessage = 'Session timed out. Reconnecting...';
            shouldReconnect = true;
            break;
          case 4002:
            // Custom: PTY read error - reconnect to recover
            disconnectMessage = 'Terminal read error. Reconnecting...';
            messageColor = '1;31'; // Red
            shouldReconnect = true;
            break;
          case 4003:
            // Custom: Session restart requested - reconnect immediately (5 attempts default)
            disconnectMessage = 'Session restarted. Reconnecting...';
            messageColor = '1;33'; // Yellow
            shouldReconnect = true;
            break;
          default:
            if (event.reason) {
              disconnectMessage = event.reason;
            }
            // For unknown errors, try to reconnect
            shouldReconnect = true;
        }
        
        // Only write to terminal if it's still active (not disposed)
        if (xtermRef.current) {
          term.write(`\r\n\x1b[${messageColor}m[Disconnected]\x1b[0m ${disconnectMessage}\r\n`);
        }
        
        // Attempt reconnection with exponential backoff
        // SAFETY: Only reconnect if we should AND we're not already trying
        if (shouldReconnect && !reconnectTimeoutRef.current) {
          // If we are in dev mode (localhost), retry more times
          const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          const effectiveMaxAttempts = isDev ? 50 : maxReconnectAttempts;
          // Store for display in overlay
          effectiveMaxAttemptsRef.current = effectiveMaxAttempts;

          if (reconnectAttemptsRef.current < effectiveMaxAttempts) {
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 10000); // Cap at 10s, slower backoff
            reconnectAttemptsRef.current += 1;
            setReconnecting(true);
            
            logger.terminal('Scheduling reconnection', { 
              tabId, 
              attempt: reconnectAttemptsRef.current, 
              maxAttempts: effectiveMaxAttempts,
              delay 
            });
            
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null; // Clear ref before reconnecting
              // Only reconnect if the component is still mounted
              if (xtermRef.current && connectFnRef.current) {
                logger.terminal('Attempting reconnection...', { tabId, attempt: reconnectAttemptsRef.current });
                // Write to terminal via ref (not stale closure)
                if (xtermRef.current) {
                  xtermRef.current.write(`\x1b[1;33m[Reconnecting...]\x1b[0m Attempt ${reconnectAttemptsRef.current}/${effectiveMaxAttempts}\r\n`);
                }
                // CRITICAL FIX: Use the stored connect function ref instead of closure
                // This ensures we get the latest connectWebSocket with fresh closures
                connectFnRef.current();
              }
            }, delay);
          } else {
            setReconnecting(false);
            if (xtermRef.current) {
              xtermRef.current.write(`\r\n\x1b[1;31m[Error]\x1b[0m Failed to reconnect after ${effectiveMaxAttempts} attempts. Please refresh the page.\r\n`);
            }
          }
        }
      };

      // Handle terminal input
      term.onData((data) => {
        // PERF FIX: Only record diagnostics when explicitly enabled
        if (diagnosticCore.isEnabled()) {
          diagnosticCore.recordTerminalData(data);
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
          
          // v3.12.12: AM logging removed
          
          // Clear waiting state when user types (they're responding to the prompt)
          // PERF FIX: Use ref instead of state to avoid stale closure
          if (isWaitingRef.current) {
            isWaitingRef.current = false;
            setIsWaiting(false);
            if (onWaitingChange) {
              onWaitingChange(false);
            }
            logger.terminal('Waiting state cleared by user input', { tabId });
          }
        }
      });

      // Handle terminal resize
      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
      
      // Track scroll position to show/hide scroll button
      const viewport = terminalRef.current?.querySelector('.xterm-viewport');
      if (viewport) {
        const checkScroll = () => {
          const isAtBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 50;
          setShowScrollButton(!isAtBottom);
        };
        viewport.addEventListener('scroll', checkScroll);
      }

      return ws;
    };

    // Store connect function for reconnect
    connectFnRef.current = connectWebSocket;

    // Initial connection
    connectWebSocket();

    // Handle window resize
    const debouncedFit = debounce(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }, 100);

    window.addEventListener('resize', debouncedFit);

    const resizeObserver = new ResizeObserver(() => {
      debouncedFit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      // v3.12.3: Clean up paste event listeners
      if (terminalRef.current) {
        terminalRef.current.removeEventListener('paste', handlePaste, true);
        const xtermTextarea = terminalRef.current.querySelector('.xterm-helper-textarea');
        if (xtermTextarea) {
          xtermTextarea.removeEventListener('paste', handlePaste, true);
        }
      }

      window.removeEventListener('resize', debouncedFit);
      resizeObserver.disconnect();

      // PERF FIX: Cancel idle callbacks instead of timeouts
      if (waitingCheckIdleRef.current) {
        cancelIdleWork(waitingCheckIdleRef.current);
        waitingCheckIdleRef.current = null;
      }

      // v3.12.12: AM logging cleanup removed - AM feature deprecated

      // Clear buffer
      outputBufferRef.current = { data: '', writePos: 0 };

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Remove onclose handler before closing to avoid race condition
        // (component unmount is intentional, not a disconnect to display)
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }
      xtermRef.current = null;
    };
  }, []); // Only run once on mount, theme updates handled by other effect

  const handleScrollToBottom = () => {
    if (xtermRef.current) {
      xtermRef.current.scrollToBottom();
      setShowScrollButton(false);
    }
  };

  return (
    <div ref={containerRef} className={`terminal-outer-container ${className || ''}`} style={style}>
      {/* Connection Status Indicator */}
      {!isConnected && (
        <div className="terminal-connection-overlay">
          <div className="connection-status">
            {reconnecting ? (
              <>
                <div className="spinner"></div>
                <span>Reconnecting... (Attempt {reconnectAttemptsRef.current}/{effectiveMaxAttemptsRef.current})</span>
              </>
            ) : (
              <>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠ Disconnected</span>
                <button
                  className="btn btn-primary" 
                  onClick={() => {
                    if (xtermRef.current) {
                      xtermRef.current.clear();
                    }
                    reconnectAttemptsRef.current = 0;
                    if (connectFnRef.current) {
                      connectFnRef.current();
                    }
                  }}
                  style={{ marginTop: '10px' }}
                >
                  Reconnect Terminal
                </button>
                <small style={{ marginTop: '8px', opacity: 0.7 }}>
                  The terminal connection was lost. Click to reconnect.
                </small>
              </>
            )}
          </div>
        </div>
      )}
      <div
        ref={terminalRef}
        className="terminal-inner"
        onClick={() => {
          // Fix spacebar issue: focus terminal on click
          if (xtermRef.current) {
            xtermRef.current.focus();
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: getTerminalTheme(colorTheme, theme).background,
          cursor: 'text',
        }}
      />
      
      {showScrollButton && isVisible && (
        <button
          className="scroll-to-bottom-btn"
          onClick={handleScrollToBottom}
          title="Scroll to bottom (Ctrl+End)"
          aria-label="Scroll to bottom"
        >
          <ArrowDownToLine size={16} />
        </button>
      )}
    </div>
  );
});

export default ForgeTerminal;


