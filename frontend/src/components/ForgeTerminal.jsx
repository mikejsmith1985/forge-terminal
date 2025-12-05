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

// CLI confirmation prompt patterns - specifically for tools like GitHub Copilot CLI
// These indicate the CLI is waiting for user confirmation to proceed
// Patterns are checked against the LAST line of output (where prompts appear)
const CLI_CONFIRMATION_PATTERNS = [
  /\(y\/n\)\s*$/i, // (y/n) at end of line
  /\[Y\/n\]\s*$/i, // [Y/n] at end
  /\[y\/N\]\s*$/i, // [y/N] at end
  /\(yes\/no\)\s*$/i, // (yes/no) at end
  /\? Run this command\?\s*$/i, // GitHub Copilot CLI: ? Run this command?
  /Run this command\?\s*\([YyNn]\/[YyNn]\)\s*$/i, // Run this command? (Y/n)
  /proceed\?\s*(\([YyNn]\/[YyNn]\))?\s*$/i, // Proceed? or Proceed? (y/n)
  /continue\?\s*(\[[YyNn]\/[YyNn]\])?\s*$/i, // Continue? or Continue? [Y/n]
  /confirm\?\s*(\([YyNn]\/[YyNn]\))?\s*$/i, // Confirm? (y/n)
  /are you sure\?\s*(\[[YyNn]\/[YyNn]\])?\s*$/i, // Are you sure? [y/N]
  /do you want to proceed\?\s*$/i, // Do you want to proceed?
  /do you want to run\?\s*$/i, // Do you want to run?
  /\?\s*›\s*$/i, // Interactive prompt with › (inquirer style)
];

// Secondary check - must have y/n indicator somewhere in recent output
const HAS_YN_INDICATOR = /\([YyNn]\/[YyNn]\)|\[[YyNn]\/[YyNn]\]|\(yes\/no\)/i;

/**
 * Strip ANSI escape codes from text
 */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Check if text ends with a CLI confirmation prompt (waiting for y/n input)
 */
function isCliConfirmationWaiting(text) {
  if (!text) return false;
  // Strip ANSI escape codes before checking
  const cleanText = stripAnsi(text);
  // Get the last 500 characters to check for prompt
  const lastChunk = cleanText.slice(-500);
  // Get the last non-empty line (where the prompt would be)
  const lines = lastChunk.split(/[\r\n]/).filter(l => l.trim());
  if (lines.length === 0) return false;
  
  const lastLine = lines[lines.length - 1].trim();
  const recentLines = lines.slice(-5).join(' '); // Last 5 lines for context
  
  // Check if the last line matches any prompt pattern
  const hasPromptEnding = CLI_CONFIRMATION_PATTERNS.some(pattern => {
    if (typeof pattern === 'object' && pattern instanceof RegExp) {
      return pattern.test(lastLine);
    }
    return false;
  });
  
  // For less specific patterns (like "Proceed?"), also require a y/n indicator nearby
  if (hasPromptEnding) {
    return true;
  }
  
  // Also check if recent output has y/n indicator AND last line looks like waiting for input
  // (ends with ?, :, or ›)
  if (HAS_YN_INDICATOR.test(recentLines) && /[?:›]\s*$/.test(lastLine)) {
    return true;
  }
  
  return false;
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
        
        // Accumulate recent output for prompt detection
        lastOutputRef.current = (lastOutputRef.current + textData).slice(-500);
        
        // Debounce waiting check - wait 100ms after last output
        if (waitingCheckTimeoutRef.current) {
          clearTimeout(waitingCheckTimeoutRef.current);
        }
        waitingCheckTimeoutRef.current = setTimeout(() => {
          const waiting = isCliConfirmationWaiting(lastOutputRef.current);
          if (waiting !== isWaiting) {
            setIsWaiting(waiting);
            if (onWaitingChange) {
              onWaitingChange(waiting);
            }
          }
          
          // Auto-respond if enabled and CLI is waiting for confirmation
          if (waiting && autoRespondRef.current && ws.readyState === WebSocket.OPEN) {
            logger.terminal('Auto-responding to CLI prompt', { tabId });
            // Send "y" followed by Enter to confirm
            ws.send('y\r');
            // Clear waiting state after auto-respond
            lastOutputRef.current = '';
            setIsWaiting(false);
            if (onWaitingChange) {
              onWaitingChange(false);
            }
          }
        }, 100);
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
        
        term.write(`\r\n\x1b[${messageColor}m[Disconnected]\x1b[0m ${disconnectMessage}\r\n`);
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
        wsRef.current.close();
      }
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
