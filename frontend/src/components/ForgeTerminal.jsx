import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// Debounce helper for resize events
function debounce(fn, ms) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

// Dark theme (Catppuccin Mocha)
const darkTheme = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  cursorAccent: '#1e1e2e',
  selectionBackground: '#585b70',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
};

// Light theme (Catppuccin Latte)
const lightTheme = {
  background: '#eff1f5',
  foreground: '#4c4f69',
  cursor: '#dc8a78',
  cursorAccent: '#eff1f5',
  selectionBackground: '#acb0be',
  black: '#5c5f77',
  red: '#d20f39',
  green: '#40a02b',
  yellow: '#df8e1d',
  blue: '#1e66f5',
  magenta: '#ea76cb',
  cyan: '#179299',
  white: '#acb0be',
  brightBlack: '#6c6f85',
  brightRed: '#d20f39',
  brightGreen: '#40a02b',
  brightYellow: '#df8e1d',
  brightBlue: '#1e66f5',
  brightMagenta: '#ea76cb',
  brightCyan: '#179299',
  brightWhite: '#bcc0cc',
};

/**
 * Strip ANSI escape codes from text
 * @param {string} text - Text with ANSI escape codes
 * @returns {string} Clean text without ANSI codes
 */
function stripAnsi(text) {
  // Match all ANSI escape sequences:
  // - CSI sequences: ESC [ ... (letters or ~)
  // - OSC sequences: ESC ] ... (BEL or ESC \)
  // - Simple escapes: ESC followed by single character
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z~]/g, '') // CSI sequences
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC sequences
    .replace(/\x1b[()][AB012]/g, '') // Character set selection
    .replace(/\x1b[=>]/g, '') // Keypad modes
    .replace(/\x1b[78]/g, '') // Save/restore cursor
    .replace(/\x1b[DME]/g, '') // Line operations
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Control characters except \t, \n, \r
}

/**
 * Terminal Component
 * 
 * Full PTY terminal using xterm.js connected via WebSocket.
 * Supports Claude Code CLI and other interactive terminal applications.
 * 
 * Exposes sendCommand method via ref for programmatic command execution.
 * 
 * Props:
 *   - workspacePath: Optional custom working directory for the terminal session
 *   - onConnectionChange: Callback when WebSocket connection state changes
 *   - onUrlDetected: Callback when an OAuth/auth URL is detected in terminal output
 *   - onUnreadOutput: Callback when terminal has new output while user is scrolled up
 *   - onImagePaste: Callback when an image is pasted (receives {path, success, error})
 *   - isVisible: Whether this terminal tab is currently visible (for resize handling)
 *   - debugMode: Enable debug logging for troubleshooting
 */
