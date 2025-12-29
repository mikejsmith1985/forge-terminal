/**
 * tourSteps.js - Guided Tour Configuration for Forge Terminal v3.6.0
 *
 * Comprehensive tour showcasing all Forge Terminal features.
 * Replaces the static splash page with an interactive guided experience.
 *
 * Features covered:
 * - Terminal & CLI integration
 * - Chat UI (Enhanced UX layer)
 * - Command Cards
 * - Tab management
 * - Themes & accessibility
 * - Time Travel
 * - File Explorer
 * - AM (Artificial Memory)
 * - Smart Model Selection with SLM (NEW v3.6.0)
 * - CLI Configuration (Copilot/Claude)
 * - Budget & Intelligence
 * - Workflows
 */

export const TOUR_STEPS = [
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
    id: 'smart-routing',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Smart Model Selection 🎯 (NEW v3.6.0)',
    content: 'Type "?" before any prompt to use Smart Routing. Forge analyzes your task intent (debug, refactor, generate, etc.) and complexity to automatically select the best model: Haiku for simple tasks, Sonnet for medium, Opus for complex architecture.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'smart-routing-example',
    selector: '.model-tier-indicator, .terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'See Real Task Analysis',
    content: 'After typing "? your prompt", watch the badge update. It shows the actual task type (🐛 debug, 🔧 refactor, etc.), complexity score (1-10), and which model is running. This is powered by real AI analysis, not just pattern matching!',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'slm-explained',
    selector: '.model-tier-indicator, .sidebar',
    fallbackSelector: '.sidebar',
    title: 'How Smart Routing Works',
    content: 'Forge uses a Small Language Model (SLM) to understand your prompt\'s intent and complexity. Green = simple/fast (Haiku), Yellow = medium (Sonnet), Red = complex (Opus). The ⚠️ icon means SLM isn\'t available - it falls back to pattern matching.',
    placement: 'right',
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
    id: 'chat-sidebar',
    selector: '.chat-sidebar, .chat-toggle-btn, .view-layer.chat-layer',
    fallbackSelector: '.terminal-container',
    title: 'Chat Interface',
    content: 'Toggle between Terminal and Chat views. The Chat view provides an enhanced UX for AI interactions while using the same CLI authentication - no API keys needed.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'command-cards',
    selector: '.command-cards-container, .commands-panel, .sidebar-content',
    fallbackSelector: '.sidebar',
    title: 'Command Cards ⚡',
    content: 'Save frequently-used commands as cards. Execute with a click or keyboard shortcuts (Ctrl+Shift+1-9). Drag to reorder, right-click to edit.',
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
    selector: '.sidebar-view-tab:nth-child(3), button:has(svg):contains("Files")',
    fallbackSelector: '.sidebar-view-tabs',
    title: 'File Explorer 📁',
    content: 'Browse and edit files directly in Forge. Click "Files" in the sidebar tabs to open the explorer. Includes a built-in Monaco editor with syntax highlighting.',
    placement: 'right',
    spotlight: true,
  },
  {
    id: 'workflows',
    selector: '.sidebar-view-tab:nth-child(2)',
    fallbackSelector: '.sidebar-view-tabs',
    title: 'Workflows 🔄',
    content: 'Chain command cards into automated workflows. Create multi-step sequences that run with a single click.',
    placement: 'right',
    spotlight: true,
  },
  {
    id: 'settings-cli',
    selector: 'button[title="Shell Settings"], .settings-btn',
    fallbackSelector: '.terminal-controls',
    title: 'CLI Configuration 🔧',
    content: 'Open Settings → CLI to configure GitHub Copilot and Claude CLI options. Set your preferred model, trusted folders, and more - all from the UI!',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'settings-budget',
    selector: 'button[title="Shell Settings"], .settings-btn',
    fallbackSelector: '.terminal-controls',
    title: 'Intelligence & Budget 💰',
    content: 'Settings → Intelligence lets you configure your monthly budget and see Smart Routing status. Forge optimizes model selection to stretch your credits with SLM-powered task analysis.',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'am-logging',
    selector: '.tab-bar .tab',
    fallbackSelector: '.terminal-pane',
    title: 'Artificial Memory (AM) 🧠',
    content: 'AM logs all terminal activity for crash recovery and legal compliance. Right-click any tab to toggle AM logging. Enable Dev Mode in Settings for advanced AM features.',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'keyboard-shortcuts',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Keyboard Power User ⌨️',
    content: 'Ctrl+T: New tab | Ctrl+W: Close tab | Ctrl+F: Search | Ctrl+Shift+H: Time Travel | Ctrl+Shift+1-9: Command cards | Type "?" to use Smart Routing',
    placement: 'center',
    spotlight: false,
  },
  {
    id: 'complete',
    selector: null,
    fallbackPosition: 'center',
    title: 'You\'re Ready! 🚀',
    content: 'Try Smart Routing with "? your task" to see AI-powered model selection in action. Explore the terminal, try the command cards, and check Settings for more options. You can replay this tour anytime from Settings → Shell tab.',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

export const TOUR_STORAGE_KEY = 'forge_tour_completed';
export const TOUR_VERSION = '3.6.0'; // Bump to trigger tour for existing users
