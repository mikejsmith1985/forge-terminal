#!/usr/bin/env node
/**
 * mcp-forge-vault — Stdio-to-HTTP bridge from Claude Desktop / Claude Code to
 * Forge Terminal's built-in MCP server (/api/mcp), starting Forge if needed.
 *
 * Why a bridge? Claude's MCP clients launch stdio servers, but Forge speaks
 * Streamable HTTP. This adapter:
 *   1. Answers the client's handshake immediately (no Forge needed yet)
 *   2. On the first real request, finds Forge — or starts it and waits
 *   3. Reads the bearer token from ~/.forge/mcp-token and forwards requests
 *   4. Reconnects transparently if Forge restarts during the session
 *
 * All tools are discovered dynamically from the live server — no hardcoding.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { connectToForge } from './forge-client.js';
import { createUpstreamSession } from './upstream.js';

async function main() {
  const upstream = createUpstreamSession({ connect: connectToForge });

  const server = new Server(
    { name: 'forge-terminal', version: '1.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const { tools } = await upstream.listTools();
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    upstream.callTool({
      name: request.params.name,
      arguments: request.params.arguments ?? {},
    })
  );

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`[forge-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
