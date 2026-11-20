/**
 * forge-client.js — opens an authenticated MCP client to Forge, starting Forge first if needed.
 * Shared by the stdio bridge (index.js) and the vault wrapper (with-vault.js).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { ensureForgeRunning } from './launcher.js';

const TOKEN_PATH = join(homedir(), '.forge', 'mcp-token');

/** Reads the bearer token Forge writes on every start. */
async function readMCPToken() {
  try {
    return (await readFile(TOKEN_PATH, 'utf8')).trim();
  } catch {
    throw new Error(`Cannot read MCP token from ${TOKEN_PATH} — Forge started but has not written it yet.`);
  }
}

/** Ensures Forge is running, then returns a connected MCP client for /api/mcp. */
export async function connectToForge() {
  const port = await ensureForgeRunning();
  const token = await readMCPToken();

  const client = new Client({ name: 'forge-mcp-proxy', version: '1.1.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/api/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}
