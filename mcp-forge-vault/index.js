#!/usr/bin/env node
/**
 * mcp-forge-vault — MCP server that exposes Forge Vault to Claude Code.
 *
 * Secrets are treated with the same caution as the Forge API itself:
 *   - List/status endpoints never return secret values.
 *   - forge_vault_reveal logs a warning and requires an explicit id.
 *   - forge_vault_inject returns only a script path, never the values.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Mirrors preferredPorts in cmd/forge/main.go
const PREFERRED_PORTS = [3005, 8333, 8080, 9000, 3000, 3333];

let forgePort = null;

async function detectForgePort() {
  for (const port of PREFERRED_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}/api/vault/status`, {
        signal: AbortSignal.timeout(1200),
      });
      // 200 = vault ready, 503 = vault disabled but Forge is up — either is fine
      if (res.status === 200 || res.status === 503) {
        return port;
      }
    } catch {
      // port not listening — try next
    }
  }
  throw new Error(
    `Forge server not found on ports ${PREFERRED_PORTS.join(', ')} — is Forge running?`
  );
}

async function forgeUrl(path) {
  if (!forgePort) forgePort = await detectForgePort();
  return `http://localhost:${forgePort}${path}`;
}

async function forgeGet(path) {
  const url = await forgeUrl(path);
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text.trim()}`);
  return text ? JSON.parse(text) : null;
}

async function forgePost(path, body) {
  const url = await forgeUrl(path);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${text.trim()}`);
  return text ? JSON.parse(text) : null;
}

async function forgePut(path, body) {
  const url = await forgeUrl(path);
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${text.trim()}`);
  return text ? JSON.parse(text) : null;
}

async function forgeDelete(path) {
  const url = await forgeUrl(path);
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE ${path} → ${res.status}: ${text.trim()}`);
  }
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'forge_vault_status',
    description:
      'Returns Forge Vault health: whether it is open, total entry count, and how many entries are set to auto-inject into new terminal sessions. Never returns secret values.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'forge_vault_list',
    description:
      'Lists all secrets stored in Forge Vault. Returns metadata only (id, secretName, envVarName, autoInject, description) — never the secret values themselves.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'forge_vault_add',
    description:
      'Stores a new secret in Forge Vault. The value is encrypted immediately and never returned in responses.',
    inputSchema: {
      type: 'object',
      properties: {
        secretName: {
          type: 'string',
          description: 'Human-readable name, e.g. "OpenAI API Key"',
        },
        envVarName: {
          type: 'string',
          description: 'Environment variable name, e.g. "OPENAI_API_KEY"',
        },
        secretValue: {
          type: 'string',
          description: 'The secret value to encrypt and store',
        },
        description: {
          type: 'string',
          description: 'Optional notes about this secret',
        },
        autoInject: {
          type: 'boolean',
          description:
            'If true, this env var is automatically injected into every new terminal session',
        },
      },
      required: ['secretName', 'envVarName', 'secretValue'],
    },
  },
  {
    name: 'forge_vault_update',
    description:
      'Updates an existing vault entry. Only non-empty fields are changed. The entry id is required.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry ID from forge_vault_list' },
        secretName: { type: 'string', description: 'New human-readable name' },
        envVarName: { type: 'string', description: 'New env var name' },
        secretValue: { type: 'string', description: 'New secret value' },
        description: { type: 'string', description: 'New description' },
      },
      required: ['id'],
    },
  },
  {
    name: 'forge_vault_delete',
    description: 'Permanently deletes a vault entry by its id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry ID from forge_vault_list' },
      },
      required: ['id'],
    },
  },
  {
    name: 'forge_vault_toggle_autoinject',
    description:
      'Enables or disables auto-injection of a vault entry into new terminal sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry ID from forge_vault_list' },
        autoInject: {
          type: 'boolean',
          description: 'true to enable auto-inject, false to disable',
        },
      },
      required: ['id', 'autoInject'],
    },
  },
  {
    name: 'forge_vault_inject',
    description:
      'Generates a short-lived shell script that sets the specified vault entries as environment variables. Returns only the script path — run `source <scriptPath>` in the terminal to apply the variables. The script self-deletes after being sourced.',
    inputSchema: {
      type: 'object',
      properties: {
        entryIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of entry IDs to inject (from forge_vault_list)',
        },
      },
      required: ['entryIds'],
    },
  },
  {
    name: 'forge_vault_reveal',
    description:
      'Returns the decrypted plaintext value for a single vault entry. Use sparingly — every call is logged by Forge. Prefer forge_vault_inject to set env vars without exposing values.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry ID from forge_vault_list' },
      },
      required: ['id'],
    },
  },
];

// ── Tool handlers ────────────────────────────────────────────────────────────

async function callTool(name, args) {
  switch (name) {
    case 'forge_vault_status': {
      const status = await forgeGet('/api/vault/status');
      return JSON.stringify(status, null, 2);
    }

    case 'forge_vault_list': {
      const entries = await forgeGet('/api/vault/entries');
      if (!entries || entries.length === 0) {
        return 'Vault is empty — no entries stored yet.';
      }
      return JSON.stringify(entries, null, 2);
    }

    case 'forge_vault_add': {
      const entry = await forgePost('/api/vault/entries', {
        secretName: args.secretName,
        envVarName: args.envVarName,
        secretValue: args.secretValue,
        description: args.description ?? '',
        autoInject: args.autoInject ?? false,
      });
      return `Created: ${entry.secretName} (${entry.envVarName}) id=${entry.id}`;
    }

    case 'forge_vault_update': {
      const updated = await forgePut('/api/vault/entries', {
        id: args.id,
        secretName: args.secretName,
        envVarName: args.envVarName,
        secretValue: args.secretValue,
        description: args.description,
      });
      return `Updated: ${updated.secretName} (${updated.envVarName})`;
    }

    case 'forge_vault_delete': {
      await forgeDelete(`/api/vault/entries?id=${encodeURIComponent(args.id)}`);
      return `Deleted entry id=${args.id}`;
    }

    case 'forge_vault_toggle_autoinject': {
      await forgePost('/api/vault/auto-inject', {
        id: args.id,
        shouldAutoInject: args.autoInject,
      });
      return `Auto-inject ${args.autoInject ? 'enabled' : 'disabled'} for id=${args.id}`;
    }

    case 'forge_vault_inject': {
      const result = await forgePost('/api/vault/inject', {
        entryIds: args.entryIds,
      });
      return (
        `Injection script created (${result.injectedCount} variable${result.injectedCount === 1 ? '' : 's'}).\n` +
        `Run this in the terminal to apply:\n\n  source "${result.scriptPath}"\n\n` +
        `The script self-deletes after sourcing and is auto-removed after 60 seconds regardless.`
      );
    }

    case 'forge_vault_reveal': {
      const data = await forgeGet(
        `/api/vault/entries/value?id=${encodeURIComponent(args.id)}`
      );
      return `Secret value: ${data.value}`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Server bootstrap ─────────────────────────────────────────────────────────

const server = new Server(
  { name: 'forge-vault', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const text = await callTool(name, args ?? {});
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
