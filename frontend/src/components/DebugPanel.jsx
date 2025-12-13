import React, { useState, useEffect } from 'react';
import { Bug, RefreshCw, MessageSquare } from 'lucide-react';

/**
 * DebugPanel - System diagnostics and feedback in sidebar
 */
const DebugPanel = ({ terminalRef, tabId, onFeedbackClick }) => {
  const [diagnostics, setDiagnostics] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const captureDiagnostics = () => {
    console.log('[DebugPanel] Capturing snapshot...');
    
    const snapshot = {
      timestamp: new Date().toISOString(),
      tabId,
      textareas: document.querySelectorAll('.xterm-helper-textarea').length,
      activeElement: document.activeElement?.tagName || 'none',
      activeElementClass: document.activeElement?.className || 'none',
      hasFocus: document.hasFocus(),
      wsState: terminalRef?.wsRef?.current?.readyState ?? 'no-ref',
      wsStateText: getWebSocketState(terminalRef?.wsRef?.current?.readyState),
      terminalRows: terminalRef?.terminal?.rows || 'unknown',
      terminalCols: terminalRef?.terminal?.cols || 'unknown',
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
    
    console.log('[DebugPanel] Snapshot:', snapshot);
    setDiagnostics(snapshot);
  };

  const getWebSocketState = (state) => {
    switch (state) {
      case 0: return 'CONNECTING';
      case 1: return 'OPEN';
      case 2: return 'CLOSING';
      case 3: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  };

  useEffect(() => {
    // Initial capture
    captureDiagnostics();

    // Auto-refresh if enabled
    if (autoRefresh) {
      const interval = setInterval(captureDiagnostics, 2000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, tabId]);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px',
      color: '#ccc',
      fontSize: '13px',
      overflowY: 'auto',
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bug size={20} color="#888" />
          <h3 style={{ margin: 0, color: '#fff' }}>Debug Info</h3>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: '4px 8px',
              background: autoRefresh ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${autoRefresh ? '#4caf50' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '4px',
              color: autoRefresh ? '#4caf50' : '#888',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Auto {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={captureDiagnostics}
            style={{
              padding: '4px 8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              color: '#888',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {diagnostics ? (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px',
        }}>
          {/* Feedback Section - Always at top */}
          <div style={{
            padding: '16px',
            background: 'rgba(249, 115, 22, 0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(249, 115, 22, 0.3)',
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}>
              <h4 style={{ margin: 0, color: '#fb923c', fontSize: '13px', fontWeight: '600' }}>
                Report Feedback
              </h4>
              <MessageSquare size={16} color="#fb923c" />
            </div>
            <p style={{ 
              fontSize: '12px', 
              color: '#ccc', 
              marginBottom: '12px',
              lineHeight: '1.5',
            }}>
              Found a bug or have a feature request? Create a GitHub issue with automatic screenshot capture and diagnostics.
            </p>
            <button
              onClick={onFeedbackClick}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(249, 115, 22, 0.2)',
                border: '1px solid rgba(249, 115, 22, 0.4)',
                borderRadius: '6px',
                color: '#fb923c',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(249, 115, 22, 0.3)';
                e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.6)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(249, 115, 22, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.4)';
              }}
            >
              <MessageSquare size={16} />
              Send Feedback
            </button>
          </div>

          <div style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '12px' }}>Terminal Info</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div><strong>Tab ID:</strong> {diagnostics.tabId}</div>
              <div><strong>Rows × Cols:</strong> {diagnostics.terminalRows} × {diagnostics.terminalCols}</div>
              <div><strong>Textareas:</strong> {diagnostics.textareas}</div>
            </div>
          </div>

          <div style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '12px' }}>Focus State</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div><strong>Active Element:</strong> {diagnostics.activeElement}</div>
              <div><strong>Element Class:</strong> <span style={{ fontSize: '11px', wordBreak: 'break-all' }}>{diagnostics.activeElementClass}</span></div>
              <div><strong>Has Focus:</strong> {diagnostics.hasFocus ? '✅ Yes' : '❌ No'}</div>
            </div>
          </div>

          <div style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '12px' }}>WebSocket</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div><strong>State:</strong> {diagnostics.wsStateText}</div>
              <div><strong>Code:</strong> {diagnostics.wsState}</div>
            </div>
          </div>

          <div style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '12px' }}>Viewport</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div><strong>Width:</strong> {diagnostics.viewportWidth}px</div>
              <div><strong>Height:</strong> {diagnostics.viewportHeight}px</div>
            </div>
          </div>

          <div style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '12px' }}>Last Updated</h4>
            <div style={{ fontSize: '11px', color: '#888' }}>
              {new Date(diagnostics.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '200px',
          color: '#888',
        }}>
          Loading diagnostics...
        </div>
      )}
    </div>
  );
};

export default DebugPanel;
