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
    id: 'slm-options',
    selector: '.sidebar',
    fallbackSelector: '.terminal-container',
    title: 'Smart Routing Options 🧠',
    content: 'Two ways to enable Smart Routing: 1) Built-in SLM - Forge auto-downloads a small AI (~100MB) on first launch. 2) Ollama - If you have Ollama installed with a model like qwen2.5:0.5b, Forge uses it automatically (faster & more accurate). Check Settings → Intelligence.',
    placement: 'right',
    spotlight: true,
  },
  {
    id: 'ollama-setup',
    selector: '.sidebar',
    fallbackSelector: '.terminal-container',
    title: 'Using Ollama (Recommended) 🚀',
    content: 'For best results: Install Ollama from ollama.ai, then run "ollama pull qwen2.5:0.5b" (~400MB). Forge auto-detects Ollama and uses it for faster, more accurate task analysis. The command is in Settings → Intelligence with a copy button.',
    placement: 'right',
    spotlight: true,
  },
  {
    id: 'slm-disabled',
    selector: '.sidebar',
    fallbackSelector: '.terminal-container',
    title: 'Without Smart Routing ⚠️',
    content: 'If neither SLM nor Ollama is available: Smart Routing is DISABLED. All prompts use your default model (no optimization). You can set this up later from Settings → Intelligence.',
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
    id: 'forge-assist-button',
    selector: '.forge-assist-floating-btn',
    fallbackSelector: '.chat-view-input-area',
    title: 'Forge Assist Button 🎯',
    content: 'In Chat view, you\'ll see a floating purple button. Click it to open Forge Assist, or press Ctrl+/. You can drag this button anywhere on screen - your preferred position is saved!',
    placement: 'left',
    spotlight: true,
    onAdvance: 'ensureChatView', // Switch to chat view to show the button
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
    title: 'Lens File Picker 🔍',
    content: 'Click "Files" to open the Lens File Picker - an intelligent context builder with four views: 🔥 Heatmap (recent activity), 📐 Features (grouped by functionality), 📊 Graph (dependencies), and 🔎 Search (fuzzy find).',
    placement: 'right',
    spotlight: true,
    onAdvance: 'showFilesTab', // Switch to Files tab
  },
  {
    id: 'files-features',
    selector: '.lens-file-picker, .lens-context-cart',
    fallbackSelector: '.sidebar-content',
    title: 'Features View & Context Cart 🛒',
    content: 'The Features view automatically groups files by functionality (Auth, Chat, Terminal, etc.) - perfect for understanding feature scope! Select files to add to your Context Cart with real-time token counting (128k budget).',
    placement: 'left',
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
    content: 'Ctrl+T: New tab | Ctrl+W: Close tab | Ctrl+F: Search | Ctrl+/: Forge Assist | Ctrl+Shift+H: Time Travel | Ctrl+Shift+1-9: Command cards',
    placement: 'center',
    spotlight: false,
  },
  {
    id: 'forge-assist',
    selector: 'button[title*="Forge Assist"]',
    fallbackSelector: '.theme-controls',
    title: 'Forge Assist ⚡ (Ctrl+/)',
    content: 'Press Ctrl+/ anywhere to open Forge Assist - a context-aware command palette. It detects which CLI you\'re using (Copilot, Claude, Git, npm) and shows relevant slash commands, quick actions, and context variables.',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'complete',
    selector: null,
    fallbackPosition: 'center',
    title: 'You\'re Ready! 🚀',
    content: 'Try these features: Ctrl+/ for Forge Assist, drag the floating button in Chat view, "? your task" for Smart Routing, or browse files in the Files tab. Check Settings → Intelligence for Smart Routing setup. Replay this tour anytime from Settings → Shell.',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

const TOUR_STORAGE_KEY = 'forge_tour_completed';
const TOUR_VERSION = '3.7.2'; // v3.7.2: Draggable Forge Assist button, async image upload, light mode fixes

export { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION };
