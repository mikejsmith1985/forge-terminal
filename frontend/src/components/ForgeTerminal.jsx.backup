import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { ArrowDownToLine } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { getTerminalTheme } from '../themes';
import { logger } from '../utils/logger';
import VisionOverlay from './vision/VisionOverlay';
import { diagnosticCore } from '../utils/diagnosticCore';

// Debounce helper for resize events
function debounce(fn, ms) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

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
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
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
];

// Y/N style prompts: These expect typing 'y' or 'n' then Enter
const YN_PROMPT_PATTERNS = [
  // Standard y/n patterns at end of line
  /\(y\/n\)\s*$/i,
  /\[Y\/n\]\s*$/i,
  /\[y\/N\]\s*$/i,
  /\(yes\/no\)\s*$/i,
  /\[yes\/no\]\s*$/i,
  // Question followed by y/n
  /\?\s*\(y\/n\)\s*$/i,
  /\?\s*\[Y\/n\]\s*$/i,
  /\?\s*\[y\/N\]\s*$/i,
  // npm/yarn style
  /\?\s*›?\s*\(Y\/n\)\s*$/i,
  /Are you sure.*\?\s*$/i,
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
  const lines = cleanText.split(/[\r\n]/).filter(l => l.trim());
  const lastLines = lines.slice(-3).join('\n');
  
  const hasYnPrompt = YN_PROMPT_PATTERNS.some(p => p.test(lastLines));
  
  return { detected: hasYnPrompt };
}

/**
 * Main detection function - determines if CLI is waiting for user input
 * @param {string} text - Raw terminal output buffer
 * @param {boolean} debugLog - Enable debug logging
 * @returns {{ waiting: boolean, responseType: 'enter'|'y-enter'|null, confidence: string }}
 */
