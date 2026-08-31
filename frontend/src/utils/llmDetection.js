/**
 * LLM Command Detection Utility
 * 
 * Detects if a terminal command should receive persistent context injection.
 * Matches the Go implementation in internal/terminal/context_manager.go
 * 
 * @module llmDetection
 */

/**
 * Checks if a command is an LLM/AI tool command that should receive context.
 * 
 * @param {string} cmd - The command string to check
 * @returns {boolean} - True if LLM command, false for shell commands
 * 
 * @example
 * isLLMCommand('copilot explain') // true
 * isLLMCommand('ls -la') // false
 * isLLMCommand('@reviewer check PR') // true
 */
export function isLLMCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') {
    return false;
  }

  // Trim whitespace and convert to lowercase for case-insensitive matching
  const trimmed = cmd.trim();
  const lower = trimmed.toLowerCase();

  // Empty command is not an LLM command
  if (lower === '') {
    return false;
  }

  // Special case: subagent invocation (@reviewer, @architect, etc.)
  if (trimmed.startsWith('@')) {
    return true;
  }

  // Check for known LLM CLI tools
  const llmPrefixes = [
    'copilot',    // GitHub Copilot CLI (bare or with args)
    'gh copilot', // GitHub CLI copilot extension
    'claude',     // Claude CLI
    'aider',      // Aider AI assistant
    'gemini',     // Gemini CLI
    'agy',        // Antigravity CLI
  ];

  for (const prefix of llmPrefixes) {
    // Check if command starts with prefix and is either exact or followed by space
    if (lower === prefix || lower.startsWith(prefix + ' ')) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts the base command from a full command line.
 * Useful for detection before full command is typed.
 * 
 * @param {string} input - Partial or complete command input
 * @returns {string} - The command portion (first word)
 * 
 * @example
 * getBaseCommand('copilot explain this code') // 'copilot'
 * getBaseCommand('ls -la /home') // 'ls'
 */
export function getBaseCommand(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const trimmed = input.trim();
  const spaceIndex = trimmed.indexOf(' ');
  
  if (spaceIndex === -1) {
    return trimmed;
  }
  
  return trimmed.substring(0, spaceIndex);
}

/**
 * Checks if input starts with an LLM command prefix.
 * Used for real-time detection as user types.
 * 
 * @param {string} input - Partial command input
 * @returns {boolean} - True if appears to be starting an LLM command
 * 
 * @example
 * startsWithLLMCommand('copi') // true (could be 'copilot')
 * startsWithLLMCommand('l') // false
 */
export function startsWithLLMCommand(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }

  const trimmed = input.trim().toLowerCase();
  
  if (trimmed === '') {
    return false;
  }

  // Check for @ prefix (subagents)
  if (trimmed.startsWith('@')) {
    return true;
  }

  // Check if input starts with any LLM prefix
  const llmPrefixes = ['copilot', 'gh copilot', 'claude', 'aider', 'gemini', 'agy'];
  
  return llmPrefixes.some(prefix => 
    prefix.startsWith(trimmed) || trimmed.startsWith(prefix)
  );
}

// Export for CommonJS compatibility (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isLLMCommand,
    getBaseCommand,
    startsWithLLMCommand,
  };
}
