import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { ArrowDownToLine } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { getTerminalTheme } from '../themes';
import { logger } from '../utils/logger';

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
  
  if (debugLog) {
    console.log('[AutoRespond] Menu detection:', { 
      hasYesSelected, 
      hasMenuContext, 
      hasQuestion, 
      hasTuiFrame 
    });
  }
  
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
  
  if (debugLog && hasYnPrompt) {
    console.log('[AutoRespond] Y/N prompt detected in:', lastLines.slice(-100));
  }
  
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
  
  // Use larger buffer for TUI apps that redraw the screen
  const bufferToCheck = cleanText.slice(-2000);
  
  if (debugLog) {
    // Log a summary of what we're checking
    const lines = bufferToCheck.split(/[\r\n]/).filter(l => l.trim());
    console.log('[AutoRespond] Checking buffer:', {
      bufferLength: bufferToCheck.length,
      lineCount: lines.length,
      lastLine: lines[lines.length - 1]?.slice(0, 100) || '(empty)',
      sample: bufferToCheck.slice(-300)
    });
  }
  
  // Priority 1: Check for menu-style prompts (Copilot, Claude, etc.)
  const menuResult = detectMenuPrompt(bufferToCheck, debugLog);
  if (menuResult.detected && menuResult.confidence !== 'low') {
    if (debugLog) {
      console.log('[AutoRespond] ✓ Menu prompt detected, confidence:', menuResult.confidence);
    }
    return { 
      waiting: true, 
      responseType: 'enter', 
      confidence: menuResult.confidence 
    };
  }
  
  // Priority 2: Check for Y/N style prompts
  const ynResult = detectYnPrompt(bufferToCheck, debugLog);
  if (ynResult.detected) {
    if (debugLog) {
      console.log('[AutoRespond] ✓ Y/N prompt detected');
    }
    return { 
      waiting: true, 
      responseType: 'y-enter', 
      confidence: 'high' 
    };
  }
  
  // Priority 3: Low confidence menu detection (still report as waiting but may not auto-respond)
  if (menuResult.detected && menuResult.confidence === 'low') {
    if (debugLog) {
      console.log('[AutoRespond] ? Low confidence menu detection');
    }
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
const ForgeTerminal = forwardRef(function ForgeTerminal({
  className,
  style,
  theme = 'dark', // 'dark' or 'light'
  colorTheme = 'molten', // theme color scheme
  fontSize = 14,
  onConnectionChange = null,
  onWaitingChange = null, // Callback when prompt waiting state changes
  shellConfig = null, // { shellType: 'powershell'|'cmd'|'wsl', wslDistro: string, wslHomePath: string }
  tabId = null, // Unique identifier for this terminal tab
  isVisible = true, // Whether this terminal is currently visible
  autoRespond = false, // Auto-respond "yes" to CLI confirmation prompts
}, ref) {
  const terminalRef = useRef(null);
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const shellConfigRef = useRef(shellConfig);
  const connectFnRef = useRef(null);
  const lastOutputRef = useRef('');
  const waitingCheckTimeoutRef = useRef(null);
  const autoRespondRef = useRef(autoRespond);
  
  // State for scroll button visibility
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);

  // Keep autoRespond ref updated
  useEffect(() => {
    autoRespondRef.current = autoRespond;
  }, [autoRespond]);

  // Keep shellConfig ref updated
  useEffect(() => {
    shellConfigRef.current = shellConfig;
  }, [shellConfig]);

  // Refit terminal when becoming visible
  useEffect(() => {
    if (isVisible && fitAddonRef.current && xtermRef.current) {
      // Small delay to ensure the container is properly sized
      setTimeout(() => {
        fitAddonRef.current.fit();
        xtermRef.current.focus();
      }, 50);
    }
  }, [isVisible]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    sendCommand: (command) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Send the command followed by Enter key
        wsRef.current.send(command + '\r');
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
  }));

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

    // Initialize xterm.js
    const initialTheme = getTerminalTheme(colorTheme, theme);
    const term = new Terminal({
      cursorBlink: true,
      fontSize: fontSize,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, Monaco, monospace',
      theme: initialTheme,
      allowProposedApi: true,
      scrollback: 5000,
    });

    // Add fit addon
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    // Add search addon
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    // Open terminal
    term.open(terminalRef.current);
    xtermRef.current = term;

    // Initial fit
    setTimeout(() => fitAddon.fit(), 0);

    // Connect to WebSocket
    const connectWebSocket = () => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsUrl = `${wsProtocol}//${window.location.host}/ws`;
      
      // Add shell config query params
      const cfg = shellConfigRef.current;
      if (cfg && cfg.shellType) {
        const params = new URLSearchParams();
        params.set('shell', cfg.shellType);
        if (cfg.shellType === 'wsl') {
          if (cfg.wslDistro) params.set('distro', cfg.wslDistro);
          if (cfg.wslHomePath) params.set('home', cfg.wslHomePath);
        }
        wsUrl += '?' + params.toString();
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        logger.terminal('WebSocket connected', { 
          tabId, 
          shellType: cfg?.shellType,
          wsUrl: wsUrl.replace(window.location.host, '[host]')
        });
        // Use orange for the welcome message to match theme
        const shellLabel = cfg?.shellType ? ` (${cfg.shellType.toUpperCase()})` : '';
        term.write(`\r\n\x1b[38;2;249;115;22m[Forge Terminal]\x1b[0m Connected${shellLabel}.\r\n\r\n`);

        // Send initial size
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        logger.terminal('Initial size sent', { tabId, cols, rows });

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
        } else {
          // Text data
          term.write(event.data);
          textData = event.data;
        }
        
        // Accumulate recent output for prompt detection (larger buffer for TUI apps)
        lastOutputRef.current = (lastOutputRef.current + textData).slice(-3000);
        
        // Debounce waiting check - wait 500ms after last output for TUI to fully render
        if (waitingCheckTimeoutRef.current) {
          clearTimeout(waitingCheckTimeoutRef.current);
        }
        waitingCheckTimeoutRef.current = setTimeout(() => {
          // Enable debug logging when auto-respond is on
          const debugMode = autoRespondRef.current;
          const { waiting, responseType, confidence } = detectCliPrompt(lastOutputRef.current, debugMode);
          
          if (waiting !== isWaiting) {
            setIsWaiting(waiting);
            if (onWaitingChange) {
              onWaitingChange(waiting);
            }
          }
          
          // Auto-respond only with high/medium confidence, not low
          // Low confidence will trigger the tab pulse for user attention
          const shouldAutoRespond = waiting && 
            autoRespondRef.current && 
            ws.readyState === WebSocket.OPEN &&
            (confidence === 'high' || confidence === 'medium');
          
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
          } else if (waiting && !autoRespondRef.current && debugMode === false) {
            // Log when waiting is detected but auto-respond is off (for debugging)
            logger.terminal('Prompt detected, waiting for user input', { tabId, responseType, confidence });
          }
        }, 500);
      };

      ws.onerror = (error) => {
        logger.terminal('WebSocket error', { tabId, error: error.message || 'unknown' });
        term.write('\r\n\x1b[1;31m[Error]\x1b[0m Connection error.\r\n');
      };

      ws.onclose = (event) => {
        logger.terminal('WebSocket closed', { tabId, code: event.code, reason: event.reason });
        
        // Provide meaningful disconnect messages based on close code
        let disconnectMessage = 'Terminal session ended.';
        let messageColor = '1;33'; // Yellow by default
        
        switch (event.code) {
          case 1000:
            // Normal closure
            disconnectMessage = 'Session closed normally.';
            break;
          case 1001:
            disconnectMessage = 'Server is shutting down.';
            break;
          case 1006:
            // Abnormal closure (no close frame received)
            disconnectMessage = 'Connection lost unexpectedly.';
            messageColor = '1;31'; // Red
            break;
          case 1011:
            // Server error
            disconnectMessage = 'Server encountered an error.';
            messageColor = '1;31'; // Red
            break;
          case 1012:
            disconnectMessage = 'Server is restarting.';
            break;
          case 1013:
            disconnectMessage = 'Server is overloaded, try again later.';
            messageColor = '1;31'; // Red
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
        }
        
        // Only write to terminal if it's still active (not disposed)
        if (xtermRef.current) {
          term.write(`\r\n\x1b[${messageColor}m[Disconnected]\x1b[0m ${disconnectMessage}\r\n`);
        }
        if (onConnectionChange) onConnectionChange(false);
      };

      // Handle terminal input
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
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
      window.removeEventListener('resize', debouncedFit);
      resizeObserver.disconnect();
      if (waitingCheckTimeoutRef.current) {
        clearTimeout(waitingCheckTimeoutRef.current);
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
      <div
        ref={terminalRef}
        className="terminal-inner"
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: getTerminalTheme(colorTheme, theme).background,
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
