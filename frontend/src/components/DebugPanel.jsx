import React, { useState, useEffect } from 'react';
import { Bug, RefreshCw, MessageSquare, Activity } from 'lucide-react';

/**
 * DebugPanel - System diagnostics and feedback in sidebar
 */
const DebugPanel = ({ terminalRef, tabId }) => {
  const [diagnostics, setDiagnostics] = useState(null);
  const [freezeMetrics, setFreezeMetrics] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoRespondLogs, setAutoRespondLogs] = useState([]);

  const fetchFreezeMetrics = async () => {
    try {
      const res = await fetch('/api/diagnostics/freeze/current');
      const data = await res.json();
      if (data.success) {
        setFreezeMetrics(data.current);
      }
    } catch (e) {
      console.error('Failed to fetch freeze metrics', e);
    }
  };

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
    fetchFreezeMetrics();

    // Intercept console.log for [Auto-Respond] messages
    const originalLog = console.log;
    console.log = function(...args) {
      originalLog.apply(console, args);
      
      // Check if this is an auto-respond log
      if (args[0] && typeof args[0] === 'string' && args[0].includes('[Auto-Respond]')) {
        const timestamp = new Date().toLocaleTimeString();
        const data = args[1] || {};
        
        setAutoRespondLogs(prev => {
          const newLogs = [...prev, {
            timestamp,
            message: args[0],
            data: JSON.parse(JSON.stringify(data))
          }];
          // Keep last 20 logs
          return newLogs.slice(-20);
        });
      }
    };

    // Auto-refresh if enabled
    if (autoRefresh) {
      const interval = setInterval(() => {
        captureDiagnostics();
        fetchFreezeMetrics();
      }, 2000);
      return () => clearInterval(interval);
    }

    return () => {
      console.log = originalLog;
    };
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
            onClick={() => {
              captureDiagnostics();
              fetchFreezeMetrics();
            }}
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
          <div style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}>
              <h4 style={{ margin: 0, color: '#fff', fontSize: '12px' }}>Freeze Monitor</h4>
              <Activity size={14} color="#888" />
            </div>
            
            {freezeMetrics ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Goroutines:</strong> {freezeMetrics.goroutineCount}</div>
                <div><strong>Heap:</strong> {freezeMetrics.heapAllocMB.toFixed(1)}MB</div>
                <div><strong>GC Pause:</strong> {freezeMetrics.gcLastPauseMs.toFixed(1)}ms</div>
                
                {freezeMetrics.alerts && freezeMetrics.alerts.length > 0 && (
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '8px', 
                    background: 'rgba(239, 68, 68, 0.1)', 
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '4px',
                    color: '#fca5a5'
                  }}>
                    <strong>Alerts:</strong>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                      {freezeMetrics.alerts.map((alert, i) => (
                        <li key={i}>{alert}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '10px', 
                  color: '#888',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                  paddingTop: '8px'
                }}>
                  <strong>Log file:</strong><br/>
                  ~/.forge/logs/freeze-monitor/
                </div>
              </div>
            ) : (
              <div style={{ color: '#888', fontStyle: 'italic' }}>Loading metrics...</div>
            )}
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

          {/* Auto-Respond Monitor */}
          <div style={{
            padding: '12px',
            background: 'rgba(255, 107, 0, 0.05)',
            borderRadius: '8px',
            border: '2px solid rgba(255, 107, 0, 0.3)',
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}>
              <h4 style={{ margin: 0, color: '#ff6b00', fontSize: '12px', fontWeight: 'bold' }}>
                Auto-Respond Monitor
              </h4>
              <div style={{ 
                fontSize: '10px', 
                color: '#888',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>Logs: {autoRespondLogs.length}/20</span>
                <button
                  onClick={() => setAutoRespondLogs([])}
                  style={{
                    background: 'none',
                    border: '1px solid #666',
                    color: '#888',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '9px'
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              fontSize: '11px',
              fontFamily: 'monospace'
            }}>
              {autoRespondLogs.length === 0 ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '16px', fontStyle: 'italic' }}>
                  Waiting for auto-respond activity...
                </div>
              ) : (
                autoRespondLogs.map((log, idx) => (
                  <div key={idx} style={{
                    marginBottom: '8px',
                    padding: '6px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '3px',
                    borderLeft: log.message.includes('ACTIVATED') ? '2px solid #00ff00' : 
                                log.message.includes('ENABLED') ? '2px solid #0080ff' :
                                log.message.includes('waiting') ? '2px solid #ffa500' :
                                '2px solid #666'
                  }}>
                    <div style={{ color: '#666', marginBottom: '2px', fontSize: '9px' }}>
                      {log.timestamp}
                    </div>
                    <div style={{ 
                      color: log.message.includes('ACTIVATED') ? '#00ff00' : 
                             log.message.includes('ENABLED') ? '#0080ff' :
                             log.message.includes('waiting') ? '#ffa500' : '#ccc',
                      fontWeight: log.message.includes('ACTIVATED') || log.message.includes('waiting') ? 'bold' : 'normal',
                      marginBottom: '4px',
                      fontSize: '10px'
                    }}>
                      {log.message}
                    </div>
                    {log.data && Object.keys(log.data).length > 0 && (
                      <div style={{ fontSize: '9px', color: '#888' }}>
                        {log.data.waiting !== undefined && (
                          <div style={{ color: log.data.waiting ? '#00ff00' : '#ff4444' }}>
                            ⚡ Waiting: {log.data.waiting ? 'YES' : 'NO'}
                          </div>
                        )}
                        {log.data.responseType && (
                          <div style={{ color: '#ffa500' }}>
                            📤 Response: {log.data.responseType}
                          </div>
                        )}
                        {log.data.confidence && (
                          <div style={{ color: '#0080ff' }}>
                            🎯 Confidence: {log.data.confidence}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
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
