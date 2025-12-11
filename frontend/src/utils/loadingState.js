/**
 * Loading State Management Utility
 * Phase 1 P0 Fix #7-9: Better loading indicators
 */

export class LoadingStateManager {
  constructor() {
    this.operations = new Map();
  }

  startOperation(operationId, operationName, timeoutMs = 3000) {
    const operation = {
      id: operationId,
      name: operationName,
      startTime: Date.now(),
      timeoutMs
    };
    this.operations.set(operationId, operation);
    return operation;
  }

  endOperation(operationId) {
    const operation = this.operations.get(operationId);
    if (!operation) return 0;
    const duration = Date.now() - operation.startTime;
    this.operations.delete(operationId);
    return duration;
  }

  hasActiveOperations() {
    return this.operations.size > 0;
  }
}

export function getLoadingMessage(seconds) {
  if (seconds < 1) return '⏳ Loading...';
  if (seconds < 3) return `⏳ Loading (${seconds}s)...`;
  return `⏳ Still loading (${seconds}s)... This is taking longer than expected`;
}

export function createSpinner(options = {}) {
  return {
    size: options.size || 'medium',
    message: options.message || 'Loading...',
    visible: options.visible !== false
  };
}

export function getLoadingIndicatorProps(isLoading, elapsedSeconds = 0) {
  return {
    visible: isLoading,
    message: getLoadingMessage(elapsedSeconds),
    showTimeoutWarning: elapsedSeconds > 3
  };
}

export class LoadingStateProvider {
  constructor() {
    this.loadingOperations = new Set();
    this.listeners = new Set();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    this.listeners.forEach(callback => callback(this.getState()));
  }

  setLoading(operationId) {
    this.loadingOperations.add(operationId);
    this.notifyListeners();
  }

  setComplete(operationId) {
    this.loadingOperations.delete(operationId);
    this.notifyListeners();
  }

  getState() {
    return {
      isAnyLoading: this.loadingOperations.size > 0,
      operations: new Set(this.loadingOperations)
    };
  }

  reset() {
    this.loadingOperations.clear();
    this.notifyListeners();
  }
}

export const globalLoadingState = new LoadingStateProvider();

export default {
  LoadingStateManager,
  LoadingStateProvider,
  getLoadingIndicatorProps,
  getLoadingMessage,
  createSpinner,
  globalLoadingState
};
