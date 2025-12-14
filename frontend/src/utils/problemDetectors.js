/**
 * @fileoverview Problem Detectors for Forge Terminal Diagnostic System
 * 
 * Analyzes diagnostic events to detect specific known problems:
 * 1. DoublePasteDetector - Detects when Ctrl+V causes duplicate sends
 * 2. SpacebarBlockedDetector - Detects when spacebar keydown doesn't reach terminal
 * 3. AMStaleDetector - Detects when AM isn't producing output files
 * 4. HydrationIssueDetector - Detects keyboard issues after fresh load
 * 
 * Each detector analyzes event sequences and provides plain-language explanations.
 * 
 * @example
 * import { problemDetectorManager } from './problemDetectors';
 * const results = problemDetectorManager.analyzeAll(events);
 */

import { EventType } from './diagnosticCore.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DUPLICATE_WINDOW_MS = 100;
const AM_STALE_THRESHOLD_MS = 60000; // 1 minute
const HYDRATION_GAP_THRESHOLD_MS = 500;

// ============================================================================
// DETECTION RESULT TYPE
// ============================================================================

/**
 * @typedef {Object} DetectionResult
 * @property {boolean} detected - Whether the problem was detected
 * @property {string} problem - Problem code (e.g., 'DOUBLE_PASTE')
 * @property {string} explanation - Plain language explanation
 * @property {string} evidence - Technical evidence
 * @property {string} suggestion - Suggested fix
 * @property {number} confidence - 0-1 confidence score
 * @property {Object[]} relevantEvents - Events that triggered detection
 */

/**
 * Creates a detection result object
 * @param {boolean} detected
 * @param {string} problem
 * @param {Object} details
 * @returns {DetectionResult}
 */
function createResult(detected, problem, details = {}) {
  return {
    detected,
    problem,
    explanation: details.explanation || '',
    evidence: details.evidence || '',
    suggestion: details.suggestion || '',
    confidence: details.confidence || (detected ? 0.8 : 0),
    relevantEvents: details.relevantEvents || [],
  };
}

// ============================================================================
// DOUBLE PASTE DETECTOR
// ============================================================================

/**
 * Detects when Ctrl+V paste causes duplicate WebSocket sends
 */
export class DoublePasteDetector {
  constructor() {
    this.name = 'DoublePasteDetector';
    this.problemCode = 'DOUBLE_PASTE';
  }

  /**
   * Analyze events for double paste issue
   * @param {Object[]} events - Diagnostic events
   * @returns {DetectionResult}
   */
  analyze(events) {
    if (!events || events.length < 2) {
      return createResult(false, this.problemCode);
    }

    // Look for paste event followed by multiple WebSocket sends with same size
    const pasteEvents = events.filter(e => e.type === EventType.PASTE);
    
    for (const paste of pasteEvents) {
      // Find WebSocket sends after this paste
      const sendsAfterPaste = events.filter(e => 
        e.type === EventType.WEBSOCKET &&
        e.data?.direction === 'send' &&
        e.timestamp > paste.timestamp &&
        e.timestamp - paste.timestamp < 500 // Within 500ms of paste
      );

      // Check for duplicates (same payload size within window)
      for (let i = 0; i < sendsAfterPaste.length - 1; i++) {
        const send1 = sendsAfterPaste[i];
        const send2 = sendsAfterPaste[i + 1];
        
        if (
          send2.timestamp - send1.timestamp < DUPLICATE_WINDOW_MS &&
          send1.data.payloadSize === send2.data.payloadSize &&
          send1.data.payloadSize > 0
        ) {
          const timeDiff = send2.timestamp - send1.timestamp;
          return createResult(true, this.problemCode, {
            explanation: `Ctrl+V triggered TWO WebSocket sends (${timeDiff}ms apart) with same content. This causes double paste.`,
            evidence: `Paste at ${paste.relativeMs}ms → Send #1 at ${send1.relativeMs}ms → Send #2 at ${send2.relativeMs}ms`,
            suggestion: 'Check if paste handler is registered twice or if xterm native paste AND custom handler both fire.',
            confidence: 0.95,
            relevantEvents: [paste, send1, send2],
          });
        }
      }
    }

    // Also check for isDuplicate flag set by diagnosticCore
    const duplicateSends = events.filter(e => 
      e.type === EventType.WEBSOCKET && 
      e.data?.isDuplicate
    );

    if (duplicateSends.length > 0) {
      return createResult(true, this.problemCode, {
        explanation: 'Duplicate WebSocket sends detected within 100ms window.',
        evidence: `Found ${duplicateSends.length} duplicate send(s)`,
        suggestion: 'Check for multiple event handler registrations.',
        confidence: 0.9,
        relevantEvents: duplicateSends,
      });
    }

    return createResult(false, this.problemCode);
  }
}

