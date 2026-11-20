/**
 * Unit tests for launcher.js — finding, starting, and waiting for Forge Terminal.
 * Every external effect (network, filesystem, process spawn, clock) is mocked.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  FORGE_PORTS,
  findRunningForgePort,
  resolveForgeExecutable,
  startForgeProcess,
  ensureForgeRunning,
} from './launcher.js';

function versionResponse(version) {
  return { ok: true, status: 200, json: async () => ({ version }) };
}

function refusedFetch() {
  return vi.fn(async () => { throw new Error('ECONNREFUSED'); });
}

describe('findRunningForgePort', () => {
  it('returns the first port answering /api/version with a version', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes(':8333/')) return versionResponse('7.25.7');
      throw new Error('ECONNREFUSED');
    });
    expect(await findRunningForgePort({ fetchImpl })).toBe(8333);
  });

  it('returns null when nothing answers', async () => {
    expect(await findRunningForgePort({ fetchImpl: refusedFetch() })).toBeNull();
  });

  it('ignores a non-Forge service that answers without a version', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    expect(await findRunningForgePort({ fetchImpl })).toBeNull();
  });

  it('probes 3005 first', () => {
    expect(FORGE_PORTS[0]).toBe(3005);
  });
});

describe('resolveForgeExecutable', () => {
  const homeDir = 'C:\\Users\\dev';

  it('prefers the FORGE_EXE environment override', async () => {
    const exists = vi.fn(async () => true);
    const readText = vi.fn();
    const resolved = await resolveForgeExecutable({
      env: { FORGE_EXE: 'D:\\tools\\fterm.exe' }, homeDir, exists, readText,
    });
    expect(resolved).toBe('D:\\tools\\fterm.exe');
    expect(readText).not.toHaveBeenCalled();
  });

  it('falls back to the path Forge recorded at its last start', async () => {
    const exists = vi.fn(async (candidate) => candidate === 'C:\\Installers\\fterm.exe');
    const readText = vi.fn(async () => 'C:\\Installers\\fterm.exe\r\n');
    const resolved = await resolveForgeExecutable({ env: {}, homeDir, exists, readText });
    expect(resolved).toBe('C:\\Installers\\fterm.exe');
  });

  it('skips a recorded path whose file no longer exists', async () => {
    const exists = vi.fn(async () => false);
    const readText = vi.fn(async () => 'C:\\gone\\fterm.exe');
    const resolved = await resolveForgeExecutable({ env: {}, homeDir, exists, readText });
    expect(resolved).toBeNull();
  });

  it('returns null when there is no override and no record', async () => {
    const exists = vi.fn(async () => false);
    const readText = vi.fn(async () => { throw new Error('ENOENT'); });
    expect(await resolveForgeExecutable({ env: {}, homeDir, exists, readText })).toBeNull();
  });
});

describe('startForgeProcess', () => {
  it('spawns detached and hidden so Forge outlives the MCP bridge', () => {
    const unref = vi.fn();
    const spawnImpl = vi.fn(() => ({ unref, on: vi.fn() }));
    startForgeProcess('C:\\fterm.exe', { spawnImpl, env: {} });

    const [command, args, options] = spawnImpl.mock.calls[0];
    expect(command).toBe('C:\\fterm.exe');
    expect(args).toEqual([]);
    expect(options).toMatchObject({ detached: true, stdio: 'ignore', windowsHide: true });
    expect(unref).toHaveBeenCalled();
  });

  it('suppresses the browser only when FORGE_MCP_NO_BROWSER is set', () => {
    const spawnImpl = vi.fn(() => ({ unref: vi.fn(), on: vi.fn() }));
    startForgeProcess('C:\\fterm.exe', { spawnImpl, env: { FORGE_MCP_NO_BROWSER: '1' } });
    expect(spawnImpl.mock.calls[0][2].env.NO_BROWSER).toBe('1');

    startForgeProcess('C:\\fterm.exe', { spawnImpl, env: {} });
    expect(spawnImpl.mock.calls[1][2].env.NO_BROWSER).toBeUndefined();
  });
});

describe('ensureForgeRunning', () => {
  const noWait = async () => {};

  it('does not launch when Forge is already up', async () => {
    const launch = vi.fn();
    const port = await ensureForgeRunning({
      findPort: async () => 3005, resolveExecutable: vi.fn(), launch, sleep: noWait,
    });
    expect(port).toBe(3005);
    expect(launch).not.toHaveBeenCalled();
  });

  it('launches Forge and waits until it answers', async () => {
    const answers = [null, null, null, 3005];
    const launch = vi.fn();
    const port = await ensureForgeRunning({
      findPort: async () => answers.shift(),
      resolveExecutable: async () => 'C:\\fterm.exe',
      launch,
      sleep: noWait,
    });
    expect(launch).toHaveBeenCalledWith('C:\\fterm.exe');
    expect(port).toBe(3005);
  });

  it('explains how to fix it when the executable cannot be found', async () => {
    await expect(ensureForgeRunning({
      findPort: async () => null,
      resolveExecutable: async () => null,
      launch: vi.fn(),
      sleep: noWait,
    })).rejects.toThrow(/FORGE_EXE/);
  });

  it('gives up after the startup deadline', async () => {
    let clock = 0;
    await expect(ensureForgeRunning({
      findPort: async () => null,
      resolveExecutable: async () => 'C:\\fterm.exe',
      launch: vi.fn(),
      sleep: async (milliseconds) => { clock += milliseconds; },
      now: () => clock,
      startupTimeoutMs: 1000,
      pollIntervalMs: 250,
    })).rejects.toThrow(/did not start/);
  });

  it('shares one launch between concurrent callers', async () => {
    const launch = vi.fn();
    let isLaunched = false;
    const deps = {
      findPort: async () => (isLaunched ? 3005 : null),
      resolveExecutable: async () => 'C:\\fterm.exe',
      launch: (exe) => { launch(exe); isLaunched = true; },
      sleep: noWait,
    };
    const ports = await Promise.all([ensureForgeRunning(deps), ensureForgeRunning(deps)]);
    expect(ports).toEqual([3005, 3005]);
    expect(launch).toHaveBeenCalledTimes(1);
  });
});
