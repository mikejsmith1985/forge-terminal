// Static Claude CLI command table (parsed from gist)
export const CLAUDE_CLI_COMMANDS = [
  {
    command: "claude chat",
    description: "Start a new chat session with Claude.",
    link: "https://docs.anthropic.com/claude/docs/claude-cli#chat"
  },
  {
    command: "claude complete",
    description: "Get a text completion from Claude.",
    link: "https://docs.anthropic.com/claude/docs/claude-cli#complete"
  },
  {
    command: "claude summarize",
    description: "Summarize text using Claude.",
    link: "https://docs.anthropic.com/claude/docs/claude-cli#summarize"
  },
  {
    command: "claude tools",
    description: "List available Claude tools.",
    link: "https://docs.anthropic.com/claude/docs/claude-cli#tools"
  },
  {
    command: "claude settings",
    description: "Show or update Claude CLI settings.",
    link: "https://docs.anthropic.com/claude/docs/claude-cli#settings"
  }
];

import React from 'react';

export function ClaudeCLICommandsTable() {
  return (
    <div style={{ marginTop: 24 }}>
      <h3>Claude CLI Commands</h3>
      <table className="claude-cli-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 4 }}>Command</th>
            <th style={{ textAlign: 'left', padding: 4 }}>Description</th>
            <th style={{ textAlign: 'left', padding: 4 }}>Docs</th>
          </tr>
        </thead>
        <tbody>
          {CLAUDE_CLI_COMMANDS.map((cmd) => (
            <tr key={cmd.command}>
              <td style={{ padding: 4, fontFamily: 'monospace' }}>{cmd.command}</td>
              <td style={{ padding: 4 }}>{cmd.description}</td>
              <td style={{ padding: 4 }}>
                <a href={cmd.link} target="_blank" rel="noopener noreferrer">Link</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
