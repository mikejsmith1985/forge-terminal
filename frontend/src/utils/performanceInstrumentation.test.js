/**
 * @fileoverview Tests for Performance Instrumentation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock PerformanceObserver
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockPerformanceObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe = mockObserve;
  disconnect = mockDisconnect;
}

// Store original
const originalPerformanceObserver = global.PerformanceObserver;

describe('PerformanceInstrumentation', () => {
  let performanceInstrumentation;
  
  beforeEach(async () => {
    // Reset mocks
    mockObserve.mockClear();
    mockDisconnect.mockClear();
    
    // Install mock
    global.PerformanceObserver = MockPerformanceObserver;
    
    // Fresh import for each test
    vi.resetModules();
    const module = await import('./performanceInstrumentation.js');
    performanceInstrumentation = module.performanceInstrumentation;
  });
  
  afterEach(() => {
    if (performanceInstrumentation?.isRunning()) {
      performanceInstrumentation.stop();
    }
    global.PerformanceObserver = originalPerformanceObserver;
  });

  it('should start and stop correctly', () => {
    expect(performanceInstrumentation.isRunning()).toBe(false);
    
    performanceInstrumentation.start();
    expect(performanceInstrumentation.isRunning()).toBe(true);
    expect(mockObserve).toHaveBeenCalled();
    
    performanceInstrumentation.stop();
    expect(performanceInstrumentation.isRunning()).toBe(false);
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should record terminal write timing', () => {
    performanceInstrumentation.start();
    
    performanceInstrumentation.recordTerminalWrite(1000, 25);
    performanceInstrumentation.recordTerminalWrite(500, 10);
    
    const data = performanceInstrumentation.exportData();
    expect(data.terminalWriteHistory.length).toBe(2);
    expect(data.terminalWriteHistory[0].dataSize).toBe(1000);
    expect(data.terminalWriteHistory[0].durationMs).toBe(25);
  });

  it('should record WebSocket message timing', () => {
    performanceInstrumentation.start();
    
    performanceInstrumentation.recordWebSocketMessage('receive', 2000, 15);
    performanceInstrumentation.recordWebSocketMessage('send', 100, 2);
    
    const data = performanceInstrumentation.exportData();
    expect(data.webSocketMessageHistory.length).toBe(2);
    expect(data.webSocketMessageHistory[0].direction).toBe('receive');
    expect(data.webSocketMessageHistory[0].dataSize).toBe(2000);
  });

  it('should get system state', () => {
    performanceInstrumentation.start();
    
    const state = performanceInstrumentation.getSystemState();
    
    expect(state).toHaveProperty('visibilityState');
    expect(state).toHaveProperty('hasFocus');
    expect(state).toHaveProperty('longTaskCount');
    expect(state).toHaveProperty('runtimeMs');
  });

  it('should call freeze callbacks', () => {
    performanceInstrumentation.start();
    
    const freezeCallback = vi.fn();
    const unsubscribe = performanceInstrumentation.onFreeze(freezeCallback);
    
    // Simulate a long task entry via the observer callback
    const mockEntry = {
      startTime: 1000,
      duration: 5000, // 5 seconds - triggers freeze
      name: 'self',
    };
    
    // Access the observer callback (it's stored internally)
    // This is a simplified test - in real usage the browser calls this
    performanceInstrumentation._recordLongTask(mockEntry);
    
    expect(freezeCallback).toHaveBeenCalled();
    expect(freezeCallback.mock.calls[0][0].duration).toBe(5000);
    
    // Cleanup
    unsubscribe();
  });

  it('should export comprehensive data', () => {
    performanceInstrumentation.start();
    
    // Record some data
    performanceInstrumentation.recordTerminalWrite(100, 5);
    performanceInstrumentation.recordWebSocketMessage('receive', 200, 3);
    
    const data = performanceInstrumentation.exportData();
    
    expect(data.isRunning).toBe(true);
    expect(data.systemState).toBeDefined();
    expect(data.terminalWriteHistory.length).toBeGreaterThan(0);
    expect(data.webSocketMessageHistory.length).toBeGreaterThan(0);
  });
});
