/**
 * Unit tests for upstream.js — the lazily connected, self-healing link to Forge.
 */

import { describe, it, expect, vi } from 'vitest';
import { createUpstreamSession } from './upstream.js';

function fakeClient(overrides = {}) {
  return {
    listTools: vi.fn(async () => ({ tools: [{ name: 'vault_list' }] })),
    callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
    close: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('createUpstreamSession', () => {
  it('does not touch Forge until the first request', () => {
    const connect = vi.fn();
    createUpstreamSession({ connect });
    expect(connect).not.toHaveBeenCalled();
  });

  it('connects once and reuses the client', async () => {
    const client = fakeClient();
    const connect = vi.fn(async () => client);
    const session = createUpstreamSession({ connect });

    await session.listTools();
    await session.callTool({ name: 'vault_list', arguments: {} });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('reconnects and retries once when Forge restarted mid-session', async () => {
    const deadClient = fakeClient({ callTool: vi.fn(async () => { throw new Error('fetch failed'); }) });
    const freshClient = fakeClient();
    const connect = vi.fn()
      .mockResolvedValueOnce(deadClient)
      .mockResolvedValueOnce(freshClient);
    const session = createUpstreamSession({ connect });

    const result = await session.callTool({ name: 'vault_list', arguments: {} });
    expect(result.content[0].text).toBe('ok');
    expect(connect).toHaveBeenCalledTimes(2);
    expect(deadClient.close).toHaveBeenCalled();
  });

  it('reports the error when the retry also fails', async () => {
    const failing = () => fakeClient({ listTools: vi.fn(async () => { throw new Error('down'); }) });
    const connect = vi.fn(async () => failing());
    const session = createUpstreamSession({ connect });
    await expect(session.listTools()).rejects.toThrow('down');
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('retries the connection itself on the next request after a failed connect', async () => {
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error('not started'))
      .mockRejectedValueOnce(new Error('not started'))
      .mockResolvedValueOnce(fakeClient());
    const session = createUpstreamSession({ connect });

    await expect(session.listTools()).rejects.toThrow('not started');
    const { tools } = await session.listTools();
    expect(tools).toHaveLength(1);
  });
});
