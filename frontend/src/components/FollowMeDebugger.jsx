import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Video, Square, Copy, Check, AlertCircle, Loader } from 'lucide-react';
import './FollowMeDebugger.css';

/**
 * Follow-Me Debugger Component
 * 
 * Captures complete user session for debugging:
 * - Screen recording (MediaRecorder API)
 * - Keystroke logging with timestamps
 * - Mouse click logging with element info
 * - Console log/error capture
 * - Network request capture
 */
const FollowMeDebugger = ({ onSessionComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasInterruptedSession, setHasInterruptedSession] = useState(false);

  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const eventsRef = useRef([]);
  const consoleLogsRef = useRef([]);
  const networkRequestsRef = useRef([]);
  const startTimeRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const originalConsoleRef = useRef({});
  const originalFetchRef = useRef(null);
  const lastMouseMoveRef = useRef(0);
  const lastScrollRef = useRef(0);
  const sessionIdRef = useRef(null);
  const streamEndedByUserRef = useRef(false);

  // DEFINE CALLBACKS FIRST - before useEffect that references them (TDZ fix)
  const captureKeystroke = useCallback((e) => {
    eventsRef.current.push({
      type: 'keystroke',
      timestamp: Date.now() - startTimeRef.current,
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      target: {
        tagName: e.target.tagName,
        className: (e.target.className || '').substring(0, 100),
        id: e.target.id || '',
      },
    });
  }, []);

  const captureClick = useCallback((e) => {
    eventsRef.current.push({
      type: 'click',
      timestamp: Date.now() - startTimeRef.current,
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      target: {
        tagName: e.target.tagName,
        className: (e.target.className || '').substring(0, 100),
        id: e.target.id || '',
        textContent: (e.target.textContent || '').substring(0, 50),
      },
    });
  }, []);

  const captureMouseMove = useCallback((e) => {
    const now = Date.now();
    if (now - lastMouseMoveRef.current < 100) return;
    lastMouseMoveRef.current = now;
    eventsRef.current.push({
      type: 'mousemove',
      timestamp: now - startTimeRef.current,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const captureScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScrollRef.current < 200) return;
    lastScrollRef.current = now;
    eventsRef.current.push({
      type: 'scroll',
      timestamp: now - startTimeRef.current,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    });
  }, []);

  const interceptConsole = useCallback(() => {
    const methods = ['log', 'warn', 'error', 'info', 'debug'];
    methods.forEach(method => {
      originalConsoleRef.current[method] = console[method];
      console[method] = (...args) => {
        originalConsoleRef.current[method].apply(console, args);
        consoleLogsRef.current.push({
          type: method,
          timestamp: Date.now() - startTimeRef.current,
          message: args.map(arg => {
            try {
              return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            } catch {
              return String(arg);
            }
          }).join(' '),
        });
      };
    });
  }, []);

  const restoreConsole = useCallback(() => {
    Object.keys(originalConsoleRef.current).forEach(method => {
      if (originalConsoleRef.current[method]) {
        console[method] = originalConsoleRef.current[method];
      }
    });
    originalConsoleRef.current = {};
  }, []);

  const interceptFetch = useCallback(() => {
    originalFetchRef.current = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
      const method = args[1]?.method || 'GET';
      const startTime = Date.now() - startTimeRef.current;
      try {
        const response = await originalFetchRef.current.apply(window, args);
        networkRequestsRef.current.push({
          type: 'fetch',
          timestamp: startTime,
          duration: Date.now() - startTimeRef.current - startTime,
          url: url.substring(0, 200),
          method,
          status: response.status,
          ok: response.ok,
        });
        return response;
      } catch (err) {
        networkRequestsRef.current.push({
          type: 'fetch',
          timestamp: startTime,
          duration: Date.now() - startTimeRef.current - startTime,
          url: url.substring(0, 200),
          method,
          error: err.message,
        });
        throw err;
      }
    };
  }, []);

  const restoreFetch = useCallback(() => {
    if (originalFetchRef.current) {
      window.fetch = originalFetchRef.current;
      originalFetchRef.current = null;
    }
  }, []);

  const saveSessionToLocalStorage = useCallback(() => {
    const session = {
      id: sessionIdRef.current,
      startTime: startTimeRef.current,
      events: eventsRef.current,
      consoleLogs: consoleLogsRef.current,
      networkRequests: networkRequestsRef.current,
      interrupted: true,
      isRecording: true, // Mark that recording is active
    };
    localStorage.setItem('follow-me-active-session', JSON.stringify(session));
  }, []);

  // NOW the useEffect that references these callbacks
  // Check for interrupted session on mount
  useEffect(() => {
    const savedSession = localStorage.getItem('follow-me-active-session');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        if (session.interrupted) {
          setHasInterruptedSession(true);
          // Restore session data
          eventsRef.current = session.events || [];
          consoleLogsRef.current = session.consoleLogs || [];
          networkRequestsRef.current = session.networkRequests || [];
          startTimeRef.current = session.startTime;
          sessionIdRef.current = session.id;
          const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
          setRecordingDuration(elapsed);
          
          // v3.11.3: Auto-restore if session was active (not explicitly interrupted by user)
          if (session.isRecording) {
            console.log('[FollowMe] Restoring active recording session');
            setIsRecording(true);
            
            // Restart duration counter
            durationIntervalRef.current = setInterval(() => {
              setRecordingDuration(prev => prev + 1);
              // Auto-save periodically
              if (prev % 5 === 0) {
                const currentSession = {
                  id: sessionIdRef.current,
                  startTime: startTimeRef.current,
                  events: eventsRef.current,
                  consoleLogs: consoleLogsRef.current,
                  networkRequests: networkRequestsRef.current,
                  interrupted: true,
                  isRecording: true,
                };
                localStorage.setItem('follow-me-active-session', JSON.stringify(currentSession));
              }
            }, 1000);
            
            // Re-attach event listeners
            window.addEventListener('keydown', captureKeystroke, true);
            window.addEventListener('click', captureClick, true);
            window.addEventListener('mousemove', captureMouseMove, true);
            window.addEventListener('scroll', captureScroll, true);
            interceptConsole();
            interceptFetch();
          }
        }
      } catch (err) {
        console.error('[FollowMe] Failed to restore session:', err);
        localStorage.removeItem('follow-me-active-session');
      }
    }
  }, [captureKeystroke, captureClick, captureMouseMove, captureScroll, interceptConsole, interceptFetch]);

  useEffect(() => {
    // v3.11.3 FIX: Don't cleanup on unmount if recording is active
    // This allows Follow Me to survive tab switches
    return () => {
      // Only cleanup if NOT recording
      // If recording, the session persists and will resume when user returns to Debug tab
      if (!isRecording) {
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
        }
        restoreConsole();
        restoreFetch();
      } else {
        console.log('[FollowMe] Component unmounting but recording active - preserving state');
        // Save to localStorage so it can be restored
        saveSessionToLocalStorage();
      }
    };
  }, [isRecording, saveSessionToLocalStorage]);

  // TDZ FIX: All callbacks moved above - removed duplicates
  
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setSessionComplete(false);
      setSessionData(null);
      setHasInterruptedSession(false);
      eventsRef.current = [];
      consoleLogsRef.current = [];
      networkRequestsRef.current = [];
      recordedChunksRef.current = [];
      startTimeRef.current = Date.now();
      sessionIdRef.current = 'debug-' + Date.now();
      streamEndedByUserRef.current = false;

      // Try screen recording (skip in headless/test environments)
      const isHeadless = navigator.webdriver || window.navigator.userAgent.includes('HeadlessChrome');
      if (!isHeadless) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always', displaySurface: 'browser' },
            audio: false,
          });
          
          // Detect when user stops sharing via browser controls
          stream.getVideoTracks()[0].onended = () => {
            if (!streamEndedByUserRef.current) {
              console.warn('[FollowMe] Screen share ended - checking if user explicitly stopped...');
              
              // Check if this was triggered by another displayMedia request (screenshot tool)
              // vs user clicking "Stop Sharing" button
              // If events are still being captured, it's likely a tool conflict, not user stop
              const recentEvents = eventsRef.current.filter(e => 
                e.timestamp > Date.now() - startTimeRef.current - 2000
              );
              
              if (recentEvents.length > 0) {
                console.log('[FollowMe] Detected screen capture tool conflict - continuing session without video');
                // Don't persist or show recovery - just continue capturing events
                // Video recording lost, but events/logs still captured
                return;
              }
              
              console.warn('[FollowMe] User stopped sharing - persisting session');
              // Save session to localStorage for recovery
              saveSessionToLocalStorage();
              // Keep UI in recording state so user can click "I'm Done"
              // Don't call stopRecording() automatically
            }
          };
          
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9',
          });
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunksRef.current.push(e.data);
          };
          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.start(1000);
        } catch (screenErr) {
          console.warn('[FollowMe] Screen recording not available:', screenErr.message);
        }
      } else {
        console.log('[FollowMe] Skipping screen recording in headless/test mode');
      }

      window.addEventListener('keydown', captureKeystroke, true);
      window.addEventListener('click', captureClick, true);
      window.addEventListener('mousemove', captureMouseMove, true);
      window.addEventListener('scroll', captureScroll, true);
      interceptConsole();
      interceptFetch();

      setRecordingDuration(0);
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
        // Persist session every 5 seconds during recording
        if (prev % 5 === 0) {
          saveSessionToLocalStorage();
        }
      }, 1000);

      setIsRecording(true);

      eventsRef.current.push({
        type: 'session_start',
        timestamp: 0,
        userAgent: navigator.userAgent,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        url: window.location.href,
      });
    } catch (err) {
      console.error('[FollowMe] Failed to start:', err);
      setError('Failed to start: ' + err.message);
    }
  }, [captureKeystroke, captureClick, captureMouseMove, captureScroll, interceptConsole, interceptFetch]);

  const stopRecording = useCallback(async () => {
    try {
      setSaving(true);
      streamEndedByUserRef.current = true; // Mark that user explicitly stopped
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      eventsRef.current.push({
        type: 'session_end',
        timestamp: Date.now() - startTimeRef.current,
        totalEvents: eventsRef.current.length,
      });

      window.removeEventListener('keydown', captureKeystroke, true);
      window.removeEventListener('click', captureClick, true);
      window.removeEventListener('mousemove', captureMouseMove, true);
      window.removeEventListener('scroll', captureScroll, true);
      restoreConsole();
      restoreFetch();

      let videoBlob = null;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        await new Promise((resolve) => {
          mediaRecorderRef.current.onstop = resolve;
          mediaRecorderRef.current.stop();
        });
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        if (recordedChunksRef.current.length > 0) {
          videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        }
      }

      setIsRecording(false);

      const summary = generateSummary();
      const session = {
        id: 'debug-' + Date.now(),
        timestamp: new Date().toISOString(),
        duration: recordingDuration,
        events: eventsRef.current,
        consoleLogs: consoleLogsRef.current,
        networkRequests: networkRequestsRef.current,
        hasVideo: !!videoBlob,
        summary,
      };

      // Save to backend
      try {
        const formData = new FormData();
        formData.append('session', JSON.stringify(session));
        if (videoBlob) {
          formData.append('video', videoBlob, session.id + '.webm');
        }
        const response = await fetch('/api/debug-sessions', {
          method: 'POST',
          body: formData,
        });
        if (response.ok) {
          const result = await response.json();
          session.savedPath = result.path;
        }
      } catch (saveErr) {
        console.warn('[FollowMe] Failed to save:', saveErr);
      }

      session.analysisPrompt = generateAnalysisPrompt(session);
      setSessionData(session);
      setSessionComplete(true);
      setSaving(false);
      
      // Clear localStorage since session is now complete
      localStorage.removeItem('follow-me-active-session');
      setHasInterruptedSession(false);

      if (onSessionComplete) onSessionComplete(session);
    } catch (err) {
      console.error('[FollowMe] Failed to stop:', err);
      setError('Failed to stop: ' + err.message);
      setSaving(false);
      setIsRecording(false);
    }
  }, [captureKeystroke, captureClick, captureMouseMove, captureScroll, restoreConsole, restoreFetch, recordingDuration, onSessionComplete]);

  const generateSummary = useCallback(() => {
    const events = eventsRef.current;
    const consoleLogs = consoleLogsRef.current;
    const networkRequests = networkRequestsRef.current;
    return {
      totalEvents: events.length,
      keystrokes: events.filter(e => e.type === 'keystroke').length,
      clicks: events.filter(e => e.type === 'click').length,
      consoleLogs: consoleLogs.length,
      errors: consoleLogs.filter(e => e.type === 'error').length,
      warnings: consoleLogs.filter(e => e.type === 'warn').length,
      networkRequests: networkRequests.length,
      failedRequests: networkRequests.filter(e => e.error || (e.status && e.status >= 400)).length,
    };
  }, []);

  const generateAnalysisPrompt = useCallback((session) => {
    const { events, consoleLogs, networkRequests, summary, duration } = session;
    const keystrokes = events.filter(e => e.type === 'keystroke').slice(-50);
    const clicks = events.filter(e => e.type === 'click').slice(-30);
    const errors = consoleLogs.filter(e => e.type === 'error');
    const warnings = consoleLogs.filter(e => e.type === 'warn').slice(-10);
    const failedRequests = networkRequests.filter(e => e.error || (e.status && e.status >= 400));

    const fence = String.fromCharCode(96, 96, 96); // backtick x3
    const lines = [];

    lines.push('# Debug Session Analysis Request');
    lines.push('');
    lines.push('## Session Overview');
    lines.push('- **Duration:** ' + duration + ' seconds');
    lines.push('- **Total Events:** ' + summary.totalEvents);
    lines.push('- **Keystrokes:** ' + summary.keystrokes);
    lines.push('- **Clicks:** ' + summary.clicks);
    lines.push('- **Console Errors:** ' + summary.errors);
    lines.push('- **Console Warnings:** ' + summary.warnings);
    lines.push('- **Failed Requests:** ' + summary.failedRequests);
    lines.push('');
    lines.push('## User Action Timeline');
    lines.push(fence);

    clicks.forEach(click => {
      const time = (click.timestamp / 1000).toFixed(1);
      let line = '[' + time + 's] CLICK: ' + click.target.tagName;
      if (click.target.textContent) line += ' "' + click.target.textContent + '"';
      lines.push(line);
    });

    lines.push(fence);
    lines.push('');
    lines.push('## Keystrokes (Last 50)');
    lines.push(fence);

    let currentText = '';
    keystrokes.forEach(ks => {
      if (ks.key.length === 1) {
        currentText += ks.key;
      } else if (ks.key === 'Enter') {
        if (currentText) lines.push('Typed: "' + currentText + '"');
        currentText = '';
        lines.push('[Enter]');
      } else if (ks.key === 'Backspace') {
        currentText = currentText.slice(0, -1);
      } else if (!['Control', 'Alt', 'Shift', 'Meta'].includes(ks.key)) {
        if (currentText) lines.push('Typed: "' + currentText + '"');
        currentText = '';
        lines.push('[' + ks.key + ']');
      }
    });
    if (currentText) lines.push('Typed: "' + currentText + '"');
    lines.push(fence);

    if (errors.length > 0) {
      lines.push('');
      lines.push('## Console Errors (IMPORTANT)');
      lines.push(fence);
      errors.forEach(err => {
        lines.push('[' + (err.timestamp / 1000).toFixed(1) + 's] ' + err.message.substring(0, 500));
      });
      lines.push(fence);
    }

    if (warnings.length > 0) {
      lines.push('');
      lines.push('## Console Warnings');
      lines.push(fence);
      warnings.forEach(warn => {
        lines.push('[' + (warn.timestamp / 1000).toFixed(1) + 's] ' + warn.message.substring(0, 300));
      });
      lines.push(fence);
    }

    if (failedRequests.length > 0) {
      lines.push('');
      lines.push('## Failed Network Requests');
      lines.push(fence);
      failedRequests.forEach(req => {
        lines.push('[' + (req.timestamp / 1000).toFixed(1) + 's] ' + req.method + ' ' + req.url + ' -> ' + (req.error || 'Status ' + req.status));
      });
      lines.push(fence);
    }

    lines.push('');
    lines.push('## Analysis Request');
    lines.push('Based on this debug session, please:');
    lines.push('1. Identify any errors or issues');
    lines.push('2. Explain what the user was trying to do');
    lines.push('3. Diagnose the root cause');
    lines.push('4. Propose a specific fix');

    return lines.join('\n');
  }, []);

  const copyPrompt = useCallback(async () => {
    if (!sessionData?.analysisPrompt) return;
    try {
      await navigator.clipboard.writeText(sessionData.analysisPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[FollowMe] Copy failed:', err);
    }
  }, [sessionData]);

  const resetSession = useCallback(() => {
    setSessionComplete(false);
    setSessionData(null);
    setRecordingDuration(0);
    setError(null);
  }, []);

  const resumeSession = useCallback(() => {
    setHasInterruptedSession(false);
    setIsRecording(true);
    // Resume duration counter
    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration(prev => prev + 1);
      if (prev % 5 === 0) {
        saveSessionToLocalStorage();
      }
    }, 1000);
    // Re-attach event listeners
    window.addEventListener('keydown', captureKeystroke, true);
    window.addEventListener('click', captureClick, true);
    window.addEventListener('mousemove', captureMouseMove, true);
    window.addEventListener('scroll', captureScroll, true);
    interceptConsole();
    interceptFetch();
  }, [captureKeystroke, captureClick, captureMouseMove, captureScroll, interceptConsole, interceptFetch, saveSessionToLocalStorage]);

  const discardSession = useCallback(() => {
    localStorage.removeItem('follow-me-active-session');
    setHasInterruptedSession(false);
    eventsRef.current = [];
    consoleLogsRef.current = [];
    networkRequestsRef.current = [];
    setRecordingDuration(0);
  }, []);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ':' + secs.toString().padStart(2, '0');
  };

  return (
    <div className="follow-me-debugger" data-testid="follow-me-debugger">
      {error && (
        <div className="follow-me-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {!isRecording && !sessionComplete && !hasInterruptedSession && (
        <button
          className="follow-me-button"
          onClick={startRecording}
          data-testid="follow-me-button"
        >
          <Video size={16} />
          <span>Follow Me</span>
        </button>
      )}

      {hasInterruptedSession && !isRecording && !sessionComplete && (
        <div className="follow-me-recovery" data-testid="follow-me-recovery">
          <div className="recovery-message">
            <AlertCircle size={16} color="#ff9800" />
            <span>Previous session interrupted ({formatDuration(recordingDuration)})</span>
          </div>
          <div className="recovery-actions">
            <button
              className="resume-session-button"
              onClick={resumeSession}
              data-testid="resume-session-button"
            >
              <Video size={14} />
              <span>Resume</span>
            </button>
            <button
              className="discard-session-button"
              onClick={discardSession}
              data-testid="discard-session-button"
            >
              <Square size={14} />
              <span>Discard</span>
            </button>
          </div>
        </div>
      )}

      {isRecording && (
        <div className="follow-me-recording" data-testid="recording-indicator">
          <div className="recording-status">
            <div className="recording-dot" />
            <span>Recording</span>
            <span className="recording-duration">{formatDuration(recordingDuration)}</span>
          </div>
          <button
            className="im-done-button"
            onClick={stopRecording}
            disabled={saving}
            data-testid="im-done-button"
          >
            {saving ? (
              <>
                <Loader size={16} className="spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Square size={16} />
                <span>I'm Done</span>
              </>
            )}
          </button>
        </div>
      )}

      {sessionComplete && sessionData && (
        <div className="debug-session-summary" data-testid="session-summary">
          <div className="session-header">
            <h4>Debug Session Complete</h4>
            <button className="reset-button" onClick={resetSession}>New Session</button>
          </div>

          <div className="session-stats">
            <div className="stat">
              <span className="stat-value">{sessionData.summary.keystrokes}</span>
              <span className="stat-label">keystrokes</span>
            </div>
            <div className="stat">
              <span className="stat-value">{sessionData.summary.clicks}</span>
              <span className="stat-label">clicks</span>
            </div>
            <div className="stat">
              <span className="stat-value">{sessionData.summary.errors}</span>
              <span className="stat-label">errors</span>
            </div>
            <div className="stat">
              <span className="stat-value">{formatDuration(sessionData.duration)}</span>
              <span className="stat-label">duration</span>
            </div>
          </div>

          <div className="analysis-prompt-section" data-testid="analysis-prompt">
            <div className="prompt-header">
              <span>Analysis Prompt</span>
              <button
                className="copy-prompt-button"
                onClick={copyPrompt}
                data-testid="copy-prompt-button"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="analysis-prompt-preview">
              {sessionData.analysisPrompt.substring(0, 500)}...
            </pre>
          </div>

          <p className="prompt-instruction">
            Copy the prompt above and paste it to Copilot for diagnosis.
          </p>
        </div>
      )}
    </div>
  );
};

export default FollowMeDebugger;
