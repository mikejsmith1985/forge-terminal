// Command registry for Forge Terminal
import { diagnosticMode } from './diagnosticMode';

export const commands = {
  diagnose: diagnosticMode,
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
      error: `Unknown command: /${commandName}. Try /diagnose` 
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
