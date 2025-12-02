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
 * Terminal Component
 * 
 * Full PTY terminal using xterm.js connected via WebSocket.
 */
const ForgeTerminal = forwardRef(function ForgeTerminal({
  className,
  style,
  isDarkMode = true,
  onConnectionChange = null,
}, ref) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);

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
  }));

  // Update terminal theme when isDarkMode changes
  useEffect(() => {
    if (xtermRef.current) {
      const term = xtermRef.current;
      const newTheme = isDarkMode ? darkTheme : lightTheme;
      term.options.theme = newTheme;
      term.refresh(0, term.rows - 1);
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", Consolas, Monaco, monospace',
      theme: isDarkMode ? darkTheme : lightTheme,
      allowProposedApi: true,
      scrollback: 5000,
    });

    // Add fit addon
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    // Open terminal
    term.open(terminalRef.current);
    xtermRef.current = term;

    // Initial fit
    setTimeout(() => fitAddon.fit(), 0);

    // Connect to WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the specific port 3333 as per charter if running separately, but usually it's relative
    // The charter says "WebSocket URL: ws://localhost:3333/ws"
    // But if we are serving frontend from the same binary, relative path is better.
    // However, during dev (Vite), we might need to proxy or use absolute.
    // Let's assume relative '/ws' which Vite proxy should handle, or the binary will serve.
    // Wait, charter says `ws://localhost:3333/ws`. I'll stick to relative `/ws` which is safer for deployment,
    // assuming Vite proxy is set up or we are running from the binary.
    // Actually, let's look at the charter again. It says "WebSocket URL: ws://localhost:3333/ws".
    // If I use relative, it works for both dev (with proxy) and prod.
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[Terminal] WebSocket connected');
      term.write('\r\n\x1b[1;34m[Forge Terminal]\x1b[0m Connected.\r\n\r\n');

      // Send initial size
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));

      if (onConnectionChange) onConnectionChange(true);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary data from PTY
        const data = new Uint8Array(event.data);
        term.write(data);
      } else {
        // Text data
        term.write(event.data);
      }
    };

    ws.onerror = (error) => {
      console.error('[Terminal] WebSocket error:', error);
      term.write('\r\n\x1b[1;31m[Error]\x1b[0m Connection error.\r\n');
    };

    ws.onclose = () => {
      console.log('[Terminal] WebSocket closed');
      term.write('\r\n\x1b[1;33m[Disconnected]\x1b[0m Terminal session ended.\r\n');
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      term.dispose();
    };
  }, []);

  return (
    <div
      ref={terminalRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: isDarkMode ? '#1e1e2e' : '#eff1f5',
        ...style,
      }}
    />
  );
});

export default ForgeTerminal;
