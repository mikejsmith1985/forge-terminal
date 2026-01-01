/**
 * tourSteps.js - Guided Tour Configuration for Forge Terminal v3.9.0
 *
 * Comprehensive tour showcasing all Forge Terminal features.
 * Replaces the static splash page with an interactive guided experience.
 *
 * Features covered:
 * - Terminal & CLI integration
 * - Command Cards
 * - Tab management
 * - Themes & accessibility
 * - Time Travel
 * - File Explorer (Lens)
 * - AM (Artificial Memory)
 * - Smart Model Selection with SLM
 * - CLI Configuration (Copilot/Claude)
 * - Budget & Intelligence
 * 
 * v3.9.0: Workflows REMOVED, Forge Assist enhanced with Task Mode + SLM
 * v3.8.2: ChatView and NotebookLayout removed - Terminal is the only view
 */

const TOUR_STEPS = [
  {
    id: 'welcome',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Welcome to Forge Terminal! 🔥',
    content: 'A powerful terminal that enhances GitHub Copilot CLI and Claude CLI with intelligent features. Let\'s take a quick tour of what you can do.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'terminal',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Full PTY Terminal',
    content: 'Run any command including interactive apps like vim, htop, and of course "copilot" or "claude" for AI assistance. Supports CMD, PowerShell, and WSL on Windows.',
    placement: 'left',
    spotlight: true,
  },

  {
    id: 'tabs',
    selector: '.tab-bar',
    fallbackSelector: '.terminal-pane',
    title: 'Multi-Tab Support',
    content: 'Open up to 20 tabs with Ctrl+T. Each tab remembers its shell, theme, and working directory. Right-click tabs for more options like AM logging and Auto-Respond.',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'forge-assist-button',
    selector: '.forge-assist-floating-btn',
    fallbackSelector: '.terminal-container',
    title: 'Forge Assist Button 🎯',
    content: 'Press Ctrl+/ to open Forge Assist - a context-aware command palette. You can also click the floating purple button and drag it anywhere on screen!',
    placement: 'left',
    spotlight: true,
    action: 'openForgeAssist', // Opens Forge Assist modal
  },
  {
    id: 'forge-assist-commands',
    selector: '.forge-assist-modal',
    fallbackSelector: '.forge-assist-overlay',
    title: 'Forge Assist - Commands Mode 📋',
    content: 'In Commands mode, Forge Assist detects which CLI you\'re using (Copilot, Claude, Git, npm) and shows relevant slash commands, quick actions, and context variables. Use arrow keys to navigate and Enter to send.',
    placement: 'right',
    spotlight: true,
    requiresOpen: 'forgeAssist',
  },
  {
    id: 'forge-assist-task',
    selector: '.forge-assist-modal',
    fallbackSelector: '.forge-assist-overlay',
    title: 'Forge Assist - Task Mode 🎯 (NEW v3.9.0)',
    content: 'Press Tab to switch to Task Mode! This gives you a 5-stage workflow: Context → Plan → Implement → Validate → Deliver. Each stage has smart command suggestions. Click the stage dots or use "Next Stage" to progress.',
    placement: 'right',
    spotlight: true,
    action: 'switchToTaskMode', // Switches Forge Assist to Task mode
    requiresOpen: 'forgeAssist',
  },

  {
    id: 'command-cards',
    selector: '.command-cards-container, .commands-panel, .sidebar-content',
    fallbackSelector: '.sidebar',
    title: 'Command Cards ⚡',
    content: 'Save frequently-used commands as cards. Execute with a click or keyboard shortcuts (Ctrl+Shift+1-9). Drag to reorder, click the pencil icon to edit.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'themes',
    selector: '.theme-controls',
    fallbackSelector: '.sidebar-header',
    title: '10 Color Themes 🎨',
    content: 'Click the palette icon to cycle through themes including Molten Metal, Ocean, Forest, and 4 high-contrast accessibility themes. Each tab can have its own theme!',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'time-travel',
    selector: '.history-slider-container, button[title*="Time Travel"]',
    fallbackSelector: '.theme-controls',
    title: 'Time Travel ⏰',
    content: 'Rewind your terminal to any point in time with Ctrl+Shift+H. Perfect for reviewing long AI responses or recovering from mistakes.',
    placement: 'top',
    spotlight: true,
  },
  {
    id: 'files',
    selector: '.sidebar-view-tab:nth-child(2)',
    fallbackSelector: '.sidebar-view-tabs',
    title: 'Lens File Picker 🔍',
    content: 'Click "Files" to open the Lens File Picker - an intelligent context builder with four views: 🔥 Heatmap (recent activity), 🎯 Features (AI-powered code analysis - NEW v3.9.2!), 📊 Graph (dependencies), and 🔎 Search (fuzzy find).',
    placement: 'right',
    spotlight: true,
    action: 'showFilesTab', // Switch to Files tab
  },
  {
    id: 'files-features',
    selector: '.lens-file-picker, .lens-context-cart',
    fallbackSelector: '.sidebar-content',
    title: 'Features View & Context Cart 🛒',
    content: 'The Features view uses AI-powered code analysis to automatically group files by functionality. Forge scans your codebase and discovers features with their capabilities and API endpoints - perfect for understanding ANY project! Select files to add to your Context Cart with real-time token counting (128k budget).',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'settings-open',
    selector: 'button[title="Shell Settings"], .settings-btn',
    fallbackSelector: '.terminal-controls',
    title: 'Settings ⚙️',
    content: 'Let\'s open Settings to see all configuration options. Click the gear icon or use Ctrl+,',
    placement: 'bottom',
    spotlight: true,
    action: 'openSettings', // Opens Settings modal
  },

  {
    id: 'settings-cli',
    selector: '.settings-modal, .modal-content',
    fallbackSelector: '.modal-overlay',
    title: 'CLI Configuration 🔧',
    content: 'The CLI tab lets you configure GitHub Copilot and Claude CLI options. Set your preferred model, trusted folders, and more - all from the UI! Close settings when done.',
    placement: 'right',
    spotlight: true,
    requiresOpen: 'settings',
    action: 'closeSettings', // Close settings after
  },
  {
    id: 'am-logging',
    selector: '.tab-bar .tab',
    fallbackSelector: '.terminal-pane',
    title: 'Artificial Memory (AM) 🧠',
    content: 'AM logs all terminal activity for crash recovery and analysis. Right-click any tab to toggle AM logging. Enable Dev Mode in Settings for advanced AM features.',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'keyboard-shortcuts',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Keyboard Power User ⌨️',
    content: 'Ctrl+T: New tab | Ctrl+W: Close tab | Ctrl+F: Search | Ctrl+/: Forge Assist | Ctrl+Shift+H: Time Travel | Ctrl+Shift+1-9: Command cards',
    placement: 'center',
    spotlight: false,
  },
  {
    id: 'complete',
    selector: null,
    fallbackPosition: 'center',
    title: 'You\'re Ready! 🚀',
    content: 'Try these features: Ctrl+/ for Forge Assist (Tab for Task Mode!), browse files in the Files tab with the new Features view, or right-click tabs for AM logging. Replay this tour anytime from Settings → Shell.',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

const TOUR_STORAGE_KEY = 'forge_tour_completed';
const TOUR_VERSION = '3.9.2'; // v3.9.2: Dynamic feature mapping with AI-powered code analysis

export { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION };

