import React, { useState, useRef, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Video, Square, Copy, Check, AlertCircle, Loader, Info } from 'lucide-react';
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
  const [targetDirectory, setTargetDirectory] = useState('');
  const [hasInterruptedSession, setHasInterruptedSession] = useState(false);
  // v3.12.16: Pre-generate session ID for external logs setup
  const [nextSessionId, setNextSessionId] = useState('debug-' + Date.now());
  // v3.15: Track if unmount is due to page unload vs component unmount
  const isPageUnloadingRef = useRef(false);

  // v3.12.14: Force re-render counter
  const [, forceUpdate] = useState(0);
  const durationRef = useRef(0); // Store actual duration in ref

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
  const isRecordingRef = useRef(false); // v3.12.13: Track recording state in ref for cleanup

  // DEFINE CALLBACKS FIRST- before useEffect that references them (TDZ fix)
  const captureKeystroke = useCallback((e) => {
    // v3.12.12 FIX: Handle SVGAnimatedString for className
    let className = '';
    try {
      const cn = e.target.className;
      if (typeof cn === 'string') {
        className = cn.substring(0, 100);
      } else if (cn && cn.baseVal) {
        className = cn.baseVal.substring(0, 100);
      }
    } catch (err) {
      // Ignore - className will be empty
    }
    
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
        className: className,
        id: e.target.id || '',
      },
    });
  }, []);

  const captureClick = useCallback((e) => {
    // v3.12.12 FIX: Handle SVGAnimatedString for className
    // SVG elements have className as SVGAnimatedString object, not string
    let className = '';
    try {
      const cn = e.target.className;
      if (typeof cn === 'string') {
        className = cn.substring(0, 100);
      } else if (cn && cn.baseVal) {
        className = cn.baseVal.substring(0, 100);
      }
    } catch (err) {
      // Ignore - className will be empty
    }
    
    eventsRef.current.push({
      type: 'click',
      timestamp: Date.now() - startTimeRef.current,
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      target: {
        tagName: e.target.tagName,
        className: className,
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

  const saveSessionToLocalStorage = useCallback((isInterrupted = false) => {
    const session = {
      id: sessionIdRef.current,
      startTime: startTimeRef.current,
      events: eventsRef.current,
      consoleLogs: consoleLogsRef.current,
      networkRequests: networkRequestsRef.current,
      interrupted: isInterrupted, // v3.15: Only mark interrupted if page unloading
      isRecording: true,
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
            
            // Calculate actual elapsed time from start
            const actualElapsed = Math.floor((Date.now() - session.startTime) / 1000);
            setRecordingDuration(actualElapsed);
            console.log('[FollowMe] Restored timer - actual elapsed:', actualElapsed, 'seconds');
            
            // v3.12.14: Timer managed by useEffect, just set state
            isRecordingRef.current = true;
            setIsRecording(true);
            
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

  // v3.12.13: Keep isRecordingRef in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // v3.12.14: Dedicated timer effect using ref + forceUpdate pattern
  // This avoids any potential React state batching issues
  useEffect(() => {
    if (!isRecording) {
      durationRef.current = 0;
      window.__followMeTimerActive = false;
      return; // Not recording, no timer needed
    }
    
    console.log('[FollowMe] Timer effect: starting interval, isRecording:', isRecording);
    durationRef.current = 0;
    window.__followMeTimerActive = true;
    window.__followMeTimerValue = 0;
    
    const intervalId = setInterval(() => {
      try {
        durationRef.current += 1;
        window.__followMeTimerValue = durationRef.current;
        console.log('[FollowMe] Timer tick:', durationRef.current);
        // Use actual state update instead of forceUpdate
        setRecordingDuration(durationRef.current);
      } catch (err) {
        console.error('[FollowMe] Timer tick error:', err);
      }
    }, 1000);
    
    // Store in ref for other code that might need to access it
    durationIntervalRef.current = intervalId;
    window.__followMeIntervalId = intervalId;
    console.log('[FollowMe] Interval ID stored:', intervalId);
    
    return () => {
      console.log('[FollowMe] Timer effect: clearing interval', intervalId);
      clearInterval(intervalId);
      durationIntervalRef.current = null;
      window.__followMeTimerActive = false;
    };
  }, [isRecording]);

  // Cleanup effect - only runs on unmount
  useEffect(() => {
    // v3.15: Track page unload to distinguish from tab switching
    const handleBeforeUnload = () => {
      isPageUnloadingRef.current = true;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      console.log('[FollowMe] Component unmounting');
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Always clear interval on unmount to prevent memory leaks
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      // Restore console/fetch hooks
      restoreConsole();
      restoreFetch();
      
      // v3.15: Only save for recovery if page is unloading (true interruption)
      // Tab switching shouldn't trigger auto-restore
      if (isRecordingRef.current && isPageUnloadingRef.current) {
        console.log('[FollowMe] Page unloading - saving session for recovery');
        saveSessionToLocalStorage(true); // Mark as interrupted
      } else if (isRecordingRef.current) {
        console.log('[FollowMe] Component unmount (tab switch) - clearing localStorage');
        // Clear localStorage to prevent auto-restore on tab switch
        localStorage.removeItem('follow-me-active-session');
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on unmount

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
      sessionIdRef.current = nextSessionId; // Use pre-generated ID
      streamEndedByUserRef.current = false;

      // v3.12.16: Notify backend of active session (for environment injection)
      try {
        await fetch('/api/debug-sessions/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: nextSessionId })
        });
        console.log('[FollowMe] Active session set in backend:', nextSessionId);
      } catch (err) {
        console.warn('[FollowMe] Failed to set active session in backend:', err);
      }

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

      // v3.12.14: Timer is now managed by useEffect that watches isRecording
      // Just reset duration and set recording state
      setRecordingDuration(0);
      
      // v3.12.13 FIX: Update ref BEFORE state to ensure useEffect sees correct value
      isRecordingRef.current = true;
      window.__followMeStartRecordingCalled = true;
      window.__followMeIsRecordingBeforeSet = false;
      setIsRecording(true);
      window.__followMeIsRecordingAfterSet = true;
      console.log('[FollowMe] Recording started, setIsRecording(true) called');

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
      window.__followMeStartError = err.message;
      setError('Failed to start: ' + err.message);
    }
  }, [captureKeystroke, captureClick, captureMouseMove, captureScroll, interceptConsole, interceptFetch]);

  const stopRecording = useCallback(async () => {
    try {
      setSaving(true);
      streamEndedByUserRef.current = true; // Mark that user explicitly stopped
      
      // v3.12.14: Timer is cleared by useEffect when isRecording becomes false
      // Just set the state, the effect will handle cleanup
      isRecordingRef.current = false;
      setIsRecording(false);

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

      // v3.12.13: Update ref BEFORE state for consistency
      isRecordingRef.current = false;
      setIsRecording(false);

      const summary = generateSummary();
      
      // FIX v3.11.7: Calculate actual duration from start time, not from state
      // recordingDuration may be stale or not updated if interval missed ticks
      const actualDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      
      const session = {
        id: sessionIdRef.current || 'debug-' + Date.now(),
        timestamp: new Date().toISOString(),
        duration: actualDuration,  // Use calculated duration, not state
        targetDirectory: targetDirectory,
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
      
      // Generate new ID for next session
      setNextSessionId('debug-' + Date.now());

      // Clear localStorage since session is now complete
      localStorage.removeItem('follow-me-active-session');
      setHasInterruptedSession(false);

      if (onSessionComplete) onSessionComplete(session);
    } catch (err) {
      console.error('[FollowMe] Failed to stop:', err);
      setError('Failed to stop: ' + err.message);
      setSaving(false);
      isRecordingRef.current = false; // v3.12.13: Keep ref in sync
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

    if (session.targetDirectory) {
      lines.push('## Context');
      lines.push('- **Target Application Directory:** ' + session.targetDirectory);
      lines.push('IMPORTANT: The application source code is located at this path. Please use this path for all file operations.');
      lines.push('');
    }

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
    // KEEP sessionData so user can still access it if needed
    // setSessionData(null);  // Don't clear - session is still saved to disk
    setRecordingDuration(0);
    setError(null);
    setNextSessionId('debug-' + Date.now()); // New ID for next session
  }, []);

  const resumeSession = useCallback(() => {
    setHasInterruptedSession(false);
    // v3.12.14: Timer is managed by useEffect, just set state
    isRecordingRef.current = true;
    setIsRecording(true);
    // Re-attach event listeners
    window.addEventListener('keydown', captureKeystroke, true);
    window.addEventListener('click', captureClick, true);
    window.addEventListener('mousemove', captureMouseMove, true);
    window.addEventListener('scroll', captureScroll, true);
    interceptConsole();
    interceptFetch();
  }, [captureKeystroke, captureClick, captureMouseMove, captureScroll, interceptConsole, interceptFetch]);

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

  // Expose session data to window for easy debugging access
  useEffect(() => {
    if (sessionData) {
      window.followMeSession = sessionData;
      console.log('[FollowMe] Session data available at window.followMeSession');
      console.log('[FollowMe] Session saved to:', sessionData.savedPath);
    }
  }, [sessionData]);

  // Debug: Log on every render
  console.log('[FollowMe] Render - isRecording:', isRecording, 'recordingDuration:', recordingDuration);

  return (
    <div className="follow-me-debugger" data-testid="follow-me-debugger">
      {error && (
        <div className="follow-me-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {!isRecording && !sessionComplete && !hasInterruptedSession && (
        <div className="follow-me-setup">
          <input
            type="text"
            className="target-dir-input"
            placeholder="Target App Path (optional)"
            value={targetDirectory}
            onChange={(e) => setTargetDirectory(e.target.value)}
          />

          <details className="external-logs-help">
            <summary>
              <Info size={14} />
              <span>Connect External Logs (Setup)</span>
            </summary>
            <div className="help-content">
              <p>Session ID: <code>{nextSessionId}</code></p>
              <p>
                <strong>Automatic:</strong> Start a new terminal during recording to get <code>FORGE_DEBUG_SESSION_ID</code> automatically injected.
              </p>
              <p><strong>Manual:</strong> POST to <code>/api/debug-logs</code>:</p>
              <pre>
{`{
  "sessionId": process.env.FORGE_DEBUG_SESSION_ID || "${nextSessionId}",
  "source": "app-name",
  "level": "error",
  ...
}`}
              </pre>
            </div>
          </details>

          <button
            className="follow-me-button"
            onClick={startRecording}
            data-testid="follow-me-button"
          >
            <Video size={16} />
            <span>Follow Me</span>
          </button>
        </div>
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
          
          <div className="active-session-info">
             <div className="info-row">
                <span className="label">Target:</span>
                <span className="value">{targetDirectory || 'None'}</span>
             </div>
             <div className="info-row">
                <span className="label">Session:</span>
                <code className="value">{sessionIdRef.current}</code>
             </div>
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
                <span>Complete & Save Session</span>
              </>
            )}
          </button>
        </div>
      )}

      {sessionComplete && sessionData && (
        <div className="debug-session-summary" data-testid="session-summary">
          <div className="session-header">
            <h4>Debug Session Complete</h4>
            <button className="reset-button" onClick={resetSession}>Start New Session</button>
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
