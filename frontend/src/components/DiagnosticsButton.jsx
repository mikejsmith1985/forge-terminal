import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bug, AlertTriangle, X, ClipboardCopy, MessageSquare } from 'lucide-react';

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
  onDiagnosticCapture = null,
  onFeedbackClick = null
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastDiagnostic, setLastDiagnostic] = useState(null);
  const [lockoutWarning, setLockoutWarning] = useState(false);
  const [eventLog, setEventLog] = useState([]);
  const [spacebarTest, setSpacebarTest] = useState({ active: false, result: null });
  
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
  
  // Periodic focus restoration - aggressively restore focus when panel is open
  useEffect(() => {
    if (!isVisible || !isExpanded) return;
    
    const focusInterval = setInterval(() => {
      // If diagnostics panel is open and terminal doesn't have focus, restore it
      const activeEl = document.activeElement;
      const isTerminalFocused = activeEl?.classList?.contains('xterm-helper-textarea');
      
      if (!isTerminalFocused && terminalRef?.current?.focus) {
        console.log('[Diagnostics] Auto-restoring terminal focus from:', activeEl?.tagName);
        terminalRef.current.focus();
      }
    }, 100); // Check every 100ms
    
    return () => clearInterval(focusInterval);
  }, [isVisible, isExpanded, terminalRef]);
  
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
  
  // Test spacebar responsiveness
  const testSpacebar = useCallback(() => {
    setSpacebarTest({ active: true, result: null });
    
    const startTime = performance.now();
    let detected = false;
    let responseTime = null;
    
    const handler = (e) => {
      if (e.code === 'Space' && !detected) {
        detected = true;
        responseTime = Math.round(performance.now() - startTime);
        
        setSpacebarTest({
          active: false,
          result: {
            detected: true,
            responseTime,
            prevented: e.defaultPrevented,
            target: e.target?.tagName || 'unknown',
            timestamp: new Date().toISOString(),
          }
        });
        
        cleanup();
        
        // Restore focus to terminal after test
        if (terminalRef?.current?.focus) {
          setTimeout(() => terminalRef.current.focus(), 50);
        }
      }
    };
    
    const cleanup = () => {
      window.removeEventListener('keydown', handler, true);
      clearTimeout(timeout);
    };
    
    // Listen for 5 seconds
    window.addEventListener('keydown', handler, true);
    
    const timeout = setTimeout(() => {
      if (!detected) {
        setSpacebarTest({
          active: false,
          result: {
            detected: false,
            timedOut: true,
            timestamp: new Date().toISOString(),
          }
        });
      }
      cleanup();
    }, 5000);
    
    return cleanup;
  }, []);
  
  if (!isVisible) return null;
  
  return (
    <div className="diagnostics-container">
      {/* Main diagnostic button */}
      <button
        className={`diagnostics-button ${lockoutWarning ? 'warning' : ''}`}
        tabIndex={-1}
        onClick={(e) => {
          // Prevent button from capturing focus - return to terminal
          e.currentTarget.blur();
          captureDiagnostics();
          setIsExpanded(true);
          // Refocus terminal after capture
          if (terminalRef?.current?.focus) {
            setTimeout(() => terminalRef.current.focus(), 10);
          }
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
              <button tabIndex={-1} onClick={(e) => { 
                e.currentTarget.blur(); 
                copyToClipboard();
                // Restore focus to terminal after copy
                if (terminalRef?.current?.focus) {
                  setTimeout(() => terminalRef.current.focus(), 50);
                }
              }} title="Copy to clipboard">
                <ClipboardCopy size={14} />
              </button>
              <button tabIndex={-1} onClick={(e) => { 
                e.currentTarget.blur(); 
                setIsExpanded(false);
                // Restore focus to terminal when closing panel
                if (terminalRef?.current?.focus) {
                  setTimeout(() => terminalRef.current.focus(), 50);
                }
              }} title="Close">
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
            
            {/* Spacebar Test Section */}
            <div className="diagnostic-section spacebar-test-section">
              <h5>⌨️ Spacebar Test</h5>
              {!spacebarTest.active && !spacebarTest.result && (
                <button 
                  className="btn-test-spacebar" 
                  tabIndex={-1}
                  onClick={(e) => { 
                    e.currentTarget.blur(); 
                    testSpacebar();
                    // Focus will be restored after test completes or times out
                  }}
                >
                  Test Spacebar Now
                </button>
              )}
              
              {spacebarTest.active && (
                <div className="spacebar-waiting">
                  <div className="pulse-indicator">⏳</div>
                  <p className="waiting-text">Press Spacebar...</p>
                  <small>Listening for 5 seconds</small>
                </div>
              )}
              
              {spacebarTest.result && (
                <div className={`spacebar-result ${spacebarTest.result.detected ? 'success' : 'failure'}`}>
                  {spacebarTest.result.detected ? (
                    <>
                      <div className="result-icon">✅</div>
                      <p><strong>Spacebar Detected!</strong></p>
                      <p className="result-detail">Response: <strong>{spacebarTest.result.responseTime}ms</strong></p>
                      <p className="result-detail">Target: {spacebarTest.result.target}</p>
                      <p className="result-detail">Prevented: {spacebarTest.result.prevented ? 'Yes' : 'No'}</p>
                    </>
                  ) : (
                    <>
                      <div className="result-icon">❌</div>
                      <p><strong>No Spacebar Detected</strong></p>
                      <p className="result-detail">Timed out after 5 seconds</p>
                    </>
                  )}
                  <button 
                    className="btn-test-again" 
                    tabIndex={-1}
                    onClick={(e) => { 
                      e.currentTarget.blur(); 
                      setSpacebarTest({ active: false, result: null });
                      // Restore focus to terminal
                      if (terminalRef?.current?.focus) {
                        setTimeout(() => terminalRef.current.focus(), 50);
                      }
                    }}
                  >
                    Test Again
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="diagnostics-footer">
            <div className="footer-left">
              <small>Captured: {new Date(lastDiagnostic.capturedAt).toLocaleTimeString()}</small>
            </div>
            <div className="footer-actions">
              {onFeedbackClick && (
                <button 
                  tabIndex={-1} 
                  onClick={(e) => { 
                    e.currentTarget.blur(); 
                    onFeedbackClick();
                    // Restore focus to terminal after opening feedback
                    if (terminalRef?.current?.focus) {
                      setTimeout(() => terminalRef.current.focus(), 50);
                    }
                  }} 
                  className="btn-feedback-diag"
                  title="Send Feedback"
                >
                  <MessageSquare size={14} />
                  Feedback
                </button>
              )}
              <button tabIndex={-1} onClick={(e) => { 
                e.currentTarget.blur(); 
                captureDiagnostics();
                // Restore focus to terminal after refresh
                if (terminalRef?.current?.focus) {
                  setTimeout(() => terminalRef.current.focus(), 50);
                }
              }} className="btn-refresh">
                Refresh
              </button>
            </div>
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
          gap: 12px;
        }
        
        .footer-left {
          flex: 1;
        }
        
        .footer-actions {
          display: flex;
          gap: 8px;
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
          transition: all 0.2s;
        }
        
        .btn-refresh:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }
        
        .btn-feedback-diag {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 12px;
          background: rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 4px;
          color: #60a5fa;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-feedback-diag:hover {
          background: rgba(59, 130, 246, 0.3);
          border-color: rgba(59, 130, 246, 0.5);
          color: #93c5fd;
        }
        
        /* Spacebar Test Styles */
        .spacebar-test-section {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 16px;
        }
        
        .btn-test-spacebar {
          width: 100%;
          padding: 10px 16px;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.8));
          border: none;
          border-radius: 8px;
          color: #fff;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-test-spacebar:hover {
          background: linear-gradient(135deg, rgba(59, 130, 246, 1), rgba(37, 99, 235, 1));
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }
        
        .spacebar-waiting {
          text-align: center;
          padding: 20px;
          background: rgba(59, 130, 246, 0.1);
          border-radius: 8px;
          border: 2px dashed rgba(59, 130, 246, 0.3);
        }
        
        .pulse-indicator {
          font-size: 32px;
          animation: pulse-scale 1s infinite;
        }
        
        @keyframes pulse-scale {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        
        .waiting-text {
          margin: 8px 0 4px 0;
          font-size: 14px;
          font-weight: 500;
          color: #fff;
        }
        
        .spacebar-waiting small {
          color: #888;
          font-size: 11px;
        }
        
        .spacebar-result {
          text-align: center;
          padding: 16px;
          border-radius: 8px;
        }
        
        .spacebar-result.success {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        
        .spacebar-result.failure {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        
        .result-icon {
          font-size: 40px;
          margin-bottom: 8px;
        }
        
        .spacebar-result p {
          margin: 4px 0;
        }
        
        .spacebar-result strong {
          color: #fff;
        }
        
        .result-detail {
          font-size: 12px;
          color: #aaa;
        }
        
        .btn-test-again {
          margin-top: 12px;
          padding: 6px 16px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 4px;
          color: #ccc;
          font-size: 12px;
          cursor: pointer;
        }
        
        .btn-test-again:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }
      `}</style>
    </div>
  );
};

export default DiagnosticsButton;
