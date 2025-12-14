/**
 * @fileoverview DiagnosticOverlay - Visual diagnostic panel for Forge Terminal
 * 
 * Displays real-time diagnostic events, problem detection alerts, and 
 * provides export functionality. Toggle via Debug menu.
 * 
 * Features:
 * - Live event stream with color-coded entries
 * - Problem detection banners with plain-language explanations
 * - Session export to JSON file
 * - Collapsible/minimizable UI
 * - Platform info display
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Activity, 
  Download, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Eye,
  EyeOff,
  Keyboard,
  Clipboard,
  Wifi,
  Database,
  Zap
} from 'lucide-react';
import { diagnosticCore, EventType } from '../utils/diagnosticCore';
import { problemDetectorManager } from '../utils/problemDetectors';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_VISIBLE_EVENTS = 50;

const EVENT_COLORS = {
  [EventType.KEYBOARD]: '#4ade80',    // Green
  [EventType.PASTE]: '#f472b6',        // Pink
  [EventType.FOCUS]: '#60a5fa',        // Blue
  [EventType.WEBSOCKET]: '#fbbf24',    // Yellow
  [EventType.AM]: '#a78bfa',           // Purple
  [EventType.INIT]: '#94a3b8',         // Gray
  [EventType.TERMINAL_DATA]: '#2dd4bf', // Teal
};

const EVENT_ICONS = {
  [EventType.KEYBOARD]: Keyboard,
  [EventType.PASTE]: Clipboard,
  [EventType.FOCUS]: Eye,
  [EventType.WEBSOCKET]: Wifi,
  [EventType.AM]: Database,
  [EventType.INIT]: Zap,
  [EventType.TERMINAL_DATA]: Activity,
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * DiagnosticOverlay - Main diagnostic panel component
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether overlay is visible
 * @param {Function} props.onClose - Callback to close overlay
 * @param {string} props.position - 'left' or 'right' side of screen
 */
