/**
 * Unit tests for with-vault.js — the pure parsing and command-building pieces.
 */

import { describe, it, expect } from 'vitest';
import { parseCliArgs, extractScriptPath, buildWrappedCommand } from './with-vault.js';

describe('parseCliArgs', () => {
  it('splits comma-separated secret names from the command after --', () => {
    const parsed = parseCliArgs(['--secrets', 'Yahoo_app_password,Other', '--', 'python.exe', 'server.py']);
    expect(parsed).toEqual({
      secretNames: ['Yahoo_app_password', 'Other'],
      command: 'python.exe',
      commandArgs: ['server.py'],
    });
  });

  it('rejects a call with no secrets', () => {
    expect(() => parseCliArgs(['--', 'python.exe'])).toThrow(/--secrets/);
  });

  it('rejects a call with no command', () => {
    expect(() => parseCliArgs(['--secrets', 'A'])).toThrow(/command/);
  });
});

describe('extractScriptPath', () => {
  it('reads the script path line from the vault_inject response', () => {
    const text = 'Vault injection script created.\n\nInjecting secrets: ["A"]\n' +
      'Script path:       C:\\Temp\\forge-vault-1.ps1\nSource command:    . \'C:\\Temp\\forge-vault-1.ps1\'\n';
    expect(extractScriptPath(text)).toBe('C:\\Temp\\forge-vault-1.ps1');
  });

  it('surfaces the vault error text when there is no script path', () => {
    expect(() => extractScriptPath('vault entries not found: [Nope]')).toThrow(/vault entries not found/);
  });
});

describe('buildWrappedCommand', () => {
  it('on Windows, dot-sources the script then runs the command with quoted arguments', () => {
    const wrapped = buildWrappedCommand('win32', "C:\\T\\s.ps1", 'C:\\Py\\python.exe', ["C:\\it's\\srv.py"]);
    expect(wrapped.command).toBe('powershell.exe');
    const script = wrapped.args.at(-1);
    expect(script).toBe("& { . 'C:\\T\\s.ps1'; & 'C:\\Py\\python.exe' 'C:\\it''s\\srv.py'; exit $LASTEXITCODE }");
    expect(wrapped.args).toContain('-NoProfile');
  });

  it('elsewhere, sources the script and execs the command', () => {
    const wrapped = buildWrappedCommand('linux', '/tmp/s.sh', '/usr/bin/python3', ["it's.py"]);
    expect(wrapped.command).toBe('/bin/sh');
    expect(wrapped.args).toEqual(['-c', ". '/tmp/s.sh' && exec '/usr/bin/python3' 'it'\\''s.py'"]);
  });
});
