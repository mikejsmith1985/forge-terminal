// Tests for neutralizeSocket — the guard that prevents a superseded WebSocket
// from fighting the live socket over shared component state. Two live sockets
// on one tab is the root cause of the phantom "Another device controls this
// terminal" banner whose Take Control button could never win.
import { describe, it, expect, vi } from 'vitest';
import { neutralizeSocket } from './websocketManager';

// Numeric readyState values from the WebSocket spec (no WebSocket global in node).
const SOCKET_STATE_CONNECTING = 0;
const SOCKET_STATE_OPEN = 1;
const SOCKET_STATE_CLOSING = 2;
const SOCKET_STATE_CLOSED = 3;

function makeFakeSocket(readyState) {
  return {
    readyState,
    onopen: () => {},
    onmessage: () => {},
    onerror: () => {},
    onclose: () => {},
    close: vi.fn(),
  };
}

describe('neutralizeSocket', () => {
  it('detaches every event handler so a superseded socket cannot mutate state', () => {
    const staleSocket = makeFakeSocket(SOCKET_STATE_OPEN);
    neutralizeSocket(staleSocket);
    expect(staleSocket.onopen).toBeNull();
    expect(staleSocket.onmessage).toBeNull();
    expect(staleSocket.onerror).toBeNull();
    expect(staleSocket.onclose).toBeNull();
  });

  it('closes a socket that is still OPEN', () => {
    const staleSocket = makeFakeSocket(SOCKET_STATE_OPEN);
    neutralizeSocket(staleSocket);
    expect(staleSocket.close).toHaveBeenCalledTimes(1);
  });

  it('closes a socket that is still CONNECTING (visibility-wake duplicate path)', () => {
    const staleSocket = makeFakeSocket(SOCKET_STATE_CONNECTING);
    neutralizeSocket(staleSocket);
    expect(staleSocket.close).toHaveBeenCalledTimes(1);
  });

  it('does not re-close a CLOSING or CLOSED socket', () => {
    const closingSocket = makeFakeSocket(SOCKET_STATE_CLOSING);
    neutralizeSocket(closingSocket);
    expect(closingSocket.close).not.toHaveBeenCalled();

    const closedSocket = makeFakeSocket(SOCKET_STATE_CLOSED);
    neutralizeSocket(closedSocket);
    expect(closedSocket.close).not.toHaveBeenCalled();
  });

  it('tolerates a null/undefined socket', () => {
    expect(() => neutralizeSocket(null)).not.toThrow();
    expect(() => neutralizeSocket(undefined)).not.toThrow();
  });

  it('swallows a close() that throws (browser already tore the socket down)', () => {
    const throwingSocket = makeFakeSocket(SOCKET_STATE_OPEN);
    throwingSocket.close = vi.fn(() => {
      throw new Error('socket already gone');
    });
    expect(() => neutralizeSocket(throwingSocket)).not.toThrow();
  });
});
