/**
 * Keybinding Manager
 * Manages the 20-slot keybinding pool for command cards.
 * 
 * Pool structure:
 * - Slots 1-10: Ctrl+Shift+0 through Ctrl+Shift+9
 * - Slots 11-20: Ctrl+Alt+0 through Ctrl+Alt+9
 */

// Define the 20-slot keybinding pool in order
export const KEYBINDING_POOL = [
  // First 10: Ctrl+Shift+0-9
  'Ctrl+Shift+0',
  'Ctrl+Shift+1',
  'Ctrl+Shift+2',
  'Ctrl+Shift+3',
  'Ctrl+Shift+4',
  'Ctrl+Shift+5',
  'Ctrl+Shift+6',
  'Ctrl+Shift+7',
  'Ctrl+Shift+8',
  'Ctrl+Shift+9',
  // Next 10: Ctrl+Alt+0-9
  'Ctrl+Alt+0',
  'Ctrl+Alt+1',
  'Ctrl+Alt+2',
  'Ctrl+Alt+3',
  'Ctrl+Alt+4',
  'Ctrl+Alt+5',
  'Ctrl+Alt+6',
  'Ctrl+Alt+7',
  'Ctrl+Alt+8',
  'Ctrl+Alt+9',
];

/**
 * Get all currently assigned keybindings from commands array
 * @param {Array} commands - Array of command objects
 * @returns {Set} Set of assigned keybindings (normalized)
 */
export const getAssignedKeybindings = (commands) => {
  const assigned = new Set();
  commands.forEach(cmd => {
    if (cmd.keyBinding) {
      // Normalize the keybinding format
      const normalized = normalizeKeybinding(cmd.keyBinding);
      if (normalized) {
        assigned.add(normalized);
      }
    }
  });
  return assigned;
};

/**
 * Normalize keybinding format for comparison
 * @param {string} keybinding - Raw keybinding string
 * @returns {string|null} Normalized keybinding or null
 */
export const normalizeKeybinding = (keybinding) => {
  if (!keybinding) return null;
  // Normalize case and spacing
  return keybinding
    .trim()
    .replace(/\s+/g, '')
    .replace(/ctrl/gi, 'Ctrl')
    .replace(/shift/gi, 'Shift')
    .replace(/alt/gi, 'Alt');
};

/**
 * Find the next available keybinding from the pool
 * @param {Array} commands - Existing commands
 * @param {string|null} excludeId - Command ID to exclude (for editing)
 * @returns {string|null} Next available keybinding or null if all taken
 */
export const getNextAvailableKeybinding = (commands, excludeId = null) => {
  // Filter out the command being edited
  const activeCommands = excludeId 
    ? commands.filter(cmd => cmd.id !== excludeId)
    : commands;
  
  const assigned = getAssignedKeybindings(activeCommands);
  
  // Find first unassigned keybinding in pool
  for (const keybinding of KEYBINDING_POOL) {
    if (!assigned.has(keybinding)) {
      return keybinding;
    }
  }
  
  // All 20 slots are taken
  return null;
};

/**
 * Check if a keybinding is already assigned
 * @param {string} keybinding - Keybinding to check
 * @param {Array} commands - Existing commands
 * @param {string|null} excludeId - Command ID to exclude (for editing)
 * @returns {boolean} True if duplicate exists
 */
export const isDuplicateKeybinding = (keybinding, commands, excludeId = null) => {
  if (!keybinding) return false;
  
  const normalized = normalizeKeybinding(keybinding);
  if (!normalized) return false;
  
  const activeCommands = excludeId 
    ? commands.filter(cmd => cmd.id !== excludeId)
    : commands;
  
  const assigned = getAssignedKeybindings(activeCommands);
  return assigned.has(normalized);
};

/**
 * Check if a keybinding is in the default pool
 * @param {string} keybinding - Keybinding to check
 * @returns {boolean} True if in pool
 */
export const isInDefaultPool = (keybinding) => {
  if (!keybinding) return false;
  const normalized = normalizeKeybinding(keybinding);
  return KEYBINDING_POOL.includes(normalized);
};

/**
 * Get availability status for UI display
 * @param {Array} commands - Existing commands
 * @returns {Object} Status object with details
 */
export const getKeybindingAvailability = (commands) => {
  const assigned = getAssignedKeybindings(commands);
  const available = KEYBINDING_POOL.filter(kb => !assigned.has(kb));
  
  return {
    total: KEYBINDING_POOL.length,
    assigned: assigned.size,
    available: available.length,
    availableList: available,
    assignedList: Array.from(assigned),
    allTaken: available.length === 0,
  };
};

/**
 * Validate keybinding for saving
 * @param {string} keybinding - Keybinding to validate
 * @param {Array} commands - Existing commands
 * @param {string|null} excludeId - Command ID to exclude (for editing)
 * @returns {Object} Validation result {valid: boolean, error: string}
 */
export const validateKeybinding = (keybinding, commands, excludeId = null) => {
  // Empty keybinding is valid (will auto-assign)
  if (!keybinding || keybinding.trim() === '') {
    return { valid: true, error: null };
  }
  
  // Check for duplicates
  if (isDuplicateKeybinding(keybinding, commands, excludeId)) {
    return { 
      valid: false, 
      error: `Keybinding "${keybinding}" is already assigned to another command.`
    };
  }
  
  return { valid: true, error: null };
};

/**
 * Format keybinding for display in UI
 * @param {string} keybinding - Raw keybinding
 * @returns {string} Formatted keybinding
 */
export const formatKeybindingDisplay = (keybinding) => {
  if (!keybinding) return '';
  return normalizeKeybinding(keybinding) || keybinding;
};