const DiagnosticOverlay = ({ isOpen, onClose, position = 'right' }) => {
  const [events, setEvents] = useState([]);
  const [problems, setProblems] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const eventListRef = useRef(null);
  const lastEventCount = useRef(0);

  // Subscribe to diagnostic events
  useEffect(() => {
    if (!isOpen) return;

    // Enable diagnostics when overlay opens
    if (!diagnosticCore.isEnabled()) {
      diagnosticCore.enable();
    }

    // Initial load
    setEvents(diagnosticCore.getEvents().slice(-MAX_VISIBLE_EVENTS));
    setSessionInfo({
      sessionId: diagnosticCore._sessionId,
      startTime: new Date(diagnosticCore.getSessionStartTime()).toLocaleTimeString(),
      platform: diagnosticCore._getPlatformInfo(),
    });

    // Subscribe to new events
    const unsubscribe = diagnosticCore.subscribe((event) => {
      if (isPaused) return;
      
      setEvents(prev => {
        const updated = [...prev, event].slice(-MAX_VISIBLE_EVENTS);
        return updated;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, isPaused]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (events.length > lastEventCount.current && eventListRef.current && !isPaused) {
      eventListRef.current.scrollTop = eventListRef.current.scrollHeight;
    }
    lastEventCount.current = events.length;
  }, [events, isPaused]);

  // Run problem detection periodically
  useEffect(() => {
    if (!isOpen) return;

    const detectProblems = async () => {
      const currentEvents = diagnosticCore.getEvents();
      
      // Note: We removed the AM backend polling here because it was flooding
      // the diagnostic buffer with "backend_status" events every 2 seconds,
      // pushing out all keyboard/paste/focus events that users need to debug.
      // AM health should be checked separately, not via the diagnostic event stream.
      
      const summary = problemDetectorManager.getSummary(currentEvents);
      setProblems(summary.problems);
    };

    detectProblems();
    const interval = setInterval(detectProblems, 2000);
    return () => clearInterval(interval);
  }, [isOpen, events]);

  // Handle export
  const handleExport = useCallback(() => {
    const json = diagnosticCore.exportSession();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `forge-diagnostic-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Handle clear
  const handleClear = useCallback(() => {
    diagnosticCore.reset();
    setEvents([]);
    setProblems([]);
  }, []);

  if (!isOpen) return null;

  const positionStyles = position === 'right' 
    ? { right: '16px' } 
    : { left: '16px' };

  return (
    <div 
      className="diagnostic-overlay"
      style={{
        position: 'fixed',
        top: '60px',
        ...positionStyles,
        width: isMinimized ? '200px' : '420px',
        maxHeight: isMinimized ? '48px' : 'calc(100vh - 100px)',
        backgroundColor: 'rgba(17, 17, 17, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '12px',
      }}
    >
      {/* Header */}
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: isMinimized ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
          backgroundColor: problems.length > 0 ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={16} color={problems.length > 0 ? '#ef4444' : '#4ade80'} />
          <span style={{ color: '#fff', fontWeight: 600 }}>
            Diagnostics
            {problems.length > 0 && (
              <span style={{ color: '#ef4444', marginLeft: '8px' }}>
                ({problems.length} issue{problems.length !== 1 ? 's' : ''})
              </span>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            style={buttonStyle}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={onClose} style={buttonStyle} title="Close">
            <XCircle size={14} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Problem Alerts */}
          {problems.length > 0 && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              {problems.map((problem, idx) => (
                <div 
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px',
                    marginBottom: idx < problems.length - 1 ? '8px' : 0,
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>
                      {problem.name.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    <div style={{ color: '#fca5a5', lineHeight: 1.4 }}>
                      {problem.explanation}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div 
            style={{
              display: 'flex',
              gap: '8px',
              padding: '8px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <button
              onClick={() => setIsPaused(!isPaused)}
              style={{
                ...buttonStyle,
                backgroundColor: isPaused ? 'rgba(234, 179, 8, 0.2)' : 'rgba(74, 222, 128, 0.2)',
                color: isPaused ? '#fbbf24' : '#4ade80',
              }}
            >
              {isPaused ? <EyeOff size={12} /> : <Eye size={12} />}
              <span style={{ marginLeft: '4px' }}>{isPaused ? 'Paused' : 'Live'}</span>
            </button>
            <button
              onClick={() => setShowProblemsOnly(!showProblemsOnly)}
              style={{
                ...buttonStyle,
                backgroundColor: showProblemsOnly ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                color: showProblemsOnly ? '#ef4444' : '#888',
              }}
            >
              <AlertTriangle size={12} />
              <span style={{ marginLeft: '4px' }}>Issues Only</span>
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={handleExport} style={buttonStyle} title="Export session">
              <Download size={12} />
            </button>
            <button onClick={handleClear} style={buttonStyle} title="Clear events">
              <Trash2 size={12} />
            </button>
          </div>

          {/* Event List */}
          <div 
            ref={eventListRef}
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '8px',
            }}
          >
            {events.length === 0 ? (
              <div style={{ 
                color: '#666', 
                textAlign: 'center', 
                padding: '32px',
              }}>
                No events captured yet.
                <br />
                <span style={{ fontSize: '11px' }}>
                  Interact with the terminal to see events.
                </span>
              </div>
            ) : (
              events.map((event, idx) => {
                if (showProblemsOnly && !event.plainText?.includes('⚠️') && !event.plainText?.includes('DUPLICATE')) {
                  return null;
                }
                return <EventRow key={idx} event={event} />;
              })
            )}
          </div>

          {/* Footer - Session Info */}
          <div 
            style={{
              padding: '8px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: '10px',
              color: '#666',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Session: {sessionInfo?.sessionId?.slice(-8)}</span>
            <span>{events.length} events</span>
            <span>Started: {sessionInfo?.startTime}</span>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Single event row in the event list
 */
const EventRow = ({ event }) => {
  const Icon = EVENT_ICONS[event.type] || Activity;
  const color = EVENT_COLORS[event.type] || '#888';
  const isWarning = event.plainText?.includes('⚠️') || event.plainText?.includes('DUPLICATE');

  return (
    <div 
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '6px 8px',
        marginBottom: '4px',
        backgroundColor: isWarning ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.02)',
        borderRadius: '4px',
        borderLeft: `3px solid ${isWarning ? '#ef4444' : color}`,
      }}
    >
      <Icon size={12} color={color} style={{ flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ 
          color: isWarning ? '#fca5a5' : '#ccc',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {event.plainText}
        </div>
        <div style={{ color: '#555', fontSize: '10px', marginTop: '2px' }}>
          {event.relativeMs}ms {event.gapMs > 100 && `(+${event.gapMs}ms gap)`}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const buttonStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 8px',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '4px',
  color: '#888',
  cursor: 'pointer',
  fontSize: '11px',
  transition: 'all 0.15s',
};

export default DiagnosticOverlay;
