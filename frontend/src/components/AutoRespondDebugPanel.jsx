import React, { useState, useEffect } from 'react';
import { Bug, X } from 'lucide-react';

const AutoRespondDebugPanel = () => {
  const [logs, setLogs] = useState([]);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    // Intercept console.log for [Auto-Respond] messages
    const originalLog = console.log;
    console.log = function(...args) {
      originalLog.apply(console, args);
      
      // Check if this is an auto-respond log
      if (args[0] && typeof args[0] === 'string' && args[0].includes('[Auto-Respond]')) {
        const timestamp = new Date().toLocaleTimeString();
        const data = args[1] || {};
        
        setLogs(prev => {
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

    return () => {
      console.log = originalLog;
    };
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '12px',
          backgroundColor: '#ff6b00',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
          zIndex: 10000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <Bug size={24} />
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '600px',
      maxHeight: '500px',
      backgroundColor: '#1e1e1e',
      border: '2px solid #ff6b00',
      borderRadius: '8px',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#ff6b00',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopLeftRadius: '6px',
        borderTopRightRadius: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
          <Bug size={20} />
          <span>Auto-Respond Debug Monitor</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex'
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Logs */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        fontSize: '12px',
        fontFamily: 'monospace',
        color: '#e0e0e0'
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
            Waiting for auto-respond activity...
          </div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} style={{
              marginBottom: '12px',
              padding: '8px',
              backgroundColor: '#2d2d2d',
              borderRadius: '4px',
              borderLeft: log.message.includes('ACTIVATED') ? '3px solid #00ff00' : 
                          log.message.includes('ENABLED') ? '3px solid #0080ff' :
                          '3px solid #666'
            }}>
              <div style={{ color: '#888', marginBottom: '4px' }}>{log.timestamp}</div>
              <div style={{ 
                color: log.message.includes('ACTIVATED') ? '#00ff00' : 
                       log.message.includes('ENABLED') ? '#0080ff' : '#fff',
                fontWeight: 'bold',
                marginBottom: '6px'
              }}>
                {log.message}
              </div>
              {log.data && Object.keys(log.data).length > 0 && (
                <div style={{ marginTop: '6px' }}>
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
                  {log.data.autoRespondEnabled !== undefined && (
                    <div style={{ color: log.data.autoRespondEnabled ? '#00ff00' : '#888' }}>
                      🔧 Enabled: {log.data.autoRespondEnabled ? 'YES' : 'NO'}
                    </div>
                  )}
                  {log.data.bufferLength !== undefined && (
                    <div style={{ color: '#888' }}>
                      📊 Buffer: {log.data.bufferLength} chars
                    </div>
                  )}
                  {log.data.cleanPreview && (
                    <div style={{ 
                      marginTop: '6px', 
                      padding: '6px',
                      backgroundColor: '#1a1a1a',
                      borderRadius: '3px',
                      color: '#0f0',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      maxHeight: '100px',
                      overflowY: 'auto'
                    }}>
                      <div style={{ color: '#888', marginBottom: '4px' }}>Buffer Content:</div>
                      {log.data.cleanPreview}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
        backgroundColor: '#2d2d2d',
        borderTop: '1px solid #444',
        fontSize: '11px',
        color: '#888',
        display: 'flex',
        justifyContent: 'space-between',
        borderBottomLeftRadius: '6px',
        borderBottomRightRadius: '6px'
      }}>
        <span>Logs: {logs.length}/20</span>
        <button
          onClick={() => setLogs([])}
          style={{
            background: 'none',
            border: '1px solid #666',
            color: '#888',
            cursor: 'pointer',
            padding: '2px 8px',
            borderRadius: '3px',
            fontSize: '10px'
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default AutoRespondDebugPanel;
