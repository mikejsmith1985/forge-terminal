import React, { useState } from 'react';
import { Bug } from 'lucide-react';

/**
 * Simple DiagnosticsButton - Captures system state for debugging keyboard issues
 */
const DiagnosticsButton = ({ terminalRef, wsRef, tabId, isVisible = true }) => {
  const [showPanel, setShowPanel] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);

  const captureDiagnostics = () => {
    console.log('[Diagnostics] Capturing snapshot...');
    
    const snapshot = {
      timestamp: new Date().toISOString(),
      tabId,
      textareas: document.querySelectorAll('.xterm-helper-textarea').length,
      activeElement: document.activeElement?.tagName || 'none',
      hasFocus: document.hasFocus(),
      wsState: wsRef?.current?.readyState || 'no-ref',
    };
    
    console.log('[Diagnostics] Snapshot:', snapshot);
    setDiagnostics(snapshot);
  };

  const handleClick = () => {
    console.log('[Diagnostics] Button clicked, showPanel:', showPanel);
    captureDiagnostics();
    setShowPanel(true);
  };

  const handleClose = () => {
    console.log('[Diagnostics] Closing panel');
    setShowPanel(false);
  };

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: '12px',
      left: '12px',
      zIndex: 1000,
    }}>
      <button
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px',
          background: 'rgba(40, 40, 40, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          color: '#888',
          cursor: 'pointer',
          fontSize: '12px',
        }}
      >
        <Bug size={16} />
        Debug
      </button>

      {showPanel && (
        <div style={{
          position: 'absolute',
          bottom: '48px',
          left: '0',
          width: '300px',
          maxHeight: '400px',
          overflowY: 'auto',
          background: 'rgba(30, 30, 30, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          padding: '16px',
          color: '#ccc',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: '#fff' }}>Diagnostics</h4>
            <button onClick={handleClose} style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: '18px',
            }}>×</button>
          </div>

          {diagnostics && (
            <div style={{ fontSize: '13px' }}>
              <p><strong>Tab ID:</strong> {diagnostics.tabId}</p>
              <p><strong>Textareas:</strong> {diagnostics.textareas}</p>
              <p><strong>Active Element:</strong> {diagnostics.activeElement}</p>
              <p><strong>Has Focus:</strong> {diagnostics.hasFocus ? '✅' : '❌'}</p>
              <p><strong>WebSocket:</strong> {diagnostics.wsState}</p>
              <p><strong>Time:</strong> {new Date(diagnostics.timestamp).toLocaleTimeString()}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiagnosticsButton;
