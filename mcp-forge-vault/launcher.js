/**
 * launcher.js — finds a running Forge Terminal, or starts it and waits until it answers.
 *
 * Why custom: neither Claude Desktop nor the MCP SDK can start the program
 * behind an HTTP MCP server — a stdio server is the only thing they launch — so
 * this bridge has to bring Forge up itself when it is not already running.
 */

import { spawn } from 'child_process';
import { access, readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

/** Ports Forge binds, in its own preference order (cmd/forge/main.go preferredPorts). */
export const FORGE_PORTS = [3005, 8333, 8080, 9000, 3000, 3333];

/** How long one port probe may take before it counts as "nothing there". */
const PROBE_TIMEOUT_MS = 1500;

/** How long a cold Forge start may take before the bridge gives up. */
const DEFAULT_STARTUP_TIMEOUT_MS = 45000;

/** Delay between readiness checks while Forge is starting. */
const DEFAULT_POLL_INTERVAL_MS = 500;

/** File Forge writes at startup naming its own executable (cmd/forge/exe_record.go). */
const EXECUTABLE_RECORD_PATH = ['.forge', 'forge-exe'];

/**
 * Returns the first port where Forge answers /api/version with a version, or null.
 * /api/version needs no token, so this works before Forge has ever written one.
 */
export async function findRunningForgePort({ fetchImpl = fetch } = {}) {
  for (const port of FORGE_PORTS) {
    if (await isForgeAnswering(port, fetchImpl)) return port;
  }
  return null;
}

async function isForgeAnswering(port, fetchImpl) {
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/api/version`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return typeof payload?.version === 'string' && payload.version !== '';
  } catch {
    return false;
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Works out which Forge binary to start: the FORGE_EXE override first, then the
 * path Forge recorded the last time it ran. Returns null when neither is usable.
 */
export async function resolveForgeExecutable({
  env = process.env,
  homeDir = homedir(),
  exists = fileExists,
  readText = (path) => readFile(path, 'utf8'),
} = {}) {
  if (env.FORGE_EXE) return env.FORGE_EXE;

  let recordedPath;
  try {
    recordedPath = (await readText(join(homeDir, ...EXECUTABLE_RECORD_PATH))).trim();
  } catch {
    return null;
  }
  if (!recordedPath || !(await exists(recordedPath))) return null;
  return recordedPath;
}

/**
 * Starts Forge as an independent background process so it keeps running after
 * Claude Desktop closes this bridge. Forge opens its UI in the browser as usual
 * (terminal sessions live there) unless FORGE_MCP_NO_BROWSER is set.
 */
export function startForgeProcess(executablePath, { spawnImpl = spawn, env = process.env } = {}) {
  const childEnv = { ...env };
  if (env.FORGE_MCP_NO_BROWSER) childEnv.NO_BROWSER = '1';

  const child = spawnImpl(executablePath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: childEnv,
  });
  // A spawn failure (bad path, blocked binary) surfaces as the readiness timeout.
  child.on('error', () => {});
  child.unref();
}

const defaultDependencies = {
  findPort: () => findRunningForgePort(),
  resolveExecutable: () => resolveForgeExecutable(),
  launch: (executablePath) => startForgeProcess(executablePath),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now: () => Date.now(),
  startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
};

// One in-flight start per dependency set, so parallel tool calls never spawn twice.
const pendingStarts = new WeakMap();

/**
 * Returns the port of a running Forge, starting Forge first if it is not up.
 * Concurrent callers share a single launch attempt.
 */
export function ensureForgeRunning(overrides = {}) {
  const pending = pendingStarts.get(overrides);
  if (pending) return pending;

  const attempt = findOrStartForge({ ...defaultDependencies, ...overrides })
    .finally(() => pendingStarts.delete(overrides));
  pendingStarts.set(overrides, attempt);
  return attempt;
}

async function findOrStartForge(deps) {
  const runningPort = await deps.findPort();
  if (runningPort) return runningPort;

  const executablePath = await deps.resolveExecutable();
  if (!executablePath) {
    throw new Error(
      'Forge Terminal is not running and its location is unknown. ' +
      'Start Forge once by hand (it records its path), or set FORGE_EXE ' +
      'in the forge-vault entry of claude_desktop_config.json.'
    );
  }

  process.stderr.write(`[forge-mcp] Forge not running — starting ${executablePath}\n`);
  deps.launch(executablePath);
  return waitForForge(deps, executablePath);
}

async function waitForForge(deps, executablePath) {
  const deadline = deps.now() + deps.startupTimeoutMs;
  while (deps.now() < deadline) {
    const port = await deps.findPort();
    if (port) return port;
    await deps.sleep(deps.pollIntervalMs);
  }
  throw new Error(
    `Forge Terminal did not start within ${deps.startupTimeoutMs / 1000}s (${executablePath}). ` +
    'Check ~/.forge/forge.log.'
  );
}
