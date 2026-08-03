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

// Numeric readyState values from the WebSocket spec, named so the liveness
// check below reads without a WebSocket global (also keeps this testable in node).
const SOCKET_STATE_CONNECTING = 0;
const SOCKET_STATE_OPEN = 1;

/**
 * neutralizeSocket fully disowns a WebSocket this code no longer controls:
 * it detaches every event handler, then closes the socket if still alive.
 *
 * Why this exists: when a tab reconnects (backoff retry, visibility wake, or a
 * manual "Reconnect" click) while its previous socket is still open, BOTH
 * sockets keep firing handlers into the same component state. The server sees
 * the old socket as a second "device", demotes the new one to passive viewer,
 * and the two connections fight over the active-device flag — producing a
 * phantom "Another device controls this terminal" banner whose Take Control
 * button can never win. Disowning the superseded socket before opening a new
 * one guarantees at most one socket owns a tab's state.
 */
export function neutralizeSocket(socket) {
  if (!socket) return;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  const isSocketStillAlive =
    socket.readyState === SOCKET_STATE_CONNECTING || socket.readyState === SOCKET_STATE_OPEN;
  if (isSocketStillAlive) {
    try {
      socket.close();
    } catch {
      // The browser already tore the socket down — nothing left to release.
    }
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
  neutralizeSocket,
  isValidWebSocketURL,
  getWebSocketURL
};
