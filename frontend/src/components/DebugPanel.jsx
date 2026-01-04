import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Bug, RefreshCw, MessageSquare, Activity, ChevronDown, ChevronRight, 
  Cpu, Wifi, Eye, Keyboard, Terminal as TerminalIcon, Gauge, AlertTriangle,
  GripVertical
} from 'lucide-react';
import { getRecentLogs } from '../utils/logger';
import FollowMeDebugger from './FollowMeDebugger';

/**
 * Collapsible Debug Card Component
 */
const DebugCard = ({ id, title, icon: Icon, children, defaultCollapsed = false, isActive = false }) => {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(`debug-card-${id}-collapsed`);
    return saved !== null ? saved === 'true' : defaultCollapsed;
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    localStorage.setItem(`debug-card-${id}-collapsed`, collapsed.toString());
  }, [collapsed, id]);

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="debug-card"
    >
      <div 
        className="debug-card-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '8px 8px 0 0',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderBottom: collapsed ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            {...attributes}
            {...listeners}
            style={{ cursor: 'grab', display: 'flex', alignItems: 'center', padding: '4px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} color="#666" />
          </div>
          <Icon size={14} color={isActive ? '#00ff00' : '#888'} />
          <h4 style={{ margin: 0, color: '#fff', fontSize: '12px', fontWeight: 600 }}>
            {title}
          </h4>
          {isActive && (
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#00ff00',
              animation: 'pulse 2s infinite',
            }} />
          )}
        </div>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </div>
      {!collapsed && (
        <div 
          className="debug-card-body"
          style={{
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '0 0 8px 8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderTop: 'none',
            fontSize: '11px',
            color: '#ccc',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Enhanced DebugPanel - Live monitoring with collapsible cards
 */
const DebugPanel = ({ terminalRef, tabId }) => {
  // Card order management
  const [cardOrder, setCardOrder] = useState(() => {
    const saved = localStorage.getItem('debug-card-order');
    return saved ? JSON.parse(saved) : [
      'terminal-info',
      'websocket',
      'auto-respond',
      'freeze-monitor',
      'performance',
      'keyboard',
      'console-logs',
      'focus-state',
      'viewport',
    ];
  });

  // State for each debug section
  const [diagnostics, setDiagnostics] = useState(null);
  const [freezeMetrics, setFreezeMetrics] = useState(null);
  const [autoRespondLogs, setAutoRespondLogs] = useState([]);
  const [keyboardEvents, setKeyboardEvents] = useState([]);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [performance, setPerformance] = useState({ fps: 0, memory: null, wsMessageRate: 0 });
  const [activeCards, setActiveCards] = useState(new Set());

  // Refs for performance tracking
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(Date.now());
  const wsMessageCountRef = useRef(0);
  const lastWsCheckRef = useRef(Date.now());
  const animationFrameRef = useRef(null);

  // Sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setCardOrder((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        localStorage.setItem('debug-card-order', JSON.stringify(newOrder));
        return newOrder;
      });
    }
  };

  // Check which cards are collapsed
  const isCardExpanded = useCallback((cardId) => {
    const saved = localStorage.getItem(`debug-card-${cardId}-collapsed`);
    const defaultCollapsed = cardId === 'freeze-monitor' || cardId === 'auto-respond';
    return saved !== null ? saved === 'false' : !defaultCollapsed;
  }, []);

  // Fetch freeze metrics
  const fetchFreezeMetrics = useCallback(async () => {
    if (!isCardExpanded('freeze-monitor')) return;
    
    try {
      const res = await fetch('/api/diagnostics/freeze/current');
      const data = await res.json();
      if (data.success) {
        setFreezeMetrics(data.current);
        setActiveCards(prev => {
          const next = new Set(prev);
          if (data.current?.alerts?.length > 0) {
            next.add('freeze-monitor');
          } else {
            next.delete('freeze-monitor');
          }
          return next;
        });
      }
    } catch (e) {
      console.error('[DebugPanel] Failed to fetch freeze metrics', e);
    }
  }, [isCardExpanded]);

  // Capture diagnostics snapshot
  const captureDiagnostics = useCallback(() => {
    if (!isCardExpanded('terminal-info') && 
        !isCardExpanded('websocket') && 
        !isCardExpanded('focus-state') && 
        !isCardExpanded('viewport')) {
      return;
    }

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
    
    setDiagnostics(snapshot);
    
    // Update active status
    setActiveCards(prev => {
      const next = new Set(prev);
      if (snapshot.wsStateText === 'OPEN') {
        next.add('websocket');
      } else {
        next.delete('websocket');
      }
      return next;
    });
  }, [tabId, terminalRef?.wsRef, terminalRef?.terminal, isCardExpanded]);

  const getWebSocketState = (state) => {
    switch (state) {
      case 0: return 'CONNECTING';
      case 1: return 'OPEN';
      case 2: return 'CLOSING';
      case 3: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  };

  // Performance monitoring - FPS counter
  const measureFPS = useCallback(() => {
    frameCountRef.current++;
    const now = Date.now();
    const elapsed = now - lastFrameTimeRef.current;
    
    if (elapsed >= 1000) {
      const fps = Math.round((frameCountRef.current * 1000) / elapsed);
      setPerformance(prev => ({ ...prev, fps }));
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }
    
    if (isCardExpanded('performance')) {
      animationFrameRef.current = requestAnimationFrame(measureFPS);
    }
  }, [isCardExpanded]);

  // Memory monitoring
  const measureMemory = useCallback(() => {
    if (!isCardExpanded('performance')) return;
    
    if (performance.memory && 'memory' in performance.memory) {
      const mem = performance.memory;
      setPerformance(prev => ({
        ...prev,
        memory: {
          used: (mem.usedJSHeapSize / 1048576).toFixed(1), // MB
          total: (mem.totalJSHeapSize / 1048576).toFixed(1),
          limit: (mem.jsHeapSizeLimit / 1048576).toFixed(1),
        }
      }));
    }
  }, [isCardExpanded]);

  // WebSocket message rate tracking
  // FIXED: Don't override ws.onmessage - use addEventListener instead
  useEffect(() => {
    if (!isCardExpanded('websocket') || !terminalRef?.wsRef?.current) return;

    const ws = terminalRef.wsRef.current;
    
    const handleMessage = () => {
      wsMessageCountRef.current++;
    };
    
    // Use addEventListener so we don't break the terminal's message handler
    ws.addEventListener('message', handleMessage);

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastWsCheckRef.current) / 1000;
      const rate = elapsed > 0 ? Math.round(wsMessageCountRef.current / elapsed) : 0;
      setPerformance(prev => ({ ...prev, wsMessageRate: rate }));
      wsMessageCountRef.current = 0;
      lastWsCheckRef.current = now;
    }, 1000);

    return () => {
      clearInterval(interval);
      ws.removeEventListener('message', handleMessage);
    };
  }, [terminalRef?.wsRef, isCardExpanded]);

  // Keyboard event tracking
  useEffect(() => {
    if (!isCardExpanded('keyboard')) return;

    const handleKeyEvent = (e) => {
      const event = {
        timestamp: new Date().toISOString(),
        type: e.type,
        key: e.key,
        code: e.code,
        target: e.target.tagName,
        targetClass: e.target.className?.substring(0, 30) || '',
      };
      
      setKeyboardEvents(prev => {
        const last3Mins = Date.now() - (3 * 60 * 1000);
        const filtered = prev.filter(evt => 
          new Date(evt.timestamp).getTime() > last3Mins
        );
        return [...filtered, event].slice(-20);
      });

      setActiveCards(prev => new Set(prev).add('keyboard'));
      setTimeout(() => {
        setActiveCards(prev => {
          const next = new Set(prev);
          next.delete('keyboard');
          return next;
        });
      }, 2000);
    };

    window.addEventListener('keydown', handleKeyEvent);
    window.addEventListener('keyup', handleKeyEvent);

    return () => {
      window.removeEventListener('keydown', handleKeyEvent);
      window.removeEventListener('keyup', handleKeyEvent);
    };
  }, [isCardExpanded]);

  // Console log tracking
  useEffect(() => {
    if (!isCardExpanded('console-logs')) return;

    const updateConsoleLogs = () => {
      const logs = getRecentLogs(3);
      if (logs) {
        const logLines = logs.split('\n').slice(-20);
        setConsoleLogs(logLines);
      }
    };

    updateConsoleLogs();
    const interval = setInterval(updateConsoleLogs, 1000);

    return () => clearInterval(interval);
  }, [isCardExpanded]);

  // Auto-Respond log interception
  // FIXED: Don't override console.log - use logger API instead
  useEffect(() => {
    if (!isCardExpanded('auto-respond')) return;

    // Instead of overriding console.log, poll the logger for auto-respond entries
    const checkAutoRespondLogs = () => {
      try {
        const logs = getRecentLogs(1); // Get last minute of logs
        if (logs) {
          const lines = logs.split('\n').filter(line => line.includes('[Auto-Respond]'));
          
          lines.forEach(line => {
            if (line) {
              const timestamp = new Date().toISOString();
              setAutoRespondLogs(prev => {
                // Check if this log already exists
                if (prev.some(log => log.message === line)) {
                  return prev;
                }
                
                const last3Mins = Date.now() - (3 * 60 * 1000);
                const filtered = prev.filter(log => 
                  new Date(log.timestamp).getTime() > last3Mins
                );
                return [...filtered, {
                  timestamp,
                  message: line,
                  data: {}
                }].slice(-20);
              });

              setActiveCards(prev => new Set(prev).add('auto-respond'));
            }
          });
        }
      } catch (e) {
        // Ignore errors
      }
    };

    checkAutoRespondLogs();
    const interval = setInterval(checkAutoRespondLogs, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isCardExpanded]);

  // Main update loop
  useEffect(() => {
    // Initial capture
    captureDiagnostics();
    fetchFreezeMetrics();
    measureMemory();

    // Start FPS monitoring if performance card is expanded
    if (isCardExpanded('performance')) {
      animationFrameRef.current = requestAnimationFrame(measureFPS);
    }

    // Update loop for expanded cards
    const interval = setInterval(() => {
      captureDiagnostics();
      fetchFreezeMetrics();
      measureMemory();
    }, 1000);

    return () => {
      clearInterval(interval);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [captureDiagnostics, fetchFreezeMetrics, measureMemory, measureFPS, isCardExpanded]);

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
      {/* Follow-Me Debugger - Top of Debug Panel */}
      <FollowMeDebugger />
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={cardOrder}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {cardOrder.map((cardId) => {
              switch (cardId) {
                case 'terminal-info':
                  return (
                    <DebugCard
                      key={cardId}
                      id={cardId}
                      title="Terminal Info"
                      icon={TerminalIcon}
                      defaultCollapsed={false}
                    >
                      {diagnostics && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div><strong>Tab ID:</strong> {diagnostics.tabId}</div>
                          <div><strong>Rows × Cols:</strong> {diagnostics.terminalRows} × {diagnostics.terminalCols}</div>
                          <div><strong>Textareas:</strong> {diagnostics.textareas}</div>
                          <div style={{ fontSize: '9px', color: '#666', marginTop: '4px' }}>
                            {new Date(diagnostics.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      )}
                    </DebugCard>
                  );

                case 'websocket':
                  return (
                    <DebugCard
                      key={cardId}
                      id={cardId}
                      title="WebSocket"
                      icon={Wifi}
                      defaultCollapsed={false}
                      isActive={activeCards.has(cardId)}
                    >
                      {diagnostics && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div><strong>State:</strong> {diagnostics.wsStateText}</div>
                          <div><strong>Code:</strong> {diagnostics.wsState}</div>
                          <div><strong>Message Rate:</strong> {performance.wsMessageRate} msg/s</div>
                        </div>
                      )}
                    </DebugCard>
                  );

                case 'auto-respond':
                  return (
                    <DebugCard
                      key={cardId}
                      id={cardId}
                      title="Auto-Respond Monitor"
                      icon={MessageSquare}
                      defaultCollapsed={true}
                      isActive={activeCards.has(cardId)}
                    >
                      <div style={{ maxHeight: '300px', overflowY: 'auto', fontSize: '10px', fontFamily: 'monospace' }}>
                        {autoRespondLogs.length === 0 ? (
                          <div style={{ color: '#888', textAlign: 'center', padding: '16px', fontStyle: 'italic' }}>
                            No activity in last 3 minutes
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
                              <div style={{ color: '#666', marginBottom: '2px', fontSize: '8px' }}>
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </div>
                              <div style={{ 
                                color: log.message.includes('ACTIVATED') ? '#00ff00' : 
                                       log.message.includes('ENABLED') ? '#0080ff' :
                                       log.message.includes('waiting') ? '#ffa500' : '#ccc',
                                fontWeight: log.message.includes('ACTIVATED') || log.message.includes('waiting') ? 'bold' : 'normal',
                                marginBottom: '4px',
                                fontSize: '9px'
                              }}>
                                {log.message}
                              </div>
                              {log.data && Object.keys(log.data).length > 0 && (
                                <div style={{ fontSize: '8px', color: '#888' }}>
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
                    </DebugCard>
                  );

                case 'freeze-monitor':
                  return (
                    <DebugCard
                      key={cardId}
                      id={cardId}
                      title="Freeze Monitor"
                      icon={Activity}
                      defaultCollapsed={true}
                      isActive={activeCards.has(cardId)}
                    >
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
                        </div>
                      ) : (
                        <div style={{ color: '#888', fontStyle: 'italic' }}>Loading metrics...</div>
                      )}
                    </DebugCard>
                  );

                case 'performance':
                  return (
                    <DebugCard
                      key={cardId}
                      id={cardId}
                      title="Performance"
                      icon={Gauge}
                      defaultCollapsed={false}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div><strong>FPS:</strong> {performance.fps}</div>
                        {performance.memory && (
                          <>
                            <div><strong>JS Heap:</strong> {performance.memory.used}MB / {performance.memory.total}MB</div>
                            <div><strong>Heap Limit:</strong> {performance.memory.limit}MB</div>
                          </>
                        )}
                      </div>
                    </DebugCard>
                  );

                case 'keyboard':
                  return (
                    <DebugCard
                      key={cardId}
                      id={cardId}
                      title="Keyboard Events"
                      icon={Keyboard}
                      defaultCollapsed={false}
                      isActive={activeCards.has(cardId)}
                    >
                      <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '10px', fontFamily: 'monospace' }}>
                        {keyboardEvents.length === 0 ? (
                          <div style={{ color: '#888', textAlign: 'center', padding: '16px', fontStyle: 'italic' }}>
                            No events in last 3 minutes
                          </div>
                        ) : (
                          keyboardEvents.map((evt, idx) => (
                            <div key={idx} style={{ marginBottom: '4px', padding: '4px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px' }}>
                              <div style={{ color: '#666', fontSize: '8px' }}>{new Date(evt.timestamp).toLocaleTimeString()}</div>
                              <div><strong>{evt.type}:</strong> {evt.key} ({evt.code})</div>
                              <div style={{ color: '#888', fontSize: '9px' }}>
                                {evt.target} {evt.targetClass && `- ${evt.targetClass}`}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </DebugCard>
                  );

                case 'console-logs':
                  return (
                    <DebugCard
                      key={cardId}
                      id={cardId}
                      title="Console Logs"
                      icon={Bug}
                      defaultCollapsed={false}
                    >
                      <div style={{ maxHeight: '300px', overflowY: 'auto', fontSize: '9px', fontFamily: 'monospace' }}>
                        {consoleLogs.length === 0 ? (
                          <div style={{ color: '#888', textAlign: 'center', padding: '16px', fontStyle: 'italic' }}>
                            No logs in last 3 minutes
                          </div>
                        ) : (
                          consoleLogs.map((log, idx) => (
                            <div key={idx} style={{ 
                              marginBottom: '2px', 
                              padding: '4px', 
                              background: 'rgba(0,0,0,0.3)',
                              color: log.includes('[ERROR]') ? '#ff6b6b' : 
                                     log.includes('[WARN]') ? '#ffa500' : '#ccc',
                              wordBreak: 'break-all'
                            }}>
                              {log}
                            </div>
                          ))
                        )}
                      </div>
                    </DebugCard>
                  );

                case 'focus-state':
                  return (
                    <DebugCard
                      key={cardId}
                      id={cardId}
                      title="Focus State"
                      icon={Eye}
                      defaultCollapsed={false}
                    >
                      {diagnostics && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div><strong>Active Element:</strong> {diagnostics.activeElement}</div>
                          <div><strong>Element Class:</strong> <span style={{ fontSize: '10px', wordBreak: 'break-all' }}>{diagnostics.activeElementClass}</span></div>
                          <div><strong>Has Focus:</strong> {diagnostics.hasFocus ? '✅ Yes' : '❌ No'}</div>
                        </div>
                      )}
                    </DebugCard>
                  );

                case 'viewport':
                  return (
                    <DebugCard
                      key={cardId}
                      id={cardId}
                      title="Viewport"
                      icon={Cpu}
                      defaultCollapsed={false}
                    >
                      {diagnostics && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div><strong>Width:</strong> {diagnostics.viewportWidth}px</div>
                          <div><strong>Height:</strong> {diagnostics.viewportHeight}px</div>
                        </div>
                      )}
                    </DebugCard>
                  );

                default:
                  return null;
              }
            })}
          </div>
        </SortableContext>
      </DndContext>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default DebugPanel;
