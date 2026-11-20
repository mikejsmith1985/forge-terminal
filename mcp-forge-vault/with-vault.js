#!/usr/bin/env node
/**
 * with-vault.js — starts another program (usually an MCP server) with Forge Vault secrets in its environment.
 *
 * Usage, e.g. in claude_desktop_config.json:
 *   node with-vault.js --secrets Yahoo_app_password -- python.exe yahoo_imap_mcp.py
 *
 * Why custom: Claude Desktop can only pass secrets to a server as plaintext
 * "env" entries in its config file. This asks Forge's vault_inject for a
 * self-deleting script instead, so the secret never sits in a config file and
 * never passes through this process's own code — only the child shell sees it.
 * On Windows, environment names ignore case, so the vault entry
 * "Yahoo_app_password" satisfies a program reading YAHOO_APP_PASSWORD.
 */

import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { connectToForge } from './forge-client.js';

const SECRETS_FLAG = '--secrets';
const COMMAND_SEPARATOR = '--';

/** Parses `--secrets A,B -- command args...` into its parts. */
export function parseCliArgs(argv) {
  const separatorIndex = argv.indexOf(COMMAND_SEPARATOR);
  const optionArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const commandParts = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);

  const secretsIndex = optionArgs.indexOf(SECRETS_FLAG);
  const secretNames = secretsIndex === -1 ? [] : (optionArgs[secretsIndex + 1] ?? '')
    .split(',').map((name) => name.trim()).filter(Boolean);

  if (secretNames.length === 0) throw new Error('Pass the vault entry names with --secrets NAME[,NAME...]');
  if (commandParts.length === 0) throw new Error('Pass the command to run after --');
  return { secretNames, command: commandParts[0], commandArgs: commandParts.slice(1) };
}

/** Pulls the script path out of vault_inject's text reply, or throws its error text. */
export function extractScriptPath(responseText) {
  const match = /^Script path:\s*(.+)$/m.exec(responseText);
  if (!match) throw new Error(`Forge Vault refused the injection: ${responseText.trim()}`);
  return match[1].trim();
}

function quoteForPowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteForPosixShell(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Builds the shell invocation that loads the secrets, then runs the command. */
export function buildWrappedCommand(platform, scriptPath, command, commandArgs) {
  if (platform === 'win32') {
    const invocation = [command, ...commandArgs].map(quoteForPowerShell).join(' ');
    const body = `& { . ${quoteForPowerShell(scriptPath)}; & ${invocation}; exit $LASTEXITCODE }`;
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', body],
    };
  }
  const invocation = [command, ...commandArgs].map(quoteForPosixShell).join(' ');
  return { command: '/bin/sh', args: ['-c', `. ${quoteForPosixShell(scriptPath)} && exec ${invocation}`] };
}

/** Asks Forge for an injection script holding the named secrets. */
async function requestInjectionScript(secretNames) {
  const client = await connectToForge();
  try {
    const result = await client.callTool({ name: 'vault_inject', arguments: { secret_names: secretNames } });
    const responseText = (result.content ?? []).map((part) => part.text ?? '').join('\n');
    if (result.isError) throw new Error(`Forge Vault refused the injection: ${responseText.trim()}`);
    return extractScriptPath(responseText);
  } finally {
    await client.close().catch(() => {});
  }
}

async function main() {
  const { secretNames, command, commandArgs } = parseCliArgs(process.argv.slice(2));
  const scriptPath = await requestInjectionScript(secretNames);
  const wrapped = buildWrappedCommand(process.platform, scriptPath, command, commandArgs);

  // stdin/stdout pass straight through, so the child speaks MCP to Claude directly.
  const child = spawn(wrapped.command, wrapped.args, { stdio: 'inherit', windowsHide: true });
  child.on('error', (spawnError) => {
    process.stderr.write(`[with-vault] Could not start ${command}: ${spawnError.message}\n`);
    process.exit(1);
  });
  child.on('exit', (exitCode) => process.exit(exitCode ?? 1));
}

const isRunDirectly = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isRunDirectly) {
  main().catch((err) => {
    process.stderr.write(`[with-vault] Fatal: ${err.message}\n`);
    process.exit(1);
  });
}
