import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ArrowDownToLine } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { getTerminalTheme } from '../themes';
import { logger } from '../utils/logger';
import { diagnosticCore } from '../utils/diagnosticCore';
import { isLLMCommand } from '../utils/llmDetection';

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

// LLM Brand indicators to boost confidence for generic menus
const LLM_BRAND_PATTERNS = [
  /Copilot/i,
  /Claude/i,
  /Anthropic/i,
  /GitHub\s+CLI/i,
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
  // Optimization: Only check last 15 lines for menus to avoid false positives from history
  // while allowing enough context for multi-line menus
  const lines = cleanText.split(/[\r\n]/);
  const textToCheck = lines.slice(-15).join('\n');

  // Check if "Yes" option is selected (has selection indicator)
  const hasYesSelected = MENU_SELECTION_PATTERNS.some(p => p.test(textToCheck));
  
  if (!hasYesSelected) {
    return { detected: false, confidence: 'low' };
  }
  
  // Check for supporting context (instructions, question, etc.)
  const hasMenuContext = MENU_CONTEXT_PATTERNS.some(p => p.test(textToCheck));
  const hasQuestion = QUESTION_PATTERNS.some(p => p.test(textToCheck));
  const hasTuiFrame = TUI_FRAME_INDICATORS.some(p => p.test(textToCheck));
  
  // Check for LLM Brand indicators (Claude, Copilot) to boost confidence
  const hasLlmBrand = LLM_BRAND_PATTERNS.some(p => p.test(textToCheck));
  
  // High confidence: Yes is selected AND we see menu instructions or TUI frame
  if (hasYesSelected && (hasMenuContext || hasTuiFrame)) {
    return { detected: true, confidence: 'high' };
  }
  
  // Medium confidence: Yes is selected AND (there's a relevant question OR LLM brand detected)
  if (hasYesSelected && (hasQuestion || hasLlmBrand)) {
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
 * Main detection function - determines if CLI is waiting for user input
 * @param {string} text - Raw terminal output buffer
 * @param {boolean} debugLog - Enable debug logging
 * @returns {{ waiting: boolean, responseType: 'enter'|'y-enter'|null, confidence: string, excluded: boolean }}
 */
/**
 * Detect generic interactive prompts (>, ?, :) while excluding shells
 * Used for Context Injection (Priority 4)
 * @param {string} cleanText
 * @returns {{ detected: boolean }}
 */
function detectGeneralInputPrompt(cleanText) {
  const lines = cleanText.split(/[\r\n]/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { detected: false };
  
  const lastLine = lines[lines.length - 1].trim();
  
  // 1. Check for interactive prompt markers at end of line
  const hasPromptMarker = 
    lastLine.endsWith('>') || 
    lastLine.endsWith('›') || // U+203A (Common in modern CLIs)
    lastLine.endsWith('❯') || // U+276F
    lastLine.endsWith('?') ||
    lastLine.endsWith(':');

  if (!hasPromptMarker) return { detected: false };

  // 2. EXCLUDE Known Shell Prompts & REPLs
  
  // Python/Node REPLs (>>> or ... >)
  if (lastLine.endsWith('>>>') || lastLine.endsWith('... >')) return { detected: false };
  
  // PowerShell: PS C:\Path> or PS>
  if (lastLine.match(/^PS\s+/i) || lastLine.includes('PS >')) return { detected: false };
  
  // CMD: C:\Path> (Drive letter + path + >)
  if (lastLine.match(/^[A-Z]:\\.*>$/i)) return { detected: false };
  
  // Bash/Linux Standard: ends with $ or #
  // (We filtered for > ? : above, so $ # are already excluded unless they end with >)
  
  // Path-like prompts ending in > (Common in custom shells)
  // e.g. /home/user/project> 
  if (lastLine.match(/[/\\][^>]*>$/)) return { detected: false };
  
  return { detected: true };
}

function detectCliPrompt(text, debugLog = false) {
  if (!text || text.length < 10) {
    return { waiting: false, responseType: null, confidence: 'none', excluded: false };
  }
  
  // Strip ANSI escape codes
  const cleanText = stripAnsi(text);
  
  // Use smaller buffer for performance (reduced from 2000)
  const bufferToCheck = cleanText.slice(-800);
  
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
  
  // Priority 3: Low confidence menu detection
  if (menuResult.detected && menuResult.confidence === 'low') {
    return { 
      waiting: false, // Prevent accidental injection on loose matches
      responseType: 'enter', 
      confidence: 'low',
      excluded: false
    };
  }

  // Priority 4: General Input Prompt (for Context Injection)
  const generalResult = detectGeneralInputPrompt(bufferToCheck);
  if (generalResult.detected) {
      return { 
          waiting: true, // Signal that we are waiting for input (enables injection)
          responseType: null,
          confidence: 'low',
          excluded: true
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

/**
 * Strip shell decorations from an extracted path so only the filesystem
 * path is kept.  Removes:
 *   - "&&" (command chaining) and everything that follows
 *   - Trailing git-status brackets like "[master *%]"
 *   - Trailing git-status symbols like *, %, ±, ↑, ↓
 */
function sanitizePath(path) {
  if (!path) return path;
  // Remove && (and everything after) — not valid inside a filesystem path
  path = path.replace(/\s*&&.*$/, '');
  // Remove trailing git-status / prompt decoration brackets, e.g. [master *%]
  path = path.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  // Remove stray trailing status glyphs
  path = path.replace(/\s*[*%±↑↓⇡⇣]\s*$/, '').trim();
  return path.trim();
}

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
      return sanitizePath(psMatch[1].trim());
    }
    
    // CMD prompt: "C:\Users\foo>" or "C:\Users\foo>command"
    // Relaxed regex: Don't enforce start of line
    const cmdMatch = line.match(/([A-Za-z]:\\[^>]*?)>/);
    if (cmdMatch) {
      return sanitizePath(cmdMatch[1].trim());
    }
    
    // Bash/WSL prompt with path: "user@host:~/projects$" or "user@host:/home/user$"
    // Also handles: "user@host:~/projects$ " (with trailing space)
    const bashMatch = line.match(/[@][\w.-]+:([~\/][^\$#]*?)[\$#]\s*$/);
    if (bashMatch) {
      return sanitizePath(bashMatch[1].trim());
    }
    
    // Simple bash prompt: "~/projects$ " or "/home/user$ "
    const simpleBashMatch = line.match(/^([~\/][^\$#\s]+)[\$#]\s*$/);
    if (simpleBashMatch) {
      return sanitizePath(simpleBashMatch[1].trim());
    }
    
    // v3.14.8: Additional patterns for more shells
    // Git Bash on Windows: "user@MACHINE MINGW64 ~/projects"
    const gitBashMatch = line.match(/MINGW\d+\s+([~\/][^\$#\s]+)/i);
    if (gitBashMatch) {
      return sanitizePath(gitBashMatch[1].trim());
    }
    
    // Oh My Posh / Starship / Modern prompts that show path before prompt symbol
    // Look for a path-like pattern followed by common prompt indicators (❯, ➜, ›, >)
    const modernPromptMatch = line.match(/([A-Za-z]:[\\\/][^\s❯➜›>]+|[~\/][^\s❯➜›>$#]+)\s*[❯➜›>]\s*$/);
    if (modernPromptMatch) {
      return sanitizePath(modernPromptMatch[1].trim());
    }
    
    // Zsh with path: " ~/projects ❯ " or similar
    const zshMatch = line.match(/([~\/][\w\-./]+)\s+[❯➜›]\s*$/);
    if (zshMatch) {
      return sanitizePath(zshMatch[1].trim());
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
  onFileOpen = null, // Callback when file path is double-clicked to open in editor
  shellConfig = null, // { shellType: 'powershell'|'cmd'|'wsl', wslDistro: string, wslHomePath: string }
  tabId = null, // Unique identifier for this terminal tab
  tabName = null, // Tab display name
  isVisible = true, // Whether this terminal is currently visible
  // amEnabled = false, // v3.12.12: AM feature removed
  currentDirectory = null, // Current working directory to restore on connect
  visionEnabled = false, // Forge Vision overlay enabled (Dev Mode)
  assistantEnabled = false, // Forge Assistant panel enabled (Dev Mode)
  isAgentMode = false, // New prop: Agent Mode (full screen chat)
  onToast = null, // Optional toast callback for user-visible errors
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
  // const amEnabledRef = useRef(amEnabled); // v3.12.12: AM feature removed
  const tabNameRef = useRef(tabName);
  const lastDirectoryRef = useRef(null);
  const onDirectoryChangeRef = useRef(onDirectoryChange);
  const onCopyRef = useRef(onCopy);
  const onPasteRef = useRef(onPaste);
  const onFileOpenRef = useRef(onFileOpen);
  // v3.12.12: AM logging refs removed - AM feature deprecated
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const maxReconnectAttempts = 15; // Was 5 — increased for robustness during active Copilot work
  // Track effective max for display (higher in dev mode)
  const effectiveMaxAttemptsRef = useRef(maxReconnectAttempts);
  const sessionReattachedRef = useRef(false); // Server restored existing PTY session
  const isCopyingRef = useRef(false); // Prevent clipboard spam
  const isPastingRef = useRef(false); // Prevent double paste handling
  const isVisibleRef = useRef(isVisible); // Track visibility to avoid stale closures in paste handlers
  
  // State for scroll button visibility
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  
  // PERF FIX: Track isWaiting in ref to avoid stale closures in hot paths
  const isWaitingRef = useRef(false);

  // Idle notification: fires a /api/notify POST when terminal output goes silent
  const idleNotifyTimerRef = useRef(null);
  const idleNotifyFiredRef = useRef(false); // fire only once per idle period
  // PERF FIX: Cache notify config to avoid fetching on every PTY message.
  // During fast output (Copilot streaming), the old code fired 50-200+ HTTP
  // requests/sec to /api/notify/config, flooding the browser connection pool
  // and starving the main thread — causing scroll flicker / viewport jumps.
  const idleNotifyCfgRef = useRef(null);
  const idleNotifyCfgFetchedRef = useRef(0); // timestamp of last config fetch

  const resetIdleNotifyTimer = () => {
    idleNotifyFiredRef.current = false;
    if (idleNotifyTimerRef.current) clearTimeout(idleNotifyTimerRef.current);

    const now = Date.now();
    const CONFIG_TTL = 60_000; // re-fetch config at most once per minute

    const applyConfig = (cfg) => {
      if (!cfg) return;
      const isReady = !!cfg.ntfyTopic;
      if (!cfg.idleDetectionEnabled || !isReady) return;
      const ms = (cfg.idleTimeoutSeconds || 30) * 1000;
      idleNotifyTimerRef.current = setTimeout(() => {
        if (idleNotifyFiredRef.current) return;
        idleNotifyFiredRef.current = true;
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '🔔 Forge Terminal: agent is waiting for your response.' }),
        }).then(r => {
          if (!r.ok) r.json().then(e => onToast?.(`Notification failed: ${e.error || r.status}`, 'error')).catch(() => {});
        }).catch(err => onToast?.(`Notification failed: ${err.message}`, 'error'));
      }, ms);
    };

    // Use cached config when available and fresh; fetch only when stale
    if (idleNotifyCfgRef.current && (now - idleNotifyCfgFetchedRef.current) < CONFIG_TTL) {
      applyConfig(idleNotifyCfgRef.current);
    } else {
      fetch('/api/notify/config')
        .then(r => r.json())
        .then(cfg => {
          idleNotifyCfgRef.current = cfg;
          idleNotifyCfgFetchedRef.current = Date.now();
          applyConfig(cfg);
        })
        .catch(() => {});
    }
  };

  // Vision state
  const visionEnabledRef = useRef(visionEnabled);

  // v3.12.12: AM feature removed- amEnabled effect deleted

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
  
  // Keep isVisible ref updated - CRITICAL for paste routing
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);
  
  // Keep onFileOpen ref updated
  useEffect(() => {
    onFileOpenRef.current = onFileOpen;
  }, [onFileOpen]);
  
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
  // v3.17.11: SIMPLIFIED - reverted to v3.16.6 approach
  // The complex hide-fit-reveal logic was needed for display:none transitions
  // but we've reverted to visibility:hidden which doesn't need that complexity
  useEffect(() => {
    if (isVisible && fitAddonRef.current && xtermRef.current) {
      // Small delay to ensure the container is properly sized
      setTimeout(() => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit();
          // Critical fix: Re-focus after fit on visibility change
          queueMicrotask(() => {
            if (xtermRef.current) {
              xtermRef.current.focus();
            }
          });
        }
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
        
        // Send text WITHOUT Enter key - user can continue typing.
        // Do NOT write to xterm locally here — the PTY echoes input back naturally,
        // so a local write would cause the text to appear twice.
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
    sendRaw: (bytes) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(bytes);
        return true;
      }
      return false;
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
      clipboardMode: 'off', // We handle paste exclusively in handlePaste for full control (image/video support)
    });

    // Register OSC handler for directory updates (OSC 9;9;<path>)
    term.parser.registerOscHandler(9, (data) => {
      // data comes in as "9;<path>" (the first 9 is the OSC code, handled by xterm, the rest is payload)
      // Check for the second '9;' which indicates the FT/ConEmu CWD notification
      if (data.startsWith('9;')) {
        const rawPath = data.substring(2);
        // Only trigger update if we have a valid path
        if (rawPath && rawPath.trim().length > 0) {
          const path = sanitizePath(rawPath.trim());
          // Normalize backslashes to forward slashes for consistency
          const normalizedPath = path.replace(/\\/g, '/');
          
          // Extract folder name
          const parts = normalizedPath.split('/').filter(Boolean);
          let folderName = parts.length > 0 ? parts[parts.length - 1] : 'Terminal';
          // Sanitize the folder name too (catches any residual decorations)
          folderName = sanitizePath(folderName);

          // Guard: if the last segment looks like a filename (has a recognisable
          // script/file extension, optionally followed by spaces and extra chars),
          // the shell sent a process/script name rather than a real CWD.
          // Fall back to the parent segment so the tab shows the directory instead.
          const looksLikeFile = /\.(ps1|sh|bat|cmd|py|js|ts|jsx|tsx|rb|pl|php|go|rs|java|c|cpp|cs|lua|swift|kt|exe|msi)(\s.*)?$/i.test(folderName);
          if (looksLikeFile) {
            if (parts.length > 1) {
              folderName = parts[parts.length - 2];
            } else {
              return true; // nothing useful to extract, ignore
            }
          }

          if (onDirectoryChange) {
             onDirectoryChange(folderName, path);
          }
        }
        return true; // handled
      }
      return false; // not handled
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

    // URL link provider — clicking an http(s) URL opens it in a new browser tab.
    // Single-click (no modifier required) matches Forge's file-link UX.
    term.loadAddon(new WebLinksAddon((event, uri) => {
      window.open(uri, '_blank', 'noopener,noreferrer');
    }, { hover: true }));

    // Register custom file path link provider
    // This makes file paths clickable - double-click opens in Monaco editor
    if (onFileOpenRef.current) {
      term.registerLinkProvider({
        provideLinks: (bufferLineNumber, callback) => {
          const lineText = term.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true) || '';
          const links = [];
          
          // File path patterns - detect various formats:
          // - Absolute Unix: /home/user/file.js, /usr/local/bin/app
          // - Absolute Windows: C:\Users\file.py, D:\Projects\src\index.ts
          // - Relative: ./src/app.js, ../config/settings.json, src/index.ts
          // - With line numbers: file.js:10, app.py:42:15
          
          // Pattern 1: Absolute Unix paths
          const unixPattern = /(?:^|\s)([\/][^\s:]+\.[a-zA-Z0-9]+)(?::(\d+))?(?::(\d+))?/g;
          let match;
          while ((match = unixPattern.exec(lineText)) !== null) {
            const filePath = match[1];
            const startIndex = match.index + (match[0].startsWith(' ') ? 1 : 0);
            links.push({
              text: match[0].trim(),
              range: {
                start: { x: startIndex + 1, y: bufferLineNumber },
                end: { x: startIndex + match[0].trim().length + 1, y: bufferLineNumber }
              },
              activate: () => {
                if (onFileOpenRef.current) {
                  const fileName = filePath.split('/').pop();
                  onFileOpenRef.current({ path: filePath, name: fileName });
                }
              }
            });
          }
          
          // Pattern 2: Absolute Windows paths
          const windowsPattern = /(?:^|\s)([A-Z]:\\[^\s:]+\.[a-zA-Z0-9]+)(?::(\d+))?(?::(\d+))?/gi;
          while ((match = windowsPattern.exec(lineText)) !== null) {
            const filePath = match[1];
            const startIndex = match.index + (match[0].startsWith(' ') ? 1 : 0);
            links.push({
              text: match[0].trim(),
              range: {
                start: { x: startIndex + 1, y: bufferLineNumber },
                end: { x: startIndex + match[0].trim().length + 1, y: bufferLineNumber }
              },
              activate: () => {
                if (onFileOpenRef.current) {
                  const fileName = filePath.split('\\').pop();
                  onFileOpenRef.current({ path: filePath, name: fileName });
                }
              }
            });
          }
          
          // Pattern 3: Relative paths (./file.js, ../dir/file.ts, src/app.js)
          const relativePattern = /(?:^|\s)((?:\.\.?\/)?[^\s:\/]+(?:\/[^\s:]+)*\.[a-zA-Z0-9]+)(?::(\d+))?(?::(\d+))?/g;
          while ((match = relativePattern.exec(lineText)) !== null) {
            const filePath = match[1];
            // Skip if it looks like a URL or starts with @ (npm packages)
            if (filePath.includes('://') || filePath.startsWith('@')) continue;
            // Skip common false positives
            if (/^(http|https|ftp|mailto):/.test(filePath)) continue;
            
            const startIndex = match.index + (match[0].startsWith(' ') ? 1 : 0);
            links.push({
              text: match[0].trim(),
              range: {
                start: { x: startIndex + 1, y: bufferLineNumber },
                end: { x: startIndex + match[0].trim().length + 1, y: bufferLineNumber }
              },
              activate: () => {
                if (onFileOpenRef.current) {
                  const fileName = filePath.split('/').pop();
                  onFileOpenRef.current({ path: filePath, name: fileName });
                }
              }
            });
          }
          
          callback(links);
        }
      });
    }

    // Open terminal
    term.open(terminalRef.current);
    xtermRef.current = term;
    diagnosticCore.recordInitEvent('xterm_created', { tabId });

    // Track scroll position to show/hide the "scroll to bottom" button.
    //
    // Two listeners are required because xterm.js 5.x has two separate scroll paths:
    //
    // 1. term.onScroll — fires for keyboard scroll (Page Up/Down), programmatic
    //    scrollToBottom(), and data-driven auto-scroll when new PTY output arrives.
    //    It does NOT fire for mouse wheel scrolling (xterm routes wheel events through
    //    the DOM viewport with suppressScrollEvent:true, bypassing _onScroll.fire).
    //
    // 2. DOM "scroll" on .xterm-viewport — fires for mouse wheel scrolling. xterm's
    //    Viewport.handleWheel() updates scrollTop directly, which triggers this event.
    //    By the time our listener runs, buffer.viewportY is already updated.
    //
    // Using both ensures complete coverage without duplicate listeners on reconnect.
    let scrollRafPending = false;
    const checkScrollPosition = () => {
      if (scrollRafPending) return;
      scrollRafPending = true;
      requestAnimationFrame(() => {
        scrollRafPending = false;
        if (!xtermRef.current) return;
        const buffer = xtermRef.current.buffer.active;
        const isAtBottom = buffer.viewportY >= buffer.baseY;
        setShowScrollButton(!isAtBottom);
      });
    };

    const scrollDisposable = term.onScroll(checkScrollPosition);

    // Mouse wheel scrolling bypasses term.onScroll — listen directly on the DOM viewport.
    const viewport = terminalRef.current.querySelector('.xterm-viewport');
    if (viewport) {
      viewport.addEventListener('scroll', checkScrollPosition, { passive: true });
    }
    
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

    // SINGLE PASTE HANDLER: Handles ALL paste operations (Ctrl+V, right-click, Edit menu).
    // clipboardMode: 'off' prevents xterm from pasting on its own.
    // The Ctrl+V keyboard handler (attachCustomKeyEventHandler) only suppresses ^V from reaching the PTY.
    //
    // WHEN THIS FIRES:
    // - Ctrl+V (browser fires paste event after keydown)
    // - Right-click → Paste
    // - Edit menu → Paste
    const handlePaste = async (e) => {
      // Layer 1: Is this terminal visible?
      if (!isVisibleRef.current) {
        console.log(`[Terminal ${tabId}] Paste ignored - terminal not visible`);
        return;
      }

      // Layer 2: Does this terminal's textarea have focus?
      const xtermTextarea = terminalRef.current?.querySelector('.xterm-helper-textarea');
      const hasFocus = xtermTextarea && document.activeElement === xtermTextarea;
      
      if (!hasFocus) {
        console.log(`[Terminal ${tabId}] Paste ignored - terminal not focused (activeElement: ${document.activeElement?.className})`);
        return;
      }

      // Layer 3: Prevent duplicate handling between our two listeners (container + textarea)
      if (isPastingRef.current) {
        console.log(`[Terminal ${tabId}] Paste ignored - already processing paste`);
        return;
      }

      // This terminal IS focused and should handle the paste
      console.log(`[Terminal ${tabId}] ✅ Handling paste event (focused and visible)`);

      // Mark that we're handling a paste
      isPastingRef.current = true;
      setTimeout(() => { isPastingRef.current = false; }, 500);

      // Prevent browser default paste behavior
      e.preventDefault();
      e.stopPropagation();

      // Try modern clipboard API first (supports images/video)
      try {
        if (navigator.clipboard?.read) {
          console.log('[Terminal] Attempting clipboard.read() for media support');
          const clipboardItems = await navigator.clipboard.read();
          
          for (const item of clipboardItems) {
            // Priority 1: Check for images/video (premium feature)
            const imageType = item.types.find(t => t.startsWith('image/'));
            const videoType = item.types.find(t => t.startsWith('video/'));
            const mediaType = imageType || videoType;
            
            if (mediaType) {
              const isImage = !!imageType;
              const mediaTypeStr = isImage ? 'image' : 'video';
              console.log(`[Terminal] ${mediaTypeStr} found in clipboard:`, mediaType);
              
              const blob = await item.getType(mediaType);
              const fileSizeKB = Math.round(blob.size / 1024);
              const fileSizeMB = (blob.size / (1024 * 1024)).toFixed(2);
              
              const extMap = {
                'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
                'image/webp': '.webp', 'image/bmp': '.bmp', 'video/mp4': '.mp4',
                'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-msvideo': '.avi',
              };
              const ext = extMap[mediaType] || (isImage ? '.png' : '.mp4');
              const filename = `clipboard-${Date.now()}${ext}`;
              
              // Show uploading indicator
              if (xtermRef.current) {
                const sizeStr = fileSizeKB > 1024 ? `${fileSizeMB}MB` : `${fileSizeKB}KB`;
                xtermRef.current.write(`\x1b[33m[Uploading ${mediaTypeStr} (${sizeStr})...]\x1b[0m`);
              }
              
              const formData = new FormData();
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
                
                // Handle video frame extraction
                if (data.isVideo) {
                  if (!data.ffmpegAvailable) {
                    xtermRef.current.write(`\x1b[33m[Note: Install ffmpeg for AI video analysis]\x1b[0m\r\n`);
                  } else if (data.framePaths?.length > 0) {
                    xtermRef.current.write(`\x1b[32m[Extracted ${data.framePaths.length} frames]\x1b[0m\r\n`);
                  }
                }
                
                // Send the file path to the terminal
                if (wsRef.current?.readyState === WebSocket.OPEN && filePath) {
                  const textToSend = `see file at ${filePath}`;
                  xtermRef.current.write(textToSend);
                  wsRef.current.send(textToSend);
                  console.log(`[Terminal] Sent ${mediaTypeStr} path to backend:`, textToSend);
                }
                
                // Show toast
                if (onPasteRef.current) {
                  onPasteRef.current(mediaTypeStr, {
                    filename, path: filePath, size: blob.size, sizeKB: fileSizeKB,
                    mimeType: mediaType, frameCount: data.framePaths?.length || 0,
                    ffmpegAvailable: data.ffmpegAvailable
                  });
                }
              }
              
              return; // Media handled successfully
            }
            
            // Priority 2: Check for text
            if (item.types.includes('text/plain')) {
              const textBlob = await item.getType('text/plain');
              const text = await textBlob.text();
              if (text && xtermRef.current) {
                console.log('[Terminal] Text paste from clipboard.read():', text.length, 'chars');
                xtermRef.current.paste(text);
                if (onPasteRef.current) {
                  onPasteRef.current('text', { chars: text.length });
                }
              }
              return; // Text handled successfully
            }
          }
          
          console.log('[Terminal] clipboard.read() found no usable content');
        }
      } catch (err) {
        // clipboard.read() failed - this is expected in Firefox or if permission denied
        console.log('[Terminal] clipboard.read() not available or failed, using fallback:', err.message);
        // Don't log permission denials as errors (expected behavior)
        if (!err.message.includes('denied') && !err.message.includes('permission')) {
          logPasteError(err, { location: 'clipboard-read-fallback' });
        }
      }
      
      // Fallback: Use traditional e.clipboardData API (works in all browsers for text, some for media)
      if (!e.clipboardData) {
        console.log(`[Terminal ${tabId}] Paste aborted - no clipboard data available`);
        return;
      }
      
      console.log('[Terminal] Using fallback e.clipboardData API');
      const text = e.clipboardData.getData('text/plain');
      const hasMedia = Array.from(e.clipboardData.items || []).some(item => 
        item.type.startsWith('image/') || item.type.startsWith('video/')
      );
      
      // Check for images/videos in clipboardData
      if (hasMedia) {
        console.log('[Terminal] Media detected in e.clipboardData, handling upload');
        
        for (const item of e.clipboardData.items) {
          const isImage = item.type.startsWith('image/');
          const isVideo = item.type.startsWith('video/');
          
          if (isImage || isVideo) {
            const mediaType = isImage ? 'image' : 'video';
            const mimeType = item.type;
            console.log(`[Terminal] ${mediaType} detected:`, mimeType);
            
            try {
              const blob = item.getAsFile();
              if (!blob) continue;
              
              const fileSizeKB = Math.round(blob.size / 1024);
              const fileSizeMB = (blob.size / (1024 * 1024)).toFixed(2);
              
              const extMap = {
                'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
                'image/webp': '.webp', 'image/bmp': '.bmp', 'video/mp4': '.mp4',
                'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-msvideo': '.avi',
              };
              const ext = extMap[mimeType] || (isImage ? '.png' : '.mp4');
              const filename = `clipboard-${Date.now()}${ext}`;
              
              // Show uploading indicator
              if (xtermRef.current) {
                const sizeStr = fileSizeKB > 1024 ? `${fileSizeMB}MB` : `${fileSizeKB}KB`;
                xtermRef.current.write(`\x1b[33m[Uploading ${mediaType} (${sizeStr})...]\x1b[0m`);
              }
              
              const formData = new FormData();
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
                
                // Handle video frame extraction
                if (data.isVideo) {
                  if (!data.ffmpegAvailable) {
                    xtermRef.current.write(`\x1b[33m[Note: Install ffmpeg for AI video analysis]\x1b[0m\r\n`);
                  } else if (data.framePaths?.length > 0) {
                    xtermRef.current.write(`\x1b[32m[Extracted ${data.framePaths.length} frames]\x1b[0m\r\n`);
                  }
                }
                
                // Send the file path to the terminal
                if (wsRef.current?.readyState === WebSocket.OPEN && filePath) {
                  const textToSend = `see file at ${filePath}`;
                  xtermRef.current.write(textToSend);
                  wsRef.current.send(textToSend);
                  console.log(`[Terminal] Sent ${mediaType} path to backend:`, textToSend);
                }
                
                // Show toast
                if (onPasteRef.current) {
                  onPasteRef.current(mediaType, {
                    filename, path: filePath, size: blob.size, sizeKB: fileSizeKB,
                    mimeType, frameCount: data.framePaths?.length || 0,
                    ffmpegAvailable: data.ffmpegAvailable
                  });
                }
              }
            } catch (err) {
              logPasteError(err, { mediaType, location: 'paste-event-media-fallback' });
              console.error(`[Terminal] ${mediaType} upload failed:`, err);
              if (xtermRef.current) {
                xtermRef.current.write(`\r\x1b[K\x1b[31m[Upload failed: ${err.message}]\x1b[0m\r\n`);
              }
            }
            break; // Only handle first media item
          }
        }
        return; // Media handled
      }
      
      // TEXT PASTE: Handle plain text
      if (text) {
        console.log('[Terminal] Text paste from e.clipboardData:', text.length, 'chars');
        if (xtermRef.current) {
          xtermRef.current.paste(text);
          if (onPasteRef.current) {
            onPasteRef.current('text', { chars: text.length });
          }
        }
        return;
      }
      
      console.log('[Terminal] No usable clipboard content found');
    };

    // Attach paste listeners (capture phase) - handles Ctrl+V, right-click, Edit menu
    if (terminalRef.current) {
      // Container listener (capture phase) - catches paste from anywhere in the terminal area
      terminalRef.current.addEventListener('paste', handlePaste, true);
      
      // Also attach to the xterm textarea directly - belt and suspenders
      const xtermTextarea = terminalRef.current.querySelector('.xterm-helper-textarea');
      if (xtermTextarea) {
        xtermTextarea.addEventListener('paste', handlePaste, true);
      }
    }
    
    // Expose xterm paste for testing - allows direct invocation bypassing clipboard
    if (typeof window !== 'undefined') {
      window.__terminalPaste = (text) => {
        if (xtermRef.current) {
          xtermRef.current.paste(text);
          return true;
        }
        return false;
      };
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
      
      // v3.16.14 FIX: Force backspace to work in Copilot TUI
      // PROBLEM: xterm.js sometimes doesn't send backspace in TUI modes (80% failure rate)
      // ROOT CAUSE: When CLIs switch to "application mode" (DECCKM), xterm changes key handling
      // SOLUTION: Intercept backspace and ALWAYS send \x7f, logging for diagnostics
      if (arg.code === 'Backspace' && arg.type === 'keydown') {
        console.log('[Terminal] Backspace intercepted - forcing \\x7f');
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send('\x7f');
          return false; // Prevent xterm from processing (we already sent it)
        }
        // Fallback: let xterm handle if WebSocket not ready
        return true;
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

      // Ctrl+V: suppress the key so xterm doesn't send a literal ^V to the PTY.
      // The actual paste is handled by the 'paste' event listener (handlePaste) below,
      // which uses e.clipboardData (reliable) and navigator.clipboard.read() for images.
      if (arg.ctrlKey && arg.code === 'KeyV' && arg.type === 'keydown') {
        return false; // Prevent xterm from sending ^V to the PTY
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
        // Use currentDirectory as fallback initial dir when no explicit home path is configured.
        // This ensures the PTY starts in the saved directory rather than the process cwd.
        const restoredDir = currentDirectoryRef.current;
        if (cfg.shellType === 'wsl') {
          if (cfg.wslDistro) params.set('distro', cfg.wslDistro);
          if (cfg.wslHomePath) params.set('wslHome', cfg.wslHomePath);
        } else if (cfg.shellType === 'cmd') {
          const cmdHome = cfg.cmdHomePath || restoredDir;
          if (cmdHome) params.set('cmdHome', cmdHome);
        } else if (cfg.shellType === 'powershell') {
          const psHome = cfg.psHomePath || restoredDir;
          if (psHome) params.set('psHome', psHome);
        }
      }
      wsUrl += '?' + params.toString();

      // Pass terminal dimensions in query params so the PTY is created at the
      // correct size before the shell process starts. This prevents TUI apps
      // (e.g. Copilot CLI) from caching a wrong layout based on the 80x24 default.
      if (xtermRef.current) {
        const { cols, rows } = xtermRef.current;
        if (cols > 0 && rows > 0) {
          wsUrl += `&cols=${cols}&rows=${rows}`;
        }
      }

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
        sessionReattachedRef.current = false; // Will be set to true by SESSION_REATTACHED or SESSION_JOINED message
        setReconnecting(false);
        setIsConnected(true);
        
        // Send initial size (always needed — terminal may have been resized during disconnect)
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        logger.terminal('Initial size sent', { tabId, cols, rows });

        // Delay the welcome message briefly to allow SESSION_REATTACHED to arrive first.
        // If the server reattached us to an existing PTY, we suppress the fresh "Connected" 
        // message since the server sends its own "Session Restored" message.
        setTimeout(() => {
          if (sessionReattachedRef.current) {
            // Session was reattached — don't print "Connected" or restore directory
            // (the shell is already running in its previous state)
            logger.terminal('Skipping welcome message — session reattached', { tabId });
          } else {
            // Fresh connection — print welcome message
            const shellLabel = cfg?.shellType ? ` (${cfg.shellType.toUpperCase()})` : '';
            const reconnectLabel = wasReconnection ? ' [Reconnected]' : '';
            if (xtermRef.current) {
              xtermRef.current.write(`\r\n\x1b[38;2;249;115;22m[Forge Terminal]\x1b[0m Connected${shellLabel}${reconnectLabel}.\r\n\r\n`);
            }
          }
        }, 100);

        // Restore directory if available — but ONLY for hidden (non-active) tabs
        // and NEVER for reattached sessions (the shell already has its directory).
        // For the visible/active tab the psHome query param already told the backend to
        // run Set-Location at 100ms, so we don't need to send a visible cd command here
        // (which would clutter the terminal screen).  Hidden tabs can run the cd silently
        // as a belt-and-suspenders fallback without the user ever seeing it.
        if (currentDirectoryRef.current && !isVisibleRef.current && !wasReconnection) {
          const dir = currentDirectoryRef.current;
          logger.terminal('Restoring directory (hidden tab fallback)', { tabId, directory: dir });
          
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              const shellType = cfg?.shellType || 'powershell';
              let cdCommand = '';
              
              if (shellType === 'wsl') {
                cdCommand = dir.startsWith('~') ? `cd ${dir.replace(/ /g, '\\ ')}\r` : `cd "${dir}"\r`;
              } else if (shellType === 'cmd') {
                cdCommand = `cd /d "${dir}"\r`;
              } else {
                cdCommand = `cd "${dir}"\r`;
              }
              
              ws.send(cdCommand);
              logger.terminal('Directory restore command sent (hidden)', { tabId, command: cdCommand.trim() });
            }
          }, 800);
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

              // Handle session reattachment (PTY was kept alive during disconnect)
              if (msg.type === 'SESSION_REATTACHED') {
                logger.terminal('Session reattached', { tabId, detachedDuration: msg.detachedDuration });
                if (xtermRef.current) {
                  const duration = msg.detachedDuration ? ` (disconnected ${Math.round(msg.detachedDuration)}s)` : '';
                  xtermRef.current.write(`\r\n\x1b[38;2;34;197;94m[Session Restored]\x1b[0m Terminal session recovered${duration}.\r\n`);
                }
                sessionReattachedRef.current = true;
                return;
              }

              if (msg.type === 'SESSION_JOINED') {
                logger.terminal('Joined live session', { tabId });
                if (xtermRef.current) {
                  xtermRef.current.write(`\r\n\x1b[38;2;99;102;241m[Forge Remote]\x1b[0m Viewing live terminal session.\r\n`);
                }
                sessionReattachedRef.current = true; // suppress fresh "Connected" banner
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

        // Reset idle notification timer on every chunk of PTY output
        resetIdleNotifyTimer();

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
          const { waiting } = detectCliPrompt(buf.data, false);

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
          case 4004:
            // Custom: System sleep/hibernate - reconnect with extra patience
            disconnectMessage = 'System went to sleep. Reconnecting...';
            messageColor = '1;36'; // Cyan
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
          // Session persistence: server keeps PTY alive for 5 minutes after disconnect.
          // We now retry up to 15 times (was 3) since reconnection actually recovers
          // the live session instead of creating a fresh one.
          const isSystemSleep = event.code === 4004;
          const effectiveMaxAttempts = isSystemSleep ? 20 : 15;
          const baseDelay = isSystemSleep ? 3000 : 1000; // 3s initial delay after sleep for system to stabilize
          // Store for display in overlay
          effectiveMaxAttemptsRef.current = effectiveMaxAttempts;

          if (reconnectAttemptsRef.current < effectiveMaxAttempts) {
            const delay = Math.min(baseDelay * Math.pow(1.5, reconnectAttemptsRef.current), 15000); // Cap at 15s
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

      // Handle terminal input — uses wsRef.current to always reference the LIVE WebSocket.
      // Previously captured the `ws` closure variable, which broke after reconnection.
      term.onData((data) => {
        // v3.16.14: Log backspace to diagnose TUI issues
        if (data === '\x7f' || data === '\x08') {
          console.log('[Terminal] onData backspace:', data === '\x7f' ? '\\x7f (DEL)' : '\\x08 (BS)');
        }
        
        // PERF FIX: Only record diagnostics when explicitly enabled
        if (diagnosticCore.isEnabled()) {
          diagnosticCore.recordTerminalData(data);
        }

        const activeWs = wsRef.current;
        if (activeWs && activeWs.readyState === WebSocket.OPEN) {
          activeWs.send(data);
          
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

      // Handle terminal resize — uses wsRef.current for same reason as onData above.
      term.onResize(({ cols, rows }) => {
        const activeWs = wsRef.current;
        if (activeWs && activeWs.readyState === WebSocket.OPEN) {
          activeWs.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
      
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
      // v3.17.3: Removed document-level listener cleanup (no longer added)
      
      // Clean up test hook
      if (typeof window !== 'undefined') {
        delete window.__terminalPaste;
      }

      window.removeEventListener('resize', debouncedFit);
      resizeObserver.disconnect();

      scrollDisposable.dispose();
      if (viewport) {
        viewport.removeEventListener('scroll', checkScrollPosition);
      }

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