// ============================================================================
// SPACEBAR BLOCKED DETECTOR
// ============================================================================

/**
 * Detects when spacebar keydown doesn't reach terminal
 */
export class SpacebarBlockedDetector {
  constructor() {
    this.name = 'SpacebarBlockedDetector';
    this.problemCode = 'SPACEBAR_BLOCKED';
  }

  /**
   * Analyze events for spacebar blocking
   * @param {Object[]} events - Diagnostic events
   * @returns {DetectionResult}
   */
  analyze(events) {
    if (!events || events.length === 0) {
      return createResult(false, this.problemCode);
    }

    // Find spacebar keydown events
    const spaceKeydowns = events.filter(e => 
      e.type === EventType.KEYBOARD &&
      e.data?.subtype === 'keydown' &&
      (e.data?.code === 'Space' || e.data?.key === ' ')
    );

    if (spaceKeydowns.length === 0) {
      return createResult(false, this.problemCode, {
        explanation: 'No spacebar presses recorded yet.',
      });
    }

    // Check for preventDefault
    const preventedSpaces = spaceKeydowns.filter(e => e.data?.prevented);
    if (preventedSpaces.length > 0) {
      return createResult(true, this.problemCode, {
        explanation: `Spacebar is being blocked by preventDefault() - ${preventedSpaces.length} of ${spaceKeydowns.length} presses prevented.`,
        evidence: 'Event.defaultPrevented is true',
        suggestion: 'Find which event handler calls preventDefault on spacebar.',
        confidence: 0.95,
        relevantEvents: preventedSpaces,
      });
    }

    // Check for wrong target (focus issue)
    const wrongTargetSpaces = spaceKeydowns.filter(e => 
      e.data?.target !== 'TEXTAREA' &&
      !e.data?.targetClass?.includes('xterm')
    );

    if (wrongTargetSpaces.length > 0) {
      const pct = Math.round((wrongTargetSpaces.length / spaceKeydowns.length) * 100);
      const targetTag = wrongTargetSpaces[0].data?.target || 'unknown';
      
      return createResult(true, this.problemCode, {
        explanation: `Spacebar events not reaching terminal - focus is on ${targetTag} instead of TEXTAREA (${pct}% of presses).`,
        evidence: `Target: ${targetTag}, Expected: TEXTAREA.xterm-helper-textarea`,
        suggestion: 'Terminal focus management issue - check if focus is being stolen.',
        confidence: 0.85,
        relevantEvents: wrongTargetSpaces.slice(0, 5),
      });
    }

    // Check if spacebar keydown reaches terminal data
    for (const keydown of spaceKeydowns) {
      const terminalData = events.find(e => 
        e.type === EventType.TERMINAL_DATA &&
        e.timestamp > keydown.timestamp &&
        e.timestamp - keydown.timestamp < 100 &&
        e.data?.keyName === 'Spacebar'
      );

      if (!terminalData) {
        // Spacebar didn't reach terminal
        return createResult(true, this.problemCode, {
          explanation: 'Spacebar keydown fired but never reached terminal.onData handler.',
          evidence: `Keydown at ${keydown.relativeMs}ms, no corresponding terminal data within 100ms`,
          suggestion: 'Check xterm.js event handler chain for early termination.',
          confidence: 0.8,
          relevantEvents: [keydown],
        });
      }
    }

    return createResult(false, this.problemCode, {
      explanation: 'Spacebar appears to be working correctly.',
    });
  }
}

// ============================================================================
// AM STALE DETECTOR
// ============================================================================

/**
 * Detects when AM system isn't producing output despite activity
 */
export class AMStaleDetector {
  constructor() {
    this.name = 'AMStaleDetector';
    this.problemCode = 'AM_NO_OUTPUT';
  }

