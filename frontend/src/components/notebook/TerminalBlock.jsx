/**
 * TerminalBlock - Raw xterm.js cell for Notebook view
 * 
 * A minimal xterm.js wrapper for embedding terminal sessions in Notebook cells.
 * Unlike ForgeTerminal, this is designed for:
 * - Single command execution cells
 * - Inline display within a vertical notebook timeline
 * - No chat bubble wrapping - raw PTY output
 */

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Play, Square, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { getTerminalTheme } from '../../themes';

// Cell states
const CELL_STATE = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETE: 'complete',
  ERROR: 'error',
};

const TerminalBlock = forwardRef(({ 
  cellId,
  command = '',
  colorTheme = 'molten',
  theme = 'dark',
  fontSize = 14,
  minHeight = 100,
  maxHeight = 400,
  onCommandChange,
  onRun,
  onOutput,
  wsUrl,
  autoRun = false,
  readOnly = false,
}, ref) => {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  
  const [cellState, setCellState] = useState(CELL_STATE.IDLE);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [commandInput, setCommandInput] = useState(command);
  const [outputLines, setOutputLines] = useState(0);

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: getTerminalTheme(colorTheme, theme),
      scrollback: 1000,
      convertEol: true,
      disableStdin: readOnly,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && !isCollapsed) {
        fitAddonRef.current.fit();
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [colorTheme, theme, fontSize, readOnly, isCollapsed]);

  // Update theme when it changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getTerminalTheme(colorTheme, theme);
    }
  }, [colorTheme, theme]);

  // Connect to WebSocket for PTY
  const connectWS = useCallback(() => {
    if (!wsUrl || wsRef.current) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setCellState(CELL_STATE.RUNNING);
      // Send the command to execute
      if (commandInput) {
        ws.send(commandInput + '\r');
      }
    };

    ws.onmessage = (event) => {
      if (terminalRef.current) {
        const data = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        terminalRef.current.write(data);
        setOutputLines(prev => prev + data.split('\n').length);
        onOutput?.(data);
      }
    };

    ws.onclose = () => {
      setCellState(prev => prev === CELL_STATE.RUNNING ? CELL_STATE.COMPLETE : prev);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setCellState(CELL_STATE.ERROR);
      wsRef.current = null;
    };
  }, [wsUrl, commandInput, onOutput]);

  // Run command
  const runCommand = useCallback(() => {
    if (!commandInput.trim()) return;
    
    // Clear previous output
    if (terminalRef.current) {
      terminalRef.current.clear();
    }
    setOutputLines(0);
    
    onRun?.(commandInput);
    connectWS();
  }, [commandInput, onRun, connectWS]);

  // Stop execution
  const stopExecution = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setCellState(CELL_STATE.IDLE);
  }, []);

  // Copy output to clipboard
  const copyOutput = useCallback(() => {
    if (terminalRef.current) {
      const selection = terminalRef.current.getSelection();
      const text = selection || terminalRef.current.buffer.active.getLine(0)?.translateToString(true) || '';
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  // Auto-run on mount if requested
  useEffect(() => {
    if (autoRun && commandInput) {
      runCommand();
    }
  }, [autoRun]); // Only on mount

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    run: runCommand,
    stop: stopExecution,
    clear: () => terminalRef.current?.clear(),
    write: (data) => terminalRef.current?.write(data),
    focus: () => terminalRef.current?.focus(),
    getTerminal: () => terminalRef.current,
  }), [runCommand, stopExecution]);

  return (
    <div className={`terminal-block ${cellState} ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Command input bar */}
      <div className="terminal-block-header">
        <div className="terminal-block-input-row">
          <span className="terminal-block-prompt">$</span>
          <input
            type="text"
            className="terminal-block-command"
            value={commandInput}
            onChange={(e) => {
              setCommandInput(e.target.value);
              onCommandChange?.(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                runCommand();
              }
            }}
            placeholder="Enter command..."
            disabled={readOnly || cellState === CELL_STATE.RUNNING}
          />
        </div>
        
        <div className="terminal-block-actions">
          {cellState === CELL_STATE.RUNNING ? (
            <button 
              className="terminal-block-btn stop"
              onClick={stopExecution}
              title="Stop"
            >
              <Square size={14} />
            </button>
          ) : (
            <button 
              className="terminal-block-btn run"
              onClick={runCommand}
              disabled={!commandInput.trim()}
              title="Run (Enter)"
            >
              <Play size={14} />
            </button>
          )}
          
          <button 
            className="terminal-block-btn copy"
            onClick={copyOutput}
            title="Copy output"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          
          <button 
            className="terminal-block-btn collapse"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Terminal output */}
      {!isCollapsed && (
        <div 
          className="terminal-block-output"
          ref={containerRef}
          style={{ 
            minHeight: `${minHeight}px`,
            maxHeight: `${maxHeight}px`,
          }}
        />
      )}
      
      {/* Status bar */}
      <div className="terminal-block-status">
        <span className={`status-indicator ${cellState}`} />
        <span className="status-text">
          {cellState === CELL_STATE.RUNNING && 'Running...'}
          {cellState === CELL_STATE.COMPLETE && `Complete (${outputLines} lines)`}
          {cellState === CELL_STATE.ERROR && 'Error'}
          {cellState === CELL_STATE.IDLE && 'Ready'}
        </span>
      </div>
    </div>
  );
});

TerminalBlock.displayName = 'TerminalBlock';

export default TerminalBlock;
