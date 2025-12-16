/**
 * INSTRUMENTED VERSION - ForgeTerminal with freeze detection
 * This is a temporary diagnostic version to capture freeze data
 * Copy this over ForgeTerminal.jsx to test
 */

import { performanceInstrumentation } from '../utils/performanceInstrumentation';

// Add this before the ws.onmessage handler:

// Track message processing timing
let messageCount = 0;
let totalProcessingTime = 0;
let maxProcessingTime = 0;

ws.onmessage = (event) => {
  const messageStart = performance.now();
  messageCount++;
  
  try {
    // ORIGINAL CODE HERE - wrapped with timing
    let textData = '';
    if (event.data instanceof ArrayBuffer) {
      // Binary data from PTY
      const data = new Uint8Array(event.data);
      
      // TIME: term.write
      const writeStart = performance.now();
      term.write(data);
      const writeDuration = performance.now() - writeStart;
      if (writeDuration > 50) {
        console.warn(`[Freeze Debug] Slow term.write: ${writeDuration.toFixed(0)}ms for ${data.length} bytes`);
      }
      
      // Convert to string for prompt detection
      textData = new TextDecoder().decode(data);
    } else if (typeof event.data === 'string') {
      // Text data - check if it's a Vision overlay message
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'VISION_OVERLAY') {
          // Vision overlay detected
          logger.terminal('Vision overlay received', { tabId, overlayType: msg.overlayType });
          setActiveVisionOverlay({
            type: msg.overlayType,
            payload: msg.payload
          });
          return; // Don't write to terminal
        }
      } catch (e) {
        // Not JSON, treat as regular text
        const writeStart = performance.now();
        term.write(event.data);
        const writeDuration = performance.now() - writeStart;
        if (writeDuration > 50) {
          console.warn(`[Freeze Debug] Slow term.write (string): ${writeDuration.toFixed(0)}ms`);
        }
        textData = event.data;
      }
    } else {
      // Other text data
      const writeStart = performance.now();
      term.write(event.data);
      const writeDuration = performance.now() - writeStart;
      if (writeDuration > 50) {
        console.warn(`[Freeze Debug] Slow term.write (other): ${writeDuration.toFixed(0)}ms`);
      }
      textData = event.data;
    }
    
    // Accumulate recent output for prompt detection (smaller buffer for performance)
    lastOutputRef.current = (lastOutputRef.current + textData).slice(-1000);
    
    // AM logging: Optimized for performance
    // Only log when AM is explicitly enabled for the tab
    if (amEnabledRef.current && textData) {
      amLogBufferRef.current += textData;
      
      // Debounce AM log writes - flush every 5 seconds (reduced frequency)
      if (amLogTimeoutRef.current) {
        clearTimeout(amLogTimeoutRef.current);
      }
      amLogTimeoutRef.current = setTimeout(() => {
        if (amLogBufferRef.current) {
          const cleanContent = stripAnsi(amLogBufferRef.current);
          if (cleanContent.trim()) {
            // Send to AM API
            fetch('/api/am/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tabId: tabId,
                tabName: tabNameRef.current || 'Terminal',
                workspace: window.location.pathname,
                entryType: 'AGENT_OUTPUT',
                content: cleanContent.slice(-1500), // Reduced size
              }),
            }).catch(() => {}); // Silent fail for performance
          }
          amLogBufferRef.current = '';
        }
      }, 5000); // Increased from 2s to 5s
    }
    
    // Debounce waiting check - reduced frequency for performance
    if (waitingCheckTimeoutRef.current) {
      clearTimeout(waitingCheckTimeoutRef.current);
    }
    waitingCheckTimeoutRef.current = setTimeout(() => {
      // Disable debug logging in production for performance
      const debugMode = false;
      
      const { waiting, responseType, confidence } = detectCliPrompt(lastOutputRef.current, debugMode);
      
      if (waiting !== isWaiting) {
        setIsWaiting(waiting);
        if (onWaitingChange) {
          onWaitingChange(waiting);
        }
      }
      
      // Detect directory changes for tab renaming and persistence
      const detectedDir = extractDirectory(lastOutputRef.current);
      if (detectedDir && detectedDir !== lastDirectoryRef.current) {
        lastDirectoryRef.current = detectedDir;
        const folderName = getFolderName(detectedDir);
        if (folderName && onDirectoryChangeRef.current) {
          logger.terminal('Directory changed', { tabId, directory: detectedDir, folderName });
          onDirectoryChangeRef.current(folderName, detectedDir);
        }
      }
      
      // Revert to broader auto-respond behavior (previously more reliable):
      // Auto-respond when a prompt is detected and the tab has Auto-Respond enabled.
      // This avoids missing prompts when detection of LLM-only output is unreliable.
      const shouldAutoRespond = waiting && 
        autoRespondRef.current && 
        ws.readyState === WebSocket.OPEN;
      
      if (shouldAutoRespond) {
        logger.terminal('Auto-responding to CLI prompt', { tabId, responseType, confidence });
        
        // Send appropriate response based on prompt type
        if (responseType === 'enter') {
          // Menu-style: just press Enter (option already selected)
          ws.send('\r');
        } else {
          // Y/N style: send "y" followed by Enter
          ws.send('y\r');
        }
        
        // Clear waiting state after auto-respond
        lastOutputRef.current = '';
        setIsWaiting(false);
        if (onWaitingChange) {
          onWaitingChange(false);
        }
      }
    }, 1500); // Increased from 500ms to 1500ms for performance
    
  } finally {
    // Track timing
    const messageDuration = performance.now() - messageStart;
    totalProcessingTime += messageDuration;
    maxProcessingTime = Math.max(maxProcessingTime, messageDuration);
    
    // Record in performance instrumentation
    const dataSize = event.data instanceof ArrayBuffer ? event.data.byteLength :
                     typeof event.data === 'string' ? event.data.length : 0;
    performanceInstrumentation.recordWebSocketMessage('receive', dataSize, messageDuration);
    
    // Log slow messages
    if (messageDuration > 100) {
      console.warn(`[Freeze Debug] SLOW MESSAGE HANDLER: ${messageDuration.toFixed(0)}ms`, {
        messageCount,
        avgProcessing: (totalProcessingTime / messageCount).toFixed(2),
        maxProcessing: maxProcessingTime.toFixed(0),
        dataSize
      });
    }
    
    // Log every 100 messages
    if (messageCount % 100 === 0) {
      console.log(`[Freeze Debug] Message stats:`, {
        count: messageCount,
        avg: (totalProcessingTime / messageCount).toFixed(2) + 'ms',
        max: maxProcessingTime.toFixed(0) + 'ms',
        total: totalProcessingTime.toFixed(0) + 'ms'
      });
    }
  }
};

// Expose stats for debugging
window.__wsMessageStats = {
  get count() { return messageCount; },
  get avg() { return (totalProcessingTime / messageCount).toFixed(2); },
  get max() { return maxProcessingTime.toFixed(0); },
  get total() { return totalProcessingTime.toFixed(0); },
  reset() {
    messageCount = 0;
    totalProcessingTime = 0;
    maxProcessingTime = 0;
  }
};

console.log('[Freeze Debug] Instrumented ws.onmessage - check window.__wsMessageStats');
