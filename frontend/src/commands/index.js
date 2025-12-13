// Command registry for Forge Terminal
import { diagnosticMode } from './diagnosticMode';
import { saveConversation } from './saveConversation';

// Manual refresh command as escape hatch for keyboard issues
const refreshCommand = {
  name: 'refresh',
  description: 'Force page refresh to fix keyboard input issues',
  async run({ print }) {
    print('\x1b[33mRefreshing to fix keyboard issues...\x1b[0m');
    // Clear the refresh guard so health check passes after reload
    localStorage.removeItem('forge-keyboard-refresh');
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }
};

export const commands = {
  diagnose: diagnosticMode,
  refresh: refreshCommand,
  save: saveConversation,
};

// Parse and execute slash commands
export async function executeCommand(input, context) {
  // Check if input starts with /
  if (!input.startsWith('/')) {
    return { handled: false };
  }

  // Parse command and args
  const parts = input.slice(1).trim().split(/\s+/);
  const commandName = parts[0];
  const args = parts.slice(1);

  // Find command
  const command = commands[commandName];
  if (!command) {
    return { 
      handled: true, 
      error: `Unknown command: /${commandName}. Available: /diagnose, /refresh, /save` 
    };
  }

  // Execute command
  try {
    await command.run({ args, ...context });
    return { handled: true };
  } catch (error) {
    return { 
      handled: true, 
      error: `Command error: ${error.message}` 
    };
  }
}
