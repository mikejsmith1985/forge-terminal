import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bug, AlertTriangle, X, ClipboardCopy } from 'lucide-react';

/**
 * DiagnosticsButton - A floating button to capture system state when keyboard lockout occurs
 * 
 * This component tracks keyboard events and provides a button to capture diagnostics
 * when the user experiences input lag or lockout.
 */
const DiagnosticsButton = ({ 
  terminalRef, 
  wsRef, 
  tabId, 
  isVisible = true,
  onDiagnosticCapture = null 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastDiagnostic, setLastDiagnostic] = useState(null);
  const [lockoutWarning, setLockoutWarning] = useState(false);
  const [eventLog, setEventLog] = useState([]);
  
  // Track keyboard events to detect lockouts
  const lastKeyTimeRef = useRef(Date.now());
  const keyEventCountRef = useRef(0);
  const pendingKeysRef = useRef([]);
  const lockoutDetectorRef = useRef(null);
  
  // Max events to keep in log
  const MAX_EVENT_LOG = 50;
  
  // Track all keyboard events for diagnostics
  useEffect(() => {
    if (!isVisible) return;
    
    const trackKeyEvent = (e) => {
      const now = Date.now();
      const timeSinceLast = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;
      keyEventCountRef.current++;
      
      // Log this event
      const eventEntry = {
        timestamp: now,
        type: e.type,
        key: e.key,
        code: e.code,
        timeSinceLast,
        target: e.target?.tagName || 'unknown',
        targetClass: e.target?.className?.slice?.(0, 50) || '',
        activeElement: document.activeElement?.tagName || 'unknown',
        isTrusted: e.isTrusted,
      };
      
      setEventLog(prev => {
        const newLog = [...prev, eventEntry];
        return newLog.slice(-MAX_EVENT_LOG);
      });
      
      // Track pending keydowns without keyups
      if (e.type === 'keydown') {
        pendingKeysRef.current.push({ key: e.key, code: e.code, time: now });
      } else if (e.type === 'keyup') {
        pendingKeysRef.current = pendingKeysRef.current.filter(
          k => k.code !== e.code
        );
      }
    };
    
    // Capture at document level to see ALL keyboard events
    document.addEventListener('keydown', trackKeyEvent, true);
    document.addEventListener('keyup', trackKeyEvent, true);
    
    return () => {
      document.removeEventListener('keydown', trackKeyEvent, true);
      document.removeEventListener('keyup', trackKeyEvent, true);
    };
  }, [isVisible]);
  
  // Lockout detector - check for suspicious gaps in keyboard events
  useEffect(() => {
    if (!isVisible) return;
    
    lockoutDetectorRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      
      // If there are pending keys that haven't been released for >5 seconds
      // and we haven't seen any keyboard events, something might be wrong
      const staleKeys = pendingKeysRef.current.filter(
        k => now - k.time > 5000
      );
      
      if (staleKeys.length > 0) {
        console.warn('[Diagnostics] Stale pending keys detected:', staleKeys);
        setLockoutWarning(true);
      } else {
        setLockoutWarning(false);
      }
    }, 2000);
    
    return () => {
      if (lockoutDetectorRef.current) {
        clearInterval(lockoutDetectorRef.current);
      }
    };
  }, [isVisible]);
  
  // Capture full diagnostic snapshot
  const captureDiagnostics = useCallback(async () => {
    const now = Date.now();
    
    // Gather WebSocket state
    const ws = wsRef?.current;
    const wsState = ws ? {
      readyState: ws.readyState,
      readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState] || 'UNKNOWN',
      bufferedAmount: ws.bufferedAmount,
      protocol: ws.protocol,
      url: ws.url,
    } : { status: 'NO_WEBSOCKET_REF' };
    
    // Gather focus state
    const focusState = {
      activeElement: document.activeElement?.tagName || 'null',
      activeElementId: document.activeElement?.id || '',
      activeElementClass: document.activeElement?.className?.slice?.(0, 100) || '',
      hasFocus: document.hasFocus(),
      visibilityState: document.visibilityState,
    };
    
    // Gather terminal state
    const term = terminalRef?.current;
    const terminalState = term ? {
      isConnected: term.isConnected?.() ?? 'unknown',
      isWaiting: term.isWaitingForPrompt?.() ?? 'unknown',
    } : { status: 'NO_TERMINAL_REF' };
    
    // Gather performance metrics
    const perfMetrics = {
      memory: performance.memory ? {
        usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
      } : 'unavailable',
      timing: {
        timeSinceLoad: Math.round(now - performance.timeOrigin),
      },
    };
    
    // Gather event statistics
    const eventStats = {
      totalKeyEvents: keyEventCountRef.current,
      pendingKeys: pendingKeysRef.current.map(k => ({
        key: k.key,
        pendingMs: now - k.time,
      })),
      recentEvents: eventLog.slice(-20),
      timeSinceLastEvent: now - lastKeyTimeRef.current,
    };
    
    // Check for busy main thread indicators
    let mainThreadBusy = false;
    const measureStart = performance.now();
    await new Promise(r => setTimeout(r, 0));
    const measureEnd = performance.now();
    if (measureEnd - measureStart > 50) {
      mainThreadBusy = true;
    }
    
    const diagnostic = {
      capturedAt: new Date().toISOString(),
      capturedAtMs: now,
      tabId,
      userAgent: navigator.userAgent,
      wsState,
      focusState,
      terminalState,
      perfMetrics,
      eventStats,
      mainThreadBusy,
      mainThreadDelayMs: Math.round(measureEnd - measureStart),
    };
    
    console.log('[Diagnostics] Snapshot captured:', diagnostic);
    setLastDiagnostic(diagnostic);
    
    // Send to backend for logging
    try {
      await fetch('/api/diagnostics/keyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diagnostic),
      });
      console.log('[Diagnostics] Sent to backend successfully');
    } catch (err) {
      console.error('[Diagnostics] Failed to send to backend:', err);
    }
    
    if (onDiagnosticCapture) {
      onDiagnosticCapture(diagnostic);
    }
    
    return diagnostic;
  }, [wsRef, terminalRef, tabId, eventLog, onDiagnosticCapture]);
  
  // Copy diagnostics to clipboard
  const copyToClipboard = useCallback(() => {
    if (lastDiagnostic) {
      const text = JSON.stringify(lastDiagnostic, null, 2);
      navigator.clipboard.writeText(text)
        .then(() => console.log('[Diagnostics] Copied to clipboard'))
        .catch(err => console.error('[Diagnostics] Clipboard copy failed:', err));
    }
  }, [lastDiagnostic]);
  
  if (!isVisible) return null;
  
  return (
    <div className="diagnostics-container">
      {/* Main diagnostic button */}
      <button
        className={`diagnostics-button ${lockoutWarning ? 'warning' : ''}`}
        onClick={() => {
          captureDiagnostics();
          setIsExpanded(true);
        }}
        title="Click when keyboard is locked to capture diagnostics"
      >
        {lockoutWarning ? (
          <AlertTriangle size={16} className="pulse" />
        ) : (
          <Bug size={16} />
        )}
        {lockoutWarning && <span className="warning-text">Input Issue?</span>}
      </button>
      
      {/* Expanded panel with results */}
      {isExpanded && lastDiagnostic && (
        <div className="diagnostics-panel">
          <div className="diagnostics-header">
            <h4>🔍 Keyboard Diagnostics</h4>
            <div className="diagnostics-actions">
              <button onClick={copyToClipboard} title="Copy to clipboard">
                <ClipboardCopy size={14} />
              </button>
              <button onClick={() => setIsExpanded(false)} title="Close">
                <X size={14} />
              </button>
            </div>
          </div>
          
          <div className="diagnostics-content">
            <div className="diagnostic-section">
              <h5>WebSocket</h5>
              <p>State: <strong>{lastDiagnostic.wsState.readyStateText || 'N/A'}</strong></p>
              <p>Buffered: {lastDiagnostic.wsState.bufferedAmount ?? 'N/A'} bytes</p>
            </div>
            
            <div className="diagnostic-section">
              <h5>Focus</h5>
              <p>Active: <strong>{lastDiagnostic.focusState.activeElement}</strong></p>
              <p>Document has focus: {lastDiagnostic.focusState.hasFocus ? '✅' : '❌'}</p>
              <p>Visibility: {lastDiagnostic.focusState.visibilityState}</p>
            </div>
            
            <div className="diagnostic-section">
              <h5>Main Thread</h5>
              <p>Delay: <strong className={lastDiagnostic.mainThreadDelayMs > 50 ? 'warning' : ''}>
                {lastDiagnostic.mainThreadDelayMs}ms
              </strong></p>
              <p>Busy: {lastDiagnostic.mainThreadBusy ? '⚠️ YES' : '✅ No'}</p>
            </div>
            
            <div className="diagnostic-section">
              <h5>Keyboard Events</h5>
              <p>Total: {lastDiagnostic.eventStats.totalKeyEvents}</p>
              <p>Since last: {Math.round(lastDiagnostic.eventStats.timeSinceLastEvent)}ms</p>
              <p>Pending keys: {lastDiagnostic.eventStats.pendingKeys.length}</p>
              {lastDiagnostic.eventStats.pendingKeys.length > 0 && (
                <ul className="pending-keys">
                  {lastDiagnostic.eventStats.pendingKeys.map((k, i) => (
                    <li key={i}>{k.key} ({k.pendingMs}ms)</li>
                  ))}
                </ul>
              )}
            </div>
            
            {lastDiagnostic.perfMetrics.memory !== 'unavailable' && (
              <div className="diagnostic-section">
                <h5>Memory</h5>
                <p>Used: {lastDiagnostic.perfMetrics.memory.usedJSHeapSize}MB</p>
                <p>Total: {lastDiagnostic.perfMetrics.memory.totalJSHeapSize}MB</p>
              </div>
            )}
            
            <div className="diagnostic-section">
              <h5>Recent Events (last 5)</h5>
              <div className="event-log">
                {lastDiagnostic.eventStats.recentEvents.slice(-5).map((e, i) => (
                  <div key={i} className="event-entry">
                    <span className="event-type">{e.type}</span>
                    <span className="event-key">{e.key}</span>
                    <span className="event-gap">+{e.timeSinceLast}ms</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="diagnostics-footer">
            <small>Captured: {new Date(lastDiagnostic.capturedAt).toLocaleTimeString()}</small>
            <button onClick={captureDiagnostics} className="btn-refresh">
              Refresh
            </button>
          </div>
        </div>
      )}
      
      <style>{`
        .diagnostics-container {
          position: absolute;
          bottom: 12px;
          left: 12px;
          z-index: 1000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .diagnostics-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: rgba(40, 40, 40, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #888;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
          backdrop-filter: blur(4px);
        }
        
        .diagnostics-button:hover {
          background: rgba(60, 60, 60, 0.95);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.2);
        }
        
        .diagnostics-button.warning {
          background: rgba(180, 80, 20, 0.9);
          border-color: rgba(255, 150, 50, 0.5);
          color: #fff;
          animation: pulse-glow 1.5s infinite;
        }
        
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 150, 50, 0.4); }
          50% { box-shadow: 0 0 12px 4px rgba(255, 150, 50, 0.6); }
        }
        
        .warning-text {
          font-weight: 500;
        }
        
        .pulse {
          animation: pulse-icon 1s infinite;
        }
        
        @keyframes pulse-icon {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .diagnostics-panel {
          position: absolute;
          bottom: 48px;
          left: 0;
          width: 320px;
          max-height: 450px;
          overflow-y: auto;
          background: rgba(30, 30, 30, 0.98);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(8px);
        }
        
        .diagnostics-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          position: sticky;
          top: 0;
          background: rgba(30, 30, 30, 0.98);
        }
        
        .diagnostics-header h4 {
          margin: 0;
          font-size: 14px;
          color: #fff;
        }
        
        .diagnostics-actions {
          display: flex;
          gap: 8px;
        }
        
        .diagnostics-actions button {
          padding: 4px;
          background: transparent;
          border: none;
          color: #888;
          cursor: pointer;
          border-radius: 4px;
        }
        
        .diagnostics-actions button:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        
        .diagnostics-content {
          padding: 12px 16px;
        }
        
        .diagnostic-section {
          margin-bottom: 16px;
        }
        
        .diagnostic-section h5 {
          margin: 0 0 8px 0;
          font-size: 11px;
          text-transform: uppercase;
          color: #888;
          letter-spacing: 0.5px;
        }
        
        .diagnostic-section p {
          margin: 4px 0;
          font-size: 13px;
          color: #ccc;
        }
        
        .diagnostic-section strong {
          color: #fff;
        }
        
        .diagnostic-section strong.warning {
          color: #f97316;
        }
        
        .pending-keys {
          margin: 4px 0 0 16px;
          padding: 0;
          list-style: none;
          font-size: 12px;
          color: #f97316;
        }
        
        .event-log {
          font-size: 11px;
          font-family: 'Fira Code', monospace;
        }
        
        .event-entry {
          display: flex;
          gap: 8px;
          padding: 2px 0;
          color: #888;
        }
        
        .event-type {
          width: 60px;
          color: #666;
        }
        
        .event-key {
          width: 80px;
          color: #fff;
        }
        
        .event-gap {
          color: #555;
        }
        
        .diagnostics-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(20, 20, 20, 0.5);
        }
        
        .diagnostics-footer small {
          color: #666;
          font-size: 11px;
        }
        
        .btn-refresh {
          padding: 4px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 4px;
          color: #ccc;
          font-size: 12px;
          cursor: pointer;
        }
        
        .btn-refresh:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }
      `}</style>
    </div>
  );
};

export default DiagnosticsButton;