  /**
   * Analyze events for AM staleness
   * @param {Object[]} events - Diagnostic events
   * @param {Object} options - Analysis options
   * @param {number} options.currentTime - Current timestamp for comparison
   * @returns {DetectionResult}
   */
  analyze(events, options = {}) {
    const currentTime = options.currentTime || Date.now();
    
    if (!events || events.length === 0) {
      return createResult(false, this.problemCode);
    }

    // Find AM events
    const amEvents = events.filter(e => e.type === EventType.AM);
    
    if (amEvents.length === 0) {
      return createResult(false, this.problemCode, {
        explanation: 'No AM activity recorded.',
      });
    }

    // Find LLM detection events
    const llmDetected = amEvents.filter(e => 
      e.data?.action === 'llm_detected' || 
      e.data?.action === 'conversation_start'
    );

    // Find file write events
    const fileWrites = amEvents.filter(e => e.data?.action === 'file_write');

    // Find capture events (input/output)
    const captures = amEvents.filter(e => 
      e.data?.action === 'input_captured' || 
      e.data?.action === 'output_captured'
    );

    // Scenario 1: LLM detected but no file writes
    if (llmDetected.length > 0 && fileWrites.length === 0) {
      const lastLLM = llmDetected[llmDetected.length - 1];
      const timeSinceDetection = currentTime - lastLLM.timestamp;
      
      if (timeSinceDetection > AM_STALE_THRESHOLD_MS) {
        return createResult(true, this.problemCode, {
          explanation: `LLM detected ${Math.round(timeSinceDetection / 1000)}s ago but no output file written.`,
          evidence: `Provider: ${lastLLM.data?.provider || 'unknown'}, Last detection: ${new Date(lastLLM.timestamp).toISOString()}`,
          suggestion: 'AM capture pipeline may be broken. Check llm_logger.go for file write logic.',
          confidence: 0.9,
          relevantEvents: [lastLLM],
        });
      }
    }

    // Scenario 2: Captures happening but no file writes
    if (captures.length > 0 && fileWrites.length === 0) {
      return createResult(true, this.problemCode, {
        explanation: `AM captured ${captures.length} turns but never wrote to disk.`,
        evidence: `Captures: ${captures.length}, File writes: 0`,
        suggestion: 'Check if AM auto-save is triggering. May need to manually trigger save.',
        confidence: 0.85,
        relevantEvents: captures.slice(-5),
      });
    }

    // Scenario 3: File write failed verification
    const failedWrites = fileWrites.filter(e => e.data?.verified === false);
    if (failedWrites.length > 0) {
      return createResult(true, this.problemCode, {
        explanation: `File write attempted but failed verification - file may not exist.`,
        evidence: `Path: ${failedWrites[0].data?.path}`,
        suggestion: 'Check file permissions and directory existence.',
        confidence: 0.95,
        relevantEvents: failedWrites,
      });
    }

    // All good
    if (fileWrites.length > 0) {
      return createResult(false, this.problemCode, {
        explanation: `AM is working - ${fileWrites.length} file(s) written.`,
      });
    }

    return createResult(false, this.problemCode);
  }

  /**
   * Compare frontend and backend AM status
   * @param {Object[]} frontendEvents - Events from frontend
   * @param {Object} backendStatus - Status from /api/diagnostics/am-status
   * @returns {DetectionResult}
   */
  analyzeWithBackend(frontendEvents, backendStatus) {
    if (!backendStatus) {
      return createResult(false, this.problemCode, {
        explanation: 'No backend status available for comparison.',
      });
    }

    // Check for conversation count mismatch
    const frontendActiveConvs = frontendEvents.filter(e => 
      e.type === EventType.AM && 
      e.data?.action === 'conversation_active'
    );

    if (frontendActiveConvs.length > 0 && backendStatus.activeConversations === 0) {
      return createResult(true, this.problemCode, {
        explanation: 'Frontend sees active conversation, backend does not.',
        evidence: `Frontend: ${frontendActiveConvs.length} active, Backend: ${backendStatus.activeConversations}`,
        suggestion: 'Events may not be reaching the Go backend. Check WebSocket connection.',
        confidence: 0.9,
        relevantEvents: frontendActiveConvs,
      });
    }

    return createResult(false, this.problemCode);
  }
}

// ============================================================================
// HYDRATION ISSUE DETECTOR
// ============================================================================

/**
 * Detects keyboard issues after fresh load (React hydration timing)
 */
export class HydrationIssueDetector {
  constructor() {
    this.name = 'HydrationIssueDetector';
    this.problemCode = 'HYDRATION_DELAY';
  }

