/**
 * WebSocket Reconnection Manager
 * Phase 1 P0 Fix #10-11: WebSocket robustness
 */

export class WebSocketReconnectionManager {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      maxAttempts: options.maxAttempts || 10,
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      backoffMultiplier: options.backoffMultiplier || 2,
      timeoutMs: options.timeoutMs || 5000,
      onConnect: options.onConnect || (() => {}),
      onDisconnect: options.onDisconnect || (() => {}),
      onError: options.onError || (() => {}),
      onReconnecting: options.onReconnecting || (() => {}),
      onMessage: options.onMessage || (() => {})
    };

    this.ws = null;
    this.attemptCount = 0;
    this.reconnectTimer = null;
    this.messageQueue = [];
    this.isConnected = false;
    this.isClosed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.attemptCount = 0;
          this.options.onConnect();
          this.flushMessageQueue();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.options.onMessage(event.data);
        };

        this.ws.onerror = (error) => {
          this.handleError(error);
          reject(new Error('WebSocket connection error'));
        };

        this.ws.onclose = () => {
          this.handleClose();
        };

        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, this.options.timeoutMs);

      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  handleError(error) {
    console.error('WebSocket error:', error);
    this.isConnected = false;
    this.options.onError({
      type: 'connection_error',
      reason: error.message,
      attemptNumber: this.attemptCount
    });
    this.scheduleReconnect();
  }

  handleClose() {
    this.isConnected = false;
    if (!this.isClosed) {
      this.options.onDisconnect();
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.attemptCount >= this.options.maxAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.attemptCount++;
    const exponentialDelay = this.options.initialDelay * 
      Math.pow(this.options.backoffMultiplier, this.attemptCount - 1);
    const delayWithJitter = exponentialDelay + Math.random() * 1000;
    const delay = Math.min(delayWithJitter, this.options.maxDelay);

    this.options.onReconnecting({
      attemptNumber: this.attemptCount,
      nextDelayMs: Math.round(delay),
      maxAttempts: this.options.maxAttempts
    });

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.warn('Reconnection failed:', error);
        this.scheduleReconnect();
      });
    }, delay);
  }

  send(data) {
    if (this.isConnected && this.ws) {
      try {
        this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
      } catch (error) {
        console.error('Send failed:', error);
        this.messageQueue.push(data);
      }
    } else {
      this.messageQueue.push(data);
    }
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const data = this.messageQueue.shift();
      try {
        this.ws?.send(typeof data === 'string' ? data : JSON.stringify(data));
      } catch (error) {
        console.error('Failed to send queued message:', error);
        this.messageQueue.unshift(data);
        break;
      }
    }
  }

  close() {
    this.isClosed = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      attemptCount: this.attemptCount,
      maxAttempts: this.options.maxAttempts,
      messageQueueLength: this.messageQueue.length,
      isClosed: this.isClosed
    };
  }

  forceReconnect() {
    this.attemptCount = 0;
    this.close();
    this.isClosed = false;
    this.connect().catch(error => {
      console.error('Force reconnect failed:', error);
      this.scheduleReconnect();
    });
  }
}

export function createWebSocketManager(url, options = {}) {
  return new WebSocketReconnectionManager(url, options);
}

export class ConnectionStateTracker {
  constructor() {
    this.states = [];
    this.maxHistoryLength = 100;
  }

  recordState(state, metadata = {}) {
    const record = {
      timestamp: Date.now(),
      state,
      metadata
    };
    this.states.push(record);
    if (this.states.length > this.maxHistoryLength) {
      this.states.shift();
    }
  }

  getHistory(count = 10) {
    return this.states.slice(-count);
  }

  getStatistics() {
    const disconnects = this.states.filter(s => s.state === 'disconnected').length;
    const errors = this.states.filter(s => s.state === 'error').length;
    const totalEvents = this.states.length;

    return {
      totalEvents,
      disconnections: disconnects,
      errors,
      errorRate: totalEvents > 0 ? (errors / totalEvents) : 0,
      lastState: this.states[this.states.length - 1]?.state || 'unknown'
    };
  }

  reset() {
    this.states = [];
  }
}

export function isValidWebSocketURL(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch (error) {
    return false;
  }
}

export function getWebSocketURL(httpUrl) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(window.location.href);
  return `${protocol}//${url.host}`;
}

export default {
  WebSocketReconnectionManager,
  ConnectionStateTracker,
  createWebSocketManager,
  isValidWebSocketURL,
  getWebSocketURL
};