function detectCliPrompt(text, debugLog = false) {
  if (!text || text.length < 10) {
    return { waiting: false, responseType: null, confidence: 'none' };
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
      confidence: menuResult.confidence 
    };
  }
  
  // Priority 2: Check for Y/N style prompts
  const ynResult = detectYnPrompt(bufferToCheck, debugLog);
  if (ynResult.detected) {
    return { 
      waiting: true, 
      responseType: 'y-enter', 
      confidence: 'high' 
    };
  }
  
  // Priority 3: Low confidence menu detection (still report as waiting but may not auto-respond)
  if (menuResult.detected && menuResult.confidence === 'low') {
    return { 
      waiting: true, 
      responseType: 'enter', 
      confidence: 'low' 
    };
  }
  
  return { waiting: false, responseType: null, confidence: 'none' };
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
    const psMatch = line.match(/^PS\s+([A-Za-z]:\\[^>]*?)>\s*$/i);
    if (psMatch) {
      return psMatch[1];
    }
    
    // CMD prompt: "C:\Users\foo>" or "C:\Users\foo>command"
    const cmdMatch = line.match(/^([A-Za-z]:\\[^>]*?)>/);
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
  shellConfig = null, // { shellType: 'powershell'|'cmd'|'wsl', wslDistro: string, wslHomePath: string }
  tabId = null, // Unique identifier for this terminal tab
  tabName = null, // Tab display name (for AM logging)
  isVisible = true, // Whether this terminal is currently visible
  autoRespond = false, // Auto-respond "yes" to CLI confirmation prompts
  amEnabled = false, // AM (Artificial Memory) logging enabled
  currentDirectory = null, // Current working directory to restore on connect
  visionEnabled = false, // Forge Vision overlay enabled (Dev Mode)
  assistantEnabled = false, // Forge Assistant panel enabled (Dev Mode)
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
  const lastOutputRef = useRef('');
  const waitingCheckTimeoutRef = useRef(null);
  const autoRespondRef = useRef(autoRespond);
  const amEnabledRef = useRef(amEnabled);
  const tabNameRef = useRef(tabName);
  const lastDirectoryRef = useRef(null);
  const onDirectoryChangeRef = useRef(onDirectoryChange);
  const onCopyRef = useRef(onCopy);
  const amLogBufferRef = useRef('');
  const amLogTimeoutRef = useRef(null);
  const amInputBufferRef = useRef('');
  const amInputTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const maxReconnectAttempts = 5;
  
  // State for scroll button visibility
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  
  // Vision state
  const [activeVisionOverlay, setActiveVisionOverlay] = useState(null);
  const visionEnabledRef = useRef(visionEnabled);

  // Keep autoRespond ref updated
  useEffect(() => {
    autoRespondRef.current = autoRespond;
  }, [autoRespond]);

  // Keep amEnabled ref updated
  useEffect(() => {
    amEnabledRef.current = amEnabled;
  }, [amEnabled]);

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
    
    // Clear overlay when disabling
    if (!visionEnabled) {
      setActiveVisionOverlay(null);
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
    sendCommand: (command) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Send the command followed by Enter key
        wsRef.current.send(command + '\r');
        
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
    isConnected: () => {
      return wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
    },
    reconnect: () => {
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
    // Vision overlay control methods
    showVisionOverlay: (overlayConfig) => {
      setActiveVisionOverlay(overlayConfig);
    },
    hideVisionOverlay: () => {
      setActiveVisionOverlay(null);
    },
  }));
  
  // Vision action handler
  const handleVisionAction = useCallback((action) => {
    if (action.type === 'INJECT_COMMAND' && action.command) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(action));
        logger.terminal('Vision command injected', { tabId, command: action.command });
        // Dismiss overlay after action
        setActiveVisionOverlay(null);
      }
    } else if (action.type === 'SHOW_ERROR' && action.message) {
      // Show error via terminal write
      if (xtermRef.current) {
        xtermRef.current.writeln(`\r\n\x1b[31mError: ${action.message}\x1b[0m\r\n`);
      }
    }
  }, [tabId]);
  
  // Vision dismiss handler
  const handleVisionDismiss = useCallback(() => {
    setActiveVisionOverlay(null);
  }, []);

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
    
    // Critical fix: Force focus immediately after terminal.open()
    // This ensures the terminal textarea receives focus before React re-renders
    queueMicrotask(() => {
      term.focus();
    });

    // VS Code proven solution: Use xterm's attachCustomKeyEventHandler
    // This runs BEFORE xterm processes the key and allows conditional intercept
    term.attachCustomKeyEventHandler((arg) => {
      // Record keyboard event for diagnostics
      diagnosticCore.recordKeyboardEvent(arg);
      
      // CRITICAL FIX: Explicitly allow spacebar no matter what
      // This prevents xterm from blocking spacebar due to event bubbling issues
      if (arg.code === 'Space') {
        return true;
      }
      
      // Handle Ctrl+C (Copy vs Interrupt)
      if (arg.ctrlKey && arg.code === 'KeyC' && arg.type === 'keydown') {
        const selection = term.getSelection();
        
        if (selection) {
          // If there is a selection, COPY it
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
            });
          
          return false; // Prevent xterm from handling (blocking the SIGINT)
        }
        
        // If NO selection, return true to let xterm handle it
        // xterm will send the standard \x03 (SIGINT) to your Go backend
        console.log('[Terminal] Ctrl+C without selection - letting xterm send SIGINT');
        return true;
      }

      // Handle Ctrl+V (Paste)
      if (arg.ctrlKey && arg.code === 'KeyV' && arg.type === 'keydown') {
        console.log('[Terminal] Ctrl+V detected - reading from clipboard');
        diagnosticCore.recordPasteEvent('', 'ctrl-v-triggered');
        
        navigator.clipboard.readText()
          .then((text) => {
            console.log('[Terminal] Clipboard read successful:', text.length, 'chars');
            diagnosticCore.recordPasteEvent(text, 'clipboard-read');
            
            // Send the pasted text to Go backend via WebSocket
            // Do NOT term.write(text) here - it will duplicate if backend echoes back
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              diagnosticCore.recordWebSocketEvent('send', { length: text.length, content: text });
              wsRef.current.send(text);
              console.log('[Terminal] Sent pasted text to backend:', text.length, 'chars');
            } else {
              console.warn('[Terminal] WebSocket not ready for paste');
              diagnosticCore.recordWebSocketEvent('error', { reason: 'not-ready-for-paste' });
            }
          })
          .catch((err) => {
            console.error('[Terminal] Clipboard read failed:', err);
          });

        return false; // Prevent xterm from handling this event
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
        
        // Reset reconnection state
        reconnectAttemptsRef.current = 0;
        setReconnecting(false);
        setIsConnected(true);
        
        // Use orange for the welcome message to match theme
        const shellLabel = cfg?.shellType ? ` (${cfg.shellType.toUpperCase()})` : '';
        const reconnectLabel = reconnectAttemptsRef.current > 0 ? ' [Reconnected]' : '';
        term.write(`\r\n\x1b[38;2;249;115;22m[Forge Terminal]\x1b[0m Connected${shellLabel}${reconnectLabel}.\r\n\r\n`);

        // Send initial size
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        logger.terminal('Initial size sent', { tabId, cols, rows });

        // Restore directory if available
        if (currentDirectoryRef.current) {
          const dir = currentDirectoryRef.current;
          logger.terminal('Restoring directory', { tabId, directory: dir });
          
          // PERFORMANCE FIX: Reduce delay from 500ms to 100ms
          // Modern shells are ready almost immediately after PTY connection
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
          }, 100);
        }

        if (onConnectionChange) onConnectionChange(true);
      };

      ws.onmessage = (event) => {
        let textData = '';
        if (event.data instanceof ArrayBuffer) {
          // Binary data from PTY
          const data = new Uint8Array(event.data);
          term.write(data);
          // Convert to string for prompt detection
          textData = new TextDecoder().decode(data);
        } else if (typeof event.data === 'string') {
          // Text data - check if it's a Vision overlay message
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'VISION_OVERLAY') {
              // Vision overlay detected
              logger.terminal('Vision overlay received', { tabId, overlayType: msg.overlayType });
              setActiveVisionOverlay({
                type: msg.overlayType,
                payload: msg.payload
              });
              return; // Don't write to terminal
            }
          } catch (e) {
            // Not JSON, treat as regular text
            term.write(event.data);
            textData = event.data;
          }
        } else {
          // Other text data
          term.write(event.data);
          textData = event.data;
        }
        
        // Accumulate recent output for prompt detection (smaller buffer for performance)
        lastOutputRef.current = (lastOutputRef.current + textData).slice(-1000);
        
        // AM logging: Optimized for performance
        // Only log when AM is explicitly enabled for the tab
        if (amEnabledRef.current && textData) {
          amLogBufferRef.current += textData;
          
          // Debounce AM log writes - flush every 5 seconds (reduced frequency)
          if (amLogTimeoutRef.current) {
            clearTimeout(amLogTimeoutRef.current);
          }
          amLogTimeoutRef.current = setTimeout(() => {
            if (amLogBufferRef.current) {
              const cleanContent = stripAnsi(amLogBufferRef.current);
              if (cleanContent.trim()) {
                // Send to AM API
                fetch('/api/am/log', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    tabId: tabId,
                    tabName: tabNameRef.current || 'Terminal',
                    workspace: window.location.pathname,
                    entryType: 'AGENT_OUTPUT',
                    content: cleanContent.slice(-1500), // Reduced size
                  }),
                }).catch(() => {}); // Silent fail for performance
              }
              amLogBufferRef.current = '';
            }
          }, 5000); // Increased from 2s to 5s
        }
        
        // Debounce waiting check - reduced frequency for performance
        if (waitingCheckTimeoutRef.current) {
          clearTimeout(waitingCheckTimeoutRef.current);
        }
        waitingCheckTimeoutRef.current = setTimeout(() => {
          // Disable debug logging in production for performance
          const debugMode = false;
          
          const { waiting, responseType, confidence } = detectCliPrompt(lastOutputRef.current, debugMode);
          
          if (waiting !== isWaiting) {
            setIsWaiting(waiting);
            if (onWaitingChange) {
              onWaitingChange(waiting);
            }
          }
          
          // Detect directory changes for tab renaming and persistence
          const detectedDir = extractDirectory(lastOutputRef.current);
          if (detectedDir && detectedDir !== lastDirectoryRef.current) {
            lastDirectoryRef.current = detectedDir;
            const folderName = getFolderName(detectedDir);
            if (folderName && onDirectoryChangeRef.current) {
              logger.terminal('Directory changed', { tabId, directory: detectedDir, folderName });
              onDirectoryChangeRef.current(folderName, detectedDir);
            }
          }
          
          // Revert to broader auto-respond behavior (previously more reliable):
          // Auto-respond when a prompt is detected and the tab has Auto-Respond enabled.
          // This avoids missing prompts when detection of LLM-only output is unreliable.
          const shouldAutoRespond = waiting && 
            autoRespondRef.current && 
            ws.readyState === WebSocket.OPEN;
          
          if (shouldAutoRespond) {
            logger.terminal('Auto-responding to CLI prompt', { tabId, responseType, confidence });
            
            // Send appropriate response based on prompt type
            if (responseType === 'enter') {
              // Menu-style: just press Enter (option already selected)
              ws.send('\r');
            } else {
              // Y/N style: send "y" followed by Enter
              ws.send('y\r');
            }
            
            // Clear waiting state after auto-respond
            lastOutputRef.current = '';
            setIsWaiting(false);
            if (onWaitingChange) {
              onWaitingChange(false);
            }
          }
        }, 1500); // Increased from 500ms to 1500ms for performance
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
            // Custom: PTY process exited
            disconnectMessage = 'Shell process exited.';
            break;
          case 4001:
            // Custom: Session timeout
            disconnectMessage = 'Session timed out.';
            break;
          case 4002:
            // Custom: PTY read error
            disconnectMessage = 'Terminal read error.';
            messageColor = '1;31'; // Red
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
        if (shouldReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current += 1;
          setReconnecting(true);
          
          logger.terminal('Scheduling reconnection', { 
            tabId, 
            attempt: reconnectAttemptsRef.current, 
            delay 
          });
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (xtermRef.current && wsRef.current === ws) {
              logger.terminal('Attempting reconnection...', { tabId, attempt: reconnectAttemptsRef.current });
              if (xtermRef.current) {
                term.write(`\x1b[1;33m[Reconnecting...]\x1b[0m Attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}\r\n`);
              }
              connectWebSocket();
            }
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setReconnecting(false);
          if (xtermRef.current) {
            term.write(`\x1b[1;31m[Connection Failed]\x1b[0m Max reconnection attempts reached. Click to reconnect manually.\r\n`);
          }
        }
      };

      // Handle terminal input
      term.onData((data) => {
        // Record terminal data for diagnostics
        diagnosticCore.recordTerminalData(data);
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
          
          // AM logging: Optimized input capture - only when AM enabled
          if (amEnabledRef.current) {
            amInputBufferRef.current += data;
            
            if (amInputTimeoutRef.current) {
              clearTimeout(amInputTimeoutRef.current);
            }
            amInputTimeoutRef.current = setTimeout(() => {
              if (amInputBufferRef.current) {
                // Clean the input - strip control chars but keep meaningful content
                const cleanInput = amInputBufferRef.current
                  .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // Strip ANSI
                  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); // Strip control chars except \r\n\t
                
                if (cleanInput.trim() || cleanInput.includes('\r') || cleanInput.includes('\n')) {
                  fetch('/api/am/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      tabId: tabId,
                      tabName: tabNameRef.current || 'Terminal',
                      workspace: window.location.pathname,
                      entryType: 'USER_INPUT',
                      content: cleanInput.slice(-500), // Limit size
                    }),
                  }).catch(() => {}); // Silent fail for performance
                }
                amInputBufferRef.current = '';
              }
            }, 2000); // Increased from 1s to 2s for better batching
          }
          
          // Clear waiting state when user types (they're responding to the prompt)
          if (isWaiting) {
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
      // No cleanup needed for attachCustomKeyEventHandler - xterm handles it
      
      window.removeEventListener('resize', debouncedFit);
      resizeObserver.disconnect();
      if (waitingCheckTimeoutRef.current) {
        clearTimeout(waitingCheckTimeoutRef.current);
      }
      if (amLogTimeoutRef.current) {
        clearTimeout(amLogTimeoutRef.current);
      }
      if (amInputTimeoutRef.current) {
        clearTimeout(amInputTimeoutRef.current);
      }
      
      // Flush any pending AM logs before closing
      if (amLogBufferRef.current || amInputBufferRef.current) {
        const flushData = [];
        if (amLogBufferRef.current) {
          const cleanContent = stripAnsi(amLogBufferRef.current);
          if (cleanContent.trim()) {
            flushData.push({ entryType: 'AGENT_OUTPUT', content: cleanContent.slice(-2000) });
          }
        }
        if (amInputBufferRef.current) {
          const cleanInput = amInputBufferRef.current
            .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
            .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
          if (cleanInput.trim() || cleanInput.includes('\r')) {
            flushData.push({ entryType: 'USER_INPUT', content: cleanInput.slice(-500) });
          }
        }
        // Fire-and-forget flush
        flushData.forEach(data => {
          fetch('/api/am/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tabId: tabId,
              tabName: tabNameRef.current || 'Terminal',
              workspace: window.location.pathname,
              ...data,
            }),
          }).catch(() => {}); // Ignore errors on cleanup
        });
      }
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Remove onclose handler before closing to avoid race condition
        // (component unmount is intentional, not a disconnect to display)
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      xtermRef.current = null;
      term.dispose();
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
                <span>Reconnecting... (Attempt {reconnectAttemptsRef.current}/{maxReconnectAttempts})</span>
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
      
      {/* Vision Overlay */}
      {visionEnabled && (
        <VisionOverlay 
          activeOverlay={activeVisionOverlay}
          onAction={handleVisionAction}
          onDismiss={handleVisionDismiss}
        />
      )}
      
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