  /**
   * Analyze events for hydration issues
   * @param {Object[]} events - Diagnostic events
   * @returns {DetectionResult}
   */
  analyze(events) {
    if (!events || events.length === 0) {
      return createResult(false, this.problemCode);
    }

    // Find init events
    const initEvents = events.filter(e => e.type === EventType.INIT);
    const handlersAttached = initEvents.find(e => e.data?.phase === 'handlers_attached');
    
    if (!handlersAttached) {
      return createResult(false, this.problemCode, {
        explanation: 'No handler attachment event recorded.',
      });
    }

    // Find first keyboard event after handlers attached
    const keyboardEvents = events.filter(e => 
      e.type === EventType.KEYBOARD &&
      e.timestamp > handlersAttached.timestamp
    );

    if (keyboardEvents.length === 0) {
      return createResult(false, this.problemCode, {
        explanation: 'No keyboard events after handlers attached.',
      });
    }

    const firstKeyboard = keyboardEvents[0];
    const gap = firstKeyboard.timestamp - handlersAttached.timestamp;

    // Scenario 1: Large gap between mount and first keyboard response
    if (gap > HYDRATION_GAP_THRESHOLD_MS) {
      return createResult(true, this.problemCode, {
        explanation: `${gap}ms gap between handlers attached and first keyboard event.`,
        evidence: `Handlers attached: ${handlersAttached.relativeMs}ms, First keyboard: ${firstKeyboard.relativeMs}ms`,
        suggestion: 'May indicate React hydration timing issue. Try forcing focus after mount.',
        confidence: 0.7,
        relevantEvents: [handlersAttached, firstKeyboard],
      });
    }

    // Scenario 2: First few spacebar presses fail, later ones work
    const spaceEvents = keyboardEvents.filter(e => 
      e.data?.code === 'Space' || e.data?.key === ' '
    );

    if (spaceEvents.length >= 3) {
      // Check if first ones failed (wrong target) but later ones succeeded
      const earlySpaces = spaceEvents.slice(0, 2);
      const laterSpaces = spaceEvents.slice(2);
      
      const earlyFailures = earlySpaces.filter(e => e.data?.target !== 'TEXTAREA');
      const laterSuccesses = laterSpaces.filter(e => e.data?.target === 'TEXTAREA');

      if (earlyFailures.length > 0 && laterSuccesses.length > 0) {
        return createResult(true, this.problemCode, {
          explanation: `First ${earlyFailures.length} spacebar presses failed, later ones worked. Classic hydration issue.`,
          evidence: 'Early events targeted wrong element, focus corrected later.',
          suggestion: 'Force terminal focus immediately after mount and after fit() call.',
          confidence: 0.85,
          relevantEvents: [...earlyFailures, laterSuccesses[0]],
        });
      }
    }

    return createResult(false, this.problemCode, {
      explanation: 'No hydration issues detected.',
    });
  }
}

// ============================================================================
// PROBLEM DETECTOR MANAGER
// ============================================================================

/**
 * Manages all problem detectors and provides aggregate analysis
 */
export class ProblemDetectorManager {
  constructor() {
    this.detectors = {
      doublePaste: new DoublePasteDetector(),
      spacebarBlocked: new SpacebarBlockedDetector(),
      amStale: new AMStaleDetector(),
      hydrationIssue: new HydrationIssueDetector(),
    };
  }

  /**
   * Run all detectors on event set
   * @param {Object[]} events - Diagnostic events
   * @param {Object} options - Analysis options
   * @returns {Object} - Results keyed by detector name
   */
  analyzeAll(events, options = {}) {
    return {
      doublePaste: this.detectors.doublePaste.analyze(events),
      spacebarBlocked: this.detectors.spacebarBlocked.analyze(events),
      amStale: this.detectors.amStale.analyze(events, options),
      hydrationIssue: this.detectors.hydrationIssue.analyze(events),
    };
  }

  /**
   * Get summary of detected problems
   * @param {Object[]} events - Diagnostic events
   * @returns {Object} - Summary with count and list
   */
  getSummary(events) {
    const results = this.analyzeAll(events);
    const problems = Object.entries(results)
      .filter(([_, result]) => result.detected)
      .map(([name, result]) => ({
        name,
        problem: result.problem,
        explanation: result.explanation,
        confidence: result.confidence,
      }));

    return {
      problemCount: problems.length,
      problems,
      allResults: results,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const problemDetectorManager = new ProblemDetectorManager();

export default problemDetectorManager;
