import React, { useState, useEffect } from 'react';
import { Eye, X } from 'lucide-react';

const AMDebugPanel = () => {
  const [logs, setLogs] = useState([]);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    // Intercept console.log for [AM] and [LLM Logger] messages
    const originalLog = console.log;
    console.log = function(...args) {
      originalLog.apply(console, args);
      
      // Check if this is an AM-related log
      if (args[0] && typeof args[0] === 'string') {
        const isAMLog = args[0].includes('[AM') || 
                        args[0].includes('[LLM Logger]') ||
                        args[0].includes('LLM_START') ||
                        args[0].includes('LLM_END') ||
                        args[0].includes('TURN_ADD') ||
                        args[0].includes('SNAPSHOT_');
        
        if (isAMLog) {
          const timestamp = new Date().toLocaleTimeString();
          
          setLogs(prev => {
            const newLogs = [...prev, {
              timestamp,
              message: args[0],
              data: args.length > 1 ? JSON.parse(JSON.stringify(args[1] || {})) : {}
            }];
            // Keep last 30 logs
            return newLogs.slice(-30);
          });
        }
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
          bottom: '80px',
          right: '20px',
          padding: '12px',
          backgroundColor: '#0080ff',
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
        <Eye size={24} />
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      right: '20px',
      width: '600px',
      maxHeight: '500px',
      backgroundColor: '#1e1e1e',
      border: '2px solid #0080ff',
      borderRadius: '8px',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#0080ff',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopLeftRadius: '6px',
        borderTopRightRadius: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
          <Eye size={20} />
          <span>AM Logger Debug Monitor</span>
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
            Waiting for AM Logger activity...
          </div>
        ) : (
          logs.map((log, idx) => {
            const isEvent = log.message.includes('LLM_START') || 
                           log.message.includes('LLM_END') ||
                           log.message.includes('TURN_ADD') ||
                           log.message.includes('SNAPSHOT_');
            const isError = log.message.includes('ERROR') || log.message.includes('⚠️');
            const isSuccess = log.message.includes('✓') || log.message.includes('START');
            
            return (
              <div key={idx} style={{
                marginBottom: '12px',
                padding: '8px',
                backgroundColor: '#2d2d2d',
                borderRadius: '4px',
                borderLeft: isError ? '3px solid #ff4444' :
                           isSuccess ? '3px solid #00ff00' : 
                           isEvent ? '3px solid #ffa500' :
                           '3px solid #666'
              }}>
                <div style={{ color: '#888', marginBottom: '4px' }}>{log.timestamp}</div>
                <div style={{ 
                  color: isError ? '#ff4444' :
                         isSuccess ? '#00ff00' : 
                         isEvent ? '#ffa500' : '#fff',
                  fontWeight: isEvent || isError || isSuccess ? 'bold' : 'normal',
                  marginBottom: '6px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {log.message}
                </div>
                {log.data && Object.keys(log.data).length > 0 && (
                  <div style={{ 
                    marginTop: '6px',
                    padding: '6px',
                    backgroundColor: '#1a1a1a',
                    borderRadius: '3px',
                    fontSize: '11px'
                  }}>
                    {Object.entries(log.data).map(([key, value]) => (
                      <div key={key} style={{ 
                        color: '#0080ff',
                        marginBottom: '2px',
                        wordBreak: 'break-all'
                      }}>
                        <span style={{ color: '#888' }}>{key}:</span> {
                          typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
                        }
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
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
        <span>Logs: {logs.length}/30</span>
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

export default AMDebugPanel;