const ForgeTerminal = forwardRef(function ForgeTerminal({ 
  className, 
  style, 
  isDarkMode = true, 
  workspacePath = null,
  onConnectionChange = null,
  onUrlDetected = null,
  onUnreadOutput = null,
  onImagePaste = null,
  isVisible = true,
  onData = null,
  debugMode = false,
}, ref) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);
  // Track the workspace path to detect changes
  const currentWorkspaceRef = useRef(workspacePath);
  
  // Scroll position tracking - track whether user is at bottom of terminal
  const isAtBottomRef = useRef(true);
  const hasUnreadOutputRef = useRef(false);
  
  // State for auth error overlay
  const [authError, setAuthError] = useState(null);
  
  // Get scroll preference from localStorage (default: auto-scroll)
  const getScrollPreference = useCallback(() => {
    const pref = localStorage.getItem('forge.scrollBehavior');
    return pref === 'manual' ? 'manual' : 'auto';
  }, []);

  // Check if terminal is "at bottom" (within 3 lines tolerance)
  const checkIfAtBottom = useCallback((term) => {
    if (!term || !term.buffer || !term.buffer.active) return true;
    const buffer = term.buffer.active;
    // baseY is the top of the viewport, viewportY tracks viewport offset
    // When at bottom: baseY should equal scrollback position
    const scrollTop = buffer.viewportY;
    const scrollHeight = buffer.baseY;
    const tolerance = 3; // 3 line tolerance
    return scrollTop >= scrollHeight - tolerance;
  }, []);

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.scrollToBottom();
      isAtBottomRef.current = true;
      hasUnreadOutputRef.current = false;
      if (onUnreadOutput) {
        onUnreadOutput(false);
      }
    }
  }, [onUnreadOutput]);

  // Image paste handler - intercepts clipboard paste events with images
  // Uploads image to server and returns the file path for insertion
  const handleImagePaste = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      return null;
    }

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => {
          // Remove data:image/png;base64, prefix
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      // Upload to server
      const response = await fetch('/api/forge/uploads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_data: base64Data,
          mime_type: file.type,
          filename: file.name || undefined,
        }),
      });

      const result = await response.json();
      
      if (result.success && result.path) {
        console.log('[Terminal] Image uploaded:', result.path);
        // Notify parent
        if (onImagePaste) {
          onImagePaste({ path: result.path, success: true });
        }
        return result.path;
      } else {
        console.error('[Terminal] Image upload failed:', result.error);
        if (onImagePaste) {
          onImagePaste({ success: false, error: result.error || 'Upload failed' });
        }
        return null;
      }
    } catch (error) {
      console.error('[Terminal] Image upload error:', error);
      if (onImagePaste) {
        onImagePaste({ success: false, error: error.message });
      }
      return null;
    }
  }, [onImagePaste]);

  // Expose sendCommand and pasteCommand methods to parent via ref
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
    // Reconnect with a new workspace path
    reconnect: () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    },
    // Scroll to bottom of terminal
    scrollToBottom: scrollToBottom,
    // Check if terminal has unread output
    hasUnreadOutput: () => hasUnreadOutputRef.current,
    // Get scroll position state
    isAtBottom: () => isAtBottomRef.current,
  }), [scrollToBottom]);

  // Update terminal theme when isDarkMode changes
  useEffect(() => {
    if (xtermRef.current) {
      const term = xtermRef.current;
      const newTheme = isDarkMode ? darkTheme : lightTheme;
      // Update the theme
      term.options.theme = newTheme;
      // Force terminal to refresh and redraw with new colors
      term.refresh(0, term.rows - 1);
    }
  }, [isDarkMode]);

  // Apply theme on initial load (after terminal is created)
  useEffect(() => {
    // Small delay to ensure terminal is fully initialized
    const timer = setTimeout(() => {
      if (xtermRef.current) {
        const term = xtermRef.current;
        const newTheme = isDarkMode ? darkTheme : lightTheme;
        term.options.theme = newTheme;
        term.refresh(0, term.rows - 1);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Re-fit terminal when visibility changes (tab switching)
  // This fixes the narrow column width issue when switching back to terminal tab
  useEffect(() => {
    if (isVisible && fitAddonRef.current && xtermRef.current) {
      // Small delay to ensure DOM has finished rendering
      const timer = setTimeout(() => {
        fitAddonRef.current.fit();
        // Refresh the terminal display
        xtermRef.current.refresh(0, xtermRef.current.rows - 1);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js with dynamic theme and scroll management
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, Monaco, monospace',
      theme: isDarkMode ? darkTheme : lightTheme,
      allowProposedApi: true,
      scrollback: 5000, // Keep 5000 lines of history
      scrollOnUserInput: false, // Don't auto-scroll when user types (we manage this)
    });

    // Add fit addon for responsive resizing
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    // Open terminal in the container
    term.open(terminalRef.current);
    xtermRef.current = term;

    // Initial fit
    setTimeout(() => fitAddon.fit(), 0);

    // Connect to WebSocket with optional workdir parameter for hot-swappable workspace
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${wsProtocol}//${window.location.host}/ws/forge/terminal`;
    
    // Add workspace path as query parameter if specified
    if (workspacePath) {
      wsUrl += `?workdir=${encodeURIComponent(workspacePath)}`;
      console.log('[Terminal] Using custom workspace:', workspacePath);
    }
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    currentWorkspaceRef.current = workspacePath;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[Terminal] WebSocket connected');
      if (workspacePath) {
        term.write(`\r\n\x1b[1;34m[DevSmith Forge]\x1b[0m Connected to workspace: \x1b[1;32m${workspacePath}\x1b[0m\r\n\r\n`);
      } else {
        term.write('\r\n\x1b[1;34m[DevSmith Forge]\x1b[0m Connected.\r\n\r\n');
      }
      
      // Send initial size
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      
      // Notify parent of connection
      if (onConnectionChange) {
        onConnectionChange(true);
      }
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary data from PTY
        const data = new Uint8Array(event.data);
        const text = new TextDecoder().decode(data);
        
        // Call onData callback with clean text for Debug tab
        if (onData && text.trim()) {
          const cleanText = stripAnsi(text);
          if (cleanText.trim()) {
            onData(cleanText, Date.now());
          }
        }
        
        // Debug: log binary data as text for URL detection
        if (debugMode || onUrlDetected) {
          // Debug logging
          if (debugMode && text.trim()) {
            console.log('[Terminal Debug] Binary output:', text.substring(0, 200));
          }
          
          // Detect OAuth/Auth URLs in terminal output
          // Claude CLI outputs URLs like: https://console.anthropic.com/oauth/...
          const urlPatterns = [
            /https?:\/\/console\.anthropic\.com\/[^\s\x1b\]]+/g,
            /https?:\/\/[^\s\x1b\]]*oauth[^\s\x1b\]]+/gi,
            /https?:\/\/[^\s\x1b\]]*auth[^\s\x1b\]]+/gi,
            /https?:\/\/[^\s\x1b\]]*login[^\s\x1b\]]+/gi,
          ];
          
          for (const pattern of urlPatterns) {
            const matches = text.match(pattern);
            if (matches && onUrlDetected) {
              matches.forEach(url => {
                // Clean up URL (remove ANSI escape codes)
                const cleanUrl = url.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x1F]/g, '');
                if (cleanUrl.startsWith('http')) {
                  console.log('[Terminal] Detected auth URL:', cleanUrl);
                  onUrlDetected(cleanUrl);
                }
              });
            }
          }
        }
        
        term.write(data);
        
        // Smart scroll: only auto-scroll if user is already at bottom (with 3-line tolerance)
        // This prevents jarring scroll jumps when user is reading earlier output
        const scrollPref = getScrollPreference();
        if (scrollPref === 'auto' && isAtBottomRef.current) {
          term.scrollToBottom();
        } else if (!isAtBottomRef.current) {
          // User is scrolled up - mark as having unread output
          hasUnreadOutputRef.current = true;
          if (onUnreadOutput) {
            onUnreadOutput(true);
          }
        }
      } else {
        // Text data - could be control messages (JSON) or terminal output
        try {
          const msg = JSON.parse(event.data);
          
          // Debug logging
          if (debugMode) {
            console.log('[Terminal Debug] JSON message:', msg);
          }
          
          // Handle control messages from server
          // Check for URL in message
          if (msg.type === 'auth_url' && msg.url && onUrlDetected) {
            console.log('[Terminal] Auth URL from server:', msg.url);
            onUrlDetected(msg.url);
          }
          
          // Unknown JSON message - write as text
          term.write(event.data);
          
          // Call onData for JSON message
          if (onData && event.data.trim()) {
            const cleanText = stripAnsi(event.data);
            if (cleanText.trim()) {
              onData(cleanText, Date.now());
            }
          }
        } catch (e) {
          // Not JSON - write as terminal output
          
          // Debug logging
          if (debugMode) {
            console.log('[Terminal Debug] Text output:', event.data.substring(0, 200));
          }
          
          // Call onData for text output
          if (onData && event.data.trim()) {
            const cleanText = stripAnsi(event.data);
            if (cleanText.trim()) {
              onData(cleanText, Date.now());
            }
          }
          
          // Check for URLs in text output
          if (onUrlDetected) {
            const urlMatch = event.data.match(/https?:\/\/[^\s\x1b\]]+/g);
            if (urlMatch) {
              urlMatch.forEach(url => {
                const cleanUrl = url.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x1F]/g, '');
                if (cleanUrl.includes('auth') || cleanUrl.includes('oauth') || cleanUrl.includes('login') || cleanUrl.includes('console.anthropic')) {
                  console.log('[Terminal] Detected auth URL in text:', cleanUrl);
                  onUrlDetected(cleanUrl);
                }
              });
            }
          }
          
          term.write(event.data);
          
          // Smart scroll for text output
          const scrollPref = getScrollPreference();
          if (scrollPref === 'auto' && isAtBottomRef.current) {
            term.scrollToBottom();
          } else if (!isAtBottomRef.current) {
            hasUnreadOutputRef.current = true;
            if (onUnreadOutput) {
              onUnreadOutput(true);
            }
          }
        }
      }
    };

    ws.onerror = (error) => {
      console.error('[Terminal] WebSocket error:', error);
      // Check if this is an auth error (WebSocket upgrade failed with 401)
      // Note: Browser doesn't expose HTTP status for WebSocket errors directly
      term.write('\r\n\x1b[1;31m[Error]\x1b[0m Connection error. You may need to log in.\r\n');
    };

    ws.onclose = (event) => {
      console.log('[Terminal] WebSocket closed:', event.code, event.reason);
      
      // Check for auth error (401 causes code 1006 typically)
      if (event.code === 1006) {
        // Could be auth error - check via fetch
        fetch('/ws/forge/terminal')
          .then(response => {
            if (response.status === 401) {
              setAuthError({
                message: 'Please log in to access the terminal',
                loginUrl: '/auth/github/login'
              });
            }
          })
          .catch(() => {
            // Network error, not auth
          });
      }
      
      term.write('\r\n\x1b[1;33m[Disconnected]\x1b[0m Terminal session ended.\r\n');
      
      // Notify parent of disconnection
      if (onConnectionChange) {
        onConnectionChange(false);
      }
    };

    // Handle terminal input
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Track scroll position to enable smart scrolling
    // When user scrolls, check if they're at the bottom (with 3-line tolerance)
    term.onScroll(() => {
      const wasAtBottom = isAtBottomRef.current;
      isAtBottomRef.current = checkIfAtBottom(term);
      
      // If user scrolled to bottom, clear unread state
      if (!wasAtBottom && isAtBottomRef.current && hasUnreadOutputRef.current) {
        hasUnreadOutputRef.current = false;
        if (onUnreadOutput) {
          onUnreadOutput(false);
        }
      }
    });

    // Handle terminal resize
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // Handle window resize with debouncing to prevent rapid resize events
    const debouncedFit = debounce(() => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit();
      }
    }, 100);
    
    const handleResize = () => {
      debouncedFit();
    };
    window.addEventListener('resize', handleResize);

    // Use ResizeObserver for container size changes (debounced)
    const resizeObserver = new ResizeObserver(() => {
      debouncedFit();
    });
    resizeObserver.observe(terminalRef.current);

    // Handle paste events for image support
    // When user pastes an image from clipboard, upload it and insert the path
    const handlePaste = async (event) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      // Check for image items in clipboard
      const items = Array.from(clipboardData.items);
      const imageItem = items.find(item => item.type.startsWith('image/'));
      
      if (imageItem) {
        // Prevent default paste behavior for images
        event.preventDefault();
        
        const file = imageItem.getAsFile();
        if (file) {
          console.log('[Terminal] Image paste detected:', file.type, file.size);
          const path = await handleImagePaste(file);
          if (path && ws.readyState === WebSocket.OPEN) {
            // Insert the file path into terminal (user can then use it in commands)
            ws.send(path);
          }
        }
      }
      // For text, let xterm handle it normally
    };
    
    // Add paste listener to terminal container
    const container = terminalRef.current;
    container.addEventListener('paste', handlePaste);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('paste', handlePaste);
      resizeObserver.disconnect();
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      term.dispose();
    };
  }, [workspacePath, handleImagePaste]); // Re-run when workspacePath changes for hot-swap

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Auth Error Overlay */}
      {authError && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDarkMode ? 'rgba(30, 30, 46, 0.95)' : 'rgba(239, 241, 245, 0.95)',
          zIndex: 10,
          borderRadius: '8px',
        }}>
          <div style={{
            padding: '32px',
            textAlign: 'center',
            color: isDarkMode ? '#cdd6f4' : '#4c4f69',
          }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>🔒 Authentication Required</h3>
            <p style={{ marginBottom: '24px', opacity: 0.8 }}>{authError.message}</p>
            <a
              href={authError.loginUrl}
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                backgroundColor: '#89b4fa',
                color: '#1e1e2e',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#74a8f8'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#89b4fa'}
            >
              Click to Login with GitHub
            </a>
          </div>
        </div>
      )}
      
      <div 
        ref={terminalRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          padding: '8px',
          borderRadius: '8px',
          backgroundColor: isDarkMode ? '#1e1e2e' : '#eff1f5',
          transition: 'background-color 0.2s ease',
          ...style,
        }}
      />
    </div>
  );
});

export default ForgeTerminal;
