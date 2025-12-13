/**
 * In-app spacebar debugger
 * Can be triggered via /diagnose spacebar command
 */

export class SpacebarDebugger {
  constructor() {
    this.eventLog = [];
    this.maxEvents = 20;
    this.isActive = false;
    this.handler = null;
  }

  start() {
    if (this.isActive) {
      console.log('[SpacebarDebugger] Already running');
      return;
    }

    this.eventLog = [];
    this.isActive = true;

    this.handler = (e) => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: e.type,
        key: e.key,
        code: e.code,
        target: e.target.tagName,
        targetClass: e.target.className,
        activeElement: document.activeElement?.tagName,
        activeElementClass: document.activeElement?.className,
        defaultPrevented: e.defaultPrevented,
        propagationStopped: e.cancelBubble,
        isTrusted: e.isTrusted,
      };

      if (e.code === 'Space' || e.key === ' ') {
        console.log('%c🔴 SPACE KEY', 'color: red; font-weight: bold', logEntry);
        logEntry.isSpacebar = true;
      } else {
        console.log('📝 Key:', e.key, logEntry);
      }

      this.eventLog.push(logEntry);

      if (this.eventLog.length >= this.maxEvents) {
        this.stop();
      }
    };

    window.addEventListener('keydown', this.handler, true);
    window.addEventListener('keyup', this.handler, true);

    console.log('%c=== SPACEBAR DEBUGGER STARTED ===', 'color: cyan; font-size: 16px; font-weight: bold');
    console.log(`Capturing next ${this.maxEvents} keyboard events...`);
  }

  stop() {
    if (!this.isActive) return;

    window.removeEventListener('keydown', this.handler, true);
    window.removeEventListener('keyup', this.handler, true);
    this.isActive = false;

    console.log('%c=== CAPTURE COMPLETE ===', 'color: green; font-size: 16px; font-weight: bold');
  }

  getReport() {
    const report = {
      currentState: {
        textareaCount: document.querySelectorAll('.xterm-helper-textarea').length,
        activeElement: document.activeElement?.tagName,
        activeElementClass: document.activeElement?.className,
        focusedElement: document.querySelector(':focus')?.tagName,
      },
      events: this.eventLog,
      spacebarEvents: this.eventLog.filter(e => e.isSpacebar),
      analysis: this.analyze(),
    };

    return report;
  }

  analyze() {
    const spaceEvents = this.eventLog.filter(e => e.isSpacebar);
    
    if (spaceEvents.length === 0) {
      return { status: 'NO_SPACEBAR_EVENTS', message: 'No spacebar events captured' };
    }

    const prevented = spaceEvents.filter(e => e.defaultPrevented);
    if (prevented.length > 0) {
      return {
        status: 'PREVENTED',
        message: `Spacebar is being blocked by preventDefault() - ${prevented.length} events prevented`,
        preventedEvents: prevented,
      };
    }

    const wrongTarget = spaceEvents.filter(e => e.target !== 'TEXTAREA');
    if (wrongTarget.length > 0) {
      return {
        status: 'WRONG_TARGET',
        message: `Spacebar events not reaching textarea - target is ${wrongTarget[0].target}`,
        wrongTargetEvents: wrongTarget,
      };
    }

    const wrongFocus = spaceEvents.filter(e => e.activeElement !== 'TEXTAREA');
    if (wrongFocus.length > 0) {
      return {
        status: 'FOCUS_ISSUE',
        message: `Focus is on ${wrongFocus[0].activeElement} instead of TEXTAREA`,
        wrongFocusEvents: wrongFocus,
      };
    }

    return {
      status: 'LOOKS_GOOD',
      message: 'Spacebar events appear to be working correctly',
    };
  }

  printReport() {
    const report = this.getReport();
    
    console.log('\n%c📊 SPACEBAR DEBUG REPORT', 'color: yellow; font-size: 14px; font-weight: bold');
    console.log('\n--- Current State ---');
    console.table(report.currentState);
    
    console.log('\n--- Analysis ---');
    console.log(`Status: ${report.analysis.status}`);
    console.log(`Message: ${report.analysis.message}`);
    
    if (report.spacebarEvents.length > 0) {
      console.log('\n--- Spacebar Events ---');
      console.table(report.spacebarEvents);
    }

    if (report.analysis.preventedEvents) {
      console.log('\n⚠️  PREVENTED EVENTS:');
      console.table(report.analysis.preventedEvents);
    }

    console.log('\n--- All Events ---');
    console.table(report.events);

    return report;
  }

  // Export report as JSON for saving to file
  exportJSON() {
    return JSON.stringify(this.getReport(), null, 2);
  }
}

// Global instance
export const spacebarDebugger = new SpacebarDebugger();

// Make available in console
if (typeof window !== 'undefined') {
  window.spacebarDebugger = spacebarDebugger;
}
