/**
 * Default Command Cards
 *
 * These command cards are loaded for ALL users automatically.
 * They include system utilities like the Release Manager.
 */

export const DEFAULT_COMMAND_CARDS = [
  {
    id: 'system-release-manager',
    name: 'Release Manager',
    description: 'Intelligent semantic versioning and release automation',
    category: 'system',
    isSystemCard: true,
    isReleaseManager: true,
    component: 'ReleaseManager',
    icon: 'lucide-rocket',
    colorTheme: 'orange',
    favorite: false,
    triggerAM: true,
    configurable: true,
    projectConfigKey: 'releaseManager',
    // This card doesn't have a command property - it's handled specially
  },
  {
    id: 'system-run-copilot',
    name: 'Run Copilot',
    description: 'Start the GitHub Copilot CLI assistant',
    category: 'system',
    isSystemCard: true,
    command: 'copilot',
    icon: 'lucide-bot',
    colorTheme: 'purple',
    favorite: true,
    pasteOnly: false,
    configurable: true,
    triggerAM: true,
    projectConfigKey: 'runCopilot',
    defaultCommands: [
      'copilot',
      'gh copilot suggest',
      'gh copilot explain',
    ],
  },
  {
    id: 'system-git-status',
    name: 'Git Status',
    description: 'Quick check of git repository status',
    category: 'system',
    isSystemCard: true,
    command: 'git status',
    icon: 'lucide-git-branch',
    colorTheme: 'blue',
    favorite: true,
    pasteOnly: false,
    configurable: true,
    projectConfigKey: 'gitStatus',
    defaultCommands: [
      'git status',
      'git status --short',
      'git log --oneline -5',
    ],
  },
  {
    id: 'system-build',
    name: 'Build Project',
    description: 'Build the project (frontend + backend)',
    category: 'system',
    isSystemCard: true,
    command: 'make build',
    icon: 'lucide-hammer',
    colorTheme: 'purple',
    favorite: true,
    pasteOnly: false,
    configurable: true,
    projectConfigKey: 'buildProject',
    defaultCommands: [
      'make build',
      'npm run build',
      'yarn build',
      'make build && make test',
    ],
  },
];

/**
 * Filter out system cards from user-defined cards
 * @param {array} cards - All cards
 * @returns {array} - Only user-defined cards
 */
export function getUserDefinedCards(cards) {
  return cards.filter(card => !card.isSystemCard);
}

/**
 * Merge system and user cards
 * @param {array} userCards - User-defined cards
 * @returns {array} - Combined system + user cards
 */
export function getMergedCommandCards(userCards = []) {
  const userDefined = getUserDefinedCards(userCards);
  return [...DEFAULT_COMMAND_CARDS, ...userDefined];
}

/**
 * Get system cards only
 * @returns {array} - System command cards
 */
export function getSystemCommandCards() {
  return DEFAULT_COMMAND_CARDS;
}

/**
 * Check if a card is a system card
 * @param {object} card - Card to check
 * @returns {boolean}
 */
export function isSystemCard(card) {
  return card?.isSystemCard === true;
}

/**
 * Check if a card is the Release Manager
 * @param {object} card - Card to check
 * @returns {boolean}
 */
export function isReleaseManagerCard(card) {
  return card?.isReleaseManager === true;
}
