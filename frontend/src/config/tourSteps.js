/**
 * tourSteps.js - Interactive Guided Tour for Forge Terminal v3.12.4
 *
 * Comprehensive interactive tour that demonstrates every feature by actually using it.
 * - Centers all text cards with arrows pointing to UI elements
 * - Opens panels and switches tabs to show features in action
 * - Uses pulsing border/glow effect to highlight elements
 *
 * Features showcased:
 * - Terminal & Tab Management
 * - Forge Assist (AI command palette)
 * - Command Cards (saved commands)
 * - File Explorer with @ mentions
 * - Web Tools (web app debugger)
 * - Monaco/Agentic Editor
 * - History Slider (time travel)
 * - Themes & Customization
 * - Keyboard Shortcuts
 * - Settings & Configuration
 */

const TOUR_STEPS = [
  // ============================================================================
  // WELCOME & INTRODUCTION
  // ============================================================================
  {
    id: 'welcome',
    selector: null, // Centered, no spotlight
    title: 'Welcome to Forge Terminal! â‰¡Æ’Ã¶Ã‘',
    content: 'A powerful terminal interface that works with any CLI tool. This interactive tour will show you all the features by actually using them. Click Next to begin!',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // TERMINAL BASICS
  // ============================================================================
  {
    id: 'terminal-intro',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Full-Featured Terminal',
    content: 'This is a real PTY terminal - you can run any command including interactive programs like vim, htop, or AI CLIs like Copilot and Claude. Supports CMD, PowerShell, Bash, and WSL.',
    placement: 'center',
    spotlight: true,
    arrow: 'down-left', // Arrow points down-left from center card to terminal
  },

  {
    id: 'shell-toggle',
    selector: '.shell-toggle',
    fallbackSelector: '.terminal-controls',
    title: 'Switch Shells Instantly',
    content: 'Click here to switch between PowerShell, CMD, Bash, or WSL without closing your session. Each shell type is color-coded for easy identification.',
    placement: 'center',
    spotlight: true,
    arrow: 'up-right', // Arrow points up-right to shell toggle
  },

  {
    id: 'tabs-intro',
    selector: '.tab-bar',
    fallbackSelector: '.tabs-container',
    title: 'Multi-Tab Workspace',
    content: 'Open up to 20 terminal tabs (Ctrl+T). Each tab remembers its shell type, theme, and working directory. Let\'s create a new tab to see it in action!',
    placement: 'center',
    spotlight: true,
    arrow: 'up',
    action: 'createNewTab', // Actually creates a tab
  },

  {
    id: 'tab-management',
    selector: '.tab-bar .tab:last-child',
    fallbackSelector: '.tab-bar',
    title: 'Tab Controls',
    content: 'Right-click any tab for options. Use Ctrl+W to close, Ctrl+Tab to cycle, or Ctrl+1-9 to jump to a specific tab number.',
    placement: 'center',
    spotlight: true,
    arrow: 'up',
    action: 'closeExtraTab', // Closes the tab we just created
  },

  // ============================================================================
  // FORGE ASSIST - AI COMMAND PALETTE
  // ============================================================================
  {
    id: 'forge-assist-button',
    selector: '.forge-assist-floating-btn',
    fallbackSelector: '.terminal-container',
    title: 'Forge Assist - AI Command Palette',
    content: 'This floating button opens Forge Assist (Ctrl+/), a context-aware command palette. You can drag it anywhere on screen! Let\'s open it now.',
    placement: 'center',
    spotlight: true,
    arrow: 'down-right',
    action: 'openForgeAssist', // Opens Forge Assist
  },

  {
    id: 'persistent-instruction-intro',
    selector: '.persistent-instruction-collapsed',
    fallbackSelector: '.forge-assist-floating-btn',
    title: 'Persistent Instructions Î“ÃœÃ­',
    content: 'Press Ctrl+I to instantly toggle persistent instructions on or off. A toast notification will show the status. Use Forge Assist (Ctrl+/) to manage your instructions.',
    placement: 'center',
    spotlight: true,
    arrow: 'down-right',
    action: 'closeForgeAssist', // Make sure Forge Assist is closed
  },

  {
    id: 'forge-assist-commands',
    selector: '.forge-assist-modal .mode-tab:first-child',
    fallbackSelector: '.forge-assist-modal',
    title: 'Commands Mode',
    content: 'In Commands mode, Forge Assist detects your active CLI (Copilot, Claude, Git, npm) and shows relevant slash commands, actions, and context variables. Use arrow keys to navigate, Enter to send.',
    placement: 'center',
    spotlight: true,
    arrow: 'down',
    requiresOpen: 'forgeAssist',
  },

  {
    id: 'forge-assist-task-mode',
    selector: '.forge-assist-modal .mode-tab:last-child',
    fallbackSelector: '.forge-assist-modal',
    title: 'Task Mode - Structured Workflow',
    content: 'Press Tab or click here to switch to Task Mode! This gives you a 5-stage workflow: Context Î“Ã¥Ã† Plan Î“Ã¥Ã† Implement Î“Ã¥Ã† Validate Î“Ã¥Ã† Deliver. Each stage provides smart suggestions.',
    placement: 'center',
    spotlight: true,
    arrow: 'down',
    action: 'switchToTaskMode', // Switches to Task mode
    requiresOpen: 'forgeAssist',
  },

  {
    id: 'forge-assist-stages',
    selector: '.stage-indicator',
    fallbackSelector: '.forge-assist-modal',
    title: 'Progress Through Stages',
    content: 'Click stage dots or use "Next Stage" to progress through your workflow. Task Mode helps structure complex projects into manageable steps.',
    placement: 'center',
    spotlight: true,
    arrow: 'down',
    action: 'closeForgeAssist', // Close it after showing
    requiresOpen: 'forgeAssist',
  },

  // ============================================================================
  // COMMAND CARDS - SAVED COMMANDS
  // ============================================================================
  {
    id: 'sidebar-cards-tab',
    selector: '.sidebar-view-tab:first-child',
    fallbackSelector: '.sidebar-view-tabs',
    title: 'Command Cards Sidebar',
    content: 'The sidebar has multiple views. The "Cards" tab shows your saved commands. Let\'s open it!',
    placement: 'center',
    spotlight: true,
    arrow: 'right',
    action: 'showCardsTab', // Switch to Cards tab
  },

  {
    id: 'command-cards',
    selector: '.command-cards-container',
    fallbackSelector: '.sidebar-content',
    title: 'Save Frequently-Used Commands',
    content: 'Create command cards for tasks you run often. Each card can have a keyboard shortcut (Ctrl+Shift+1-9), icon, and color. Click + to create your first card!',
    placement: 'center',
    spotlight: true,
    arrow: 'right',
  },

  {
    id: 'command-cards-features',
    selector: '.command-card',
    fallbackSelector: '.command-cards-container',
    title: 'Card Actions',
    content: 'Click a card to run it, hover for the play button, or click the pencil icon to edit. Drag cards to reorder them. Your cards sync across all tabs!',
    placement: 'center',
    spotlight: true,
    arrow: 'right',
  },

  // ============================================================================
  // FILE EXPLORER - LENS & @ MENTIONS
  // ============================================================================
  {
    id: 'files-tab',
    selector: '.sidebar-view-tab:nth-child(2)',
    fallbackSelector: '.sidebar-view-tabs',
    title: 'File Explorer',
    content: 'Click "Files" to open the Lens File Picker - an intelligent file browser with three views: Heatmap (recent activity), Graph (dependencies), and Search (fuzzy find).',
    placement: 'center',
    spotlight: true,
    arrow: 'right',
    action: 'showFilesTab', // Switch to Files tab
  },

  {
    id: 'file-picker-views',
    selector: '.lens-view-selector',
    fallbackSelector: '.lens-file-picker',
    title: 'Three Intelligent Views',
    content: 'â‰¡Æ’Ã¶Ã‘ Heatmap shows recently modified files. â‰¡Æ’Ã´Ã¨ Graph visualizes file dependencies. â‰¡Æ’Ã¶Ã„ Search lets you fuzzy-find any file in your project.',
    placement: 'center',
    spotlight: true,
    arrow: 'right',
    requiresOpen: 'filesTab',
  },

  {
    id: 'file-mentions',
    selector: '.lens-file-picker',
    fallbackSelector: '.sidebar-content',
    title: 'Context Building with @ Mentions',
    content: 'Select files to add them to your Context Cart. When you type @ in the terminal, you can mention these files in your AI conversations. Perfect for providing code context!',
    placement: 'center',
    spotlight: true,
    arrow: 'right',
    requiresOpen: 'filesTab',
  },

  // ============================================================================
  // WEB TOOLS - WEB APP DEBUGGER
  // ============================================================================
  {
    id: 'web-tools-tab',
    selector: '.sidebar-view-tab:nth-child(3)',
    fallbackSelector: '.sidebar-view-tabs',
    title: 'Web Tools - Debug Web Apps',
    content: 'The Web Tools tab contains the Web App Debugger - a powerful tool for debugging browser-based applications. Let\'s check it out!',
    placement: 'center',
    spotlight: true,
    arrow: 'right',
    action: 'showWebToolsTab', // Switch to Web Tools tab
  },

  {
    id: 'web-debugger',
    selector: '.web-app-debugger-card',
    fallbackSelector: '.sidebar-content',
    title: 'Record Web App Sessions',
    content: 'The Web App Debugger captures keyboard/mouse events, console logs, network requests, and screen recordings for client-side web applications. Perfect for reproducing bugs!',
    placement: 'center',
    spotlight: true,
    arrow: 'right',
    requiresOpen: 'webToolsTab',
  },

  {
    id: 'web-debugger-use-cases',
    selector: '.use-case-list',
    fallbackSelector: '.web-app-debugger-card',
    title: 'What It Debugs',
    content: 'Use it for React/Vue/Angular apps, JavaScript UI bugs, and API failures. Note: It only works for web apps - not terminal output, backend errors, or native desktop apps.',
    placement: 'center',
    spotlight: true,
    arrow: 'right',
    requiresOpen: 'webToolsTab',
  },

  // ============================================================================
  // CODE EDITORS
  // ============================================================================
  {
    id: 'file-editing',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Built-in Code Editors',
    content: 'When you open a file (e.g., from the Files tab), Forge Terminal provides two editor options: Monaco Editor (VS Code-like) and Agentic Editor (AI-powered with change proposals).',
    placement: 'center',
    spotlight: true,
    arrow: 'down',
  },

  {
    id: 'monaco-editor',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Monaco Editor',
    content: 'Monaco Editor provides syntax highlighting, IntelliSense, and multi-cursor editing. It\'s the same editor that powers VS Code!',
    placement: 'center',
    spotlight: true,
    arrow: 'down',
  },

  {
    id: 'agentic-editor',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Agentic Editor',
    content: 'Agentic Editor shows AI-proposed changes with accept/reject controls. Perfect for reviewing AI-generated code modifications before applying them.',
    placement: 'center',
    spotlight: true,
    arrow: 'down',
  },

  // ============================================================================
  // HISTORY SLIDER - TIME TRAVEL
  // ============================================================================
  {
    id: 'history-slider-button',
    selector: 'button[title*="Time Travel"]',
    fallbackSelector: '.terminal-controls',
    title: 'Time Travel - History Slider',
    content: 'Click the clock icon (or press Ctrl+Shift+H) to rewind your terminal to any point in time. Perfect for reviewing long AI responses or recovering from mistakes!',
    placement: 'center',
    spotlight: true,
    arrow: 'up-right',
    action: 'openHistorySlider', // Opens history slider
  },

  {
    id: 'history-slider-usage',
    selector: '.history-slider-container',
    fallbackSelector: '.terminal-container',
    title: 'Scrub Through History',
    content: 'Drag the slider to travel through time! Each snapshot shows your terminal exactly as it was at that moment. Close the slider to return to the present.',
    placement: 'center',
    spotlight: true,
    arrow: 'down',
    action: 'closeHistorySlider', // Closes it after showing
    requiresOpen: 'historySlider',
  },

  // ============================================================================
  // THEMES & CUSTOMIZATION
  // ============================================================================
  {
    id: 'theme-selector',
    selector: '.theme-controls button[title*="theme"]',
    fallbackSelector: '.theme-controls',
    title: '10 Beautiful Themes',
    content: 'Click the palette icon to cycle through 10 color themes including Dark (default), Molten Metal, Ocean, Forest, and 4 high-contrast accessibility themes.',
    placement: 'center',
    spotlight: true,
    arrow: 'right',
  },

  {
    id: 'per-tab-themes',
    selector: '.tab-bar .tab',
    fallbackSelector: '.tab-bar',
    title: 'Per-Tab Themes',
    content: 'Each tab can have its own theme! Great for visually organizing different projects or contexts.',
    placement: 'center',
    spotlight: true,
    arrow: 'up',
  },

  // ============================================================================
  // SETTINGS & CONFIGURATION
  // ============================================================================
  {
    id: 'settings-button',
    selector: 'button[title*="Settings"]',
    fallbackSelector: '.terminal-controls',
    title: 'Settings & Configuration',
    content: 'Click the gear icon (or press Ctrl+,) to open Settings. Let\'s explore your configuration options!',
    placement: 'center',
    spotlight: true,
    arrow: 'up-right',
    action: 'openSettings', // Opens Settings modal
  },

  {
    id: 'settings-shell-tab',
    selector: '.settings-modal .tab-item:first-child',
    fallbackSelector: '.settings-modal',
    title: 'Shell Configuration',
    content: 'The Shell tab lets you set your default shell (PowerShell, CMD, Bash, WSL), configure startup directories, and customize the working directory display.',
    placement: 'center',
    spotlight: true,
    arrow: 'down',
    requiresOpen: 'settings',
  },

  {
    id: 'settings-cli-tab',
    selector: '.settings-modal .tab-item:nth-child(2)',
    fallbackSelector: '.settings-modal',
    title: 'CLI Configuration',
    content: 'The CLI tab has options for GitHub Copilot and Claude CLI - set preferred models, trusted folders, and more, all from the UI!',
    placement: 'center',
    spotlight: true,
    arrow: 'down',
    requiresOpen: 'settings',
  },

  {
    id: 'settings-replay-tour',
    selector: '.settings-modal',
    fallbackSelector: '.modal-content',
    title: 'Replay This Tour Anytime',
    content: 'You can replay this tour anytime from the Shell tab in Settings. Now let\'s close settings and finish up!',
    placement: 'center',
    spotlight: true,
    arrow: 'down',
    action: 'closeSettings', // Close settings
    requiresOpen: 'settings',
  },

  // ============================================================================
  // KEYBOARD SHORTCUTS & POWER USER FEATURES
  // ============================================================================
  {
    id: 'keyboard-shortcuts',
    selector: null,
    title: 'Keyboard Power User Î“Ã®Â¿âˆ©â••Ã…',
    content: '**Essential Shortcuts:**\n\nÎ“Ã‡Ã³ Ctrl+T: New tab\nÎ“Ã‡Ã³ Ctrl+W: Close tab\nÎ“Ã‡Ã³ Ctrl+Tab: Cycle tabs\nÎ“Ã‡Ã³ Ctrl+1-9: Jump to tab\nÎ“Ã‡Ã³ Ctrl+F: Search terminal\nÎ“Ã‡Ã³ Ctrl+/: Forge Assist\nÎ“Ã‡Ã³ Ctrl+I: Persistent Instructions\nÎ“Ã‡Ã³ Ctrl+Shift+H: Time Travel\nÎ“Ã‡Ã³ Ctrl+Shift+1-9: Run command cards\nÎ“Ã‡Ã³ Ctrl+,: Settings',
    placement: 'center',
    spotlight: false,
  },

  {
    id: 'feedback-button',
    selector: 'button[title*="Feedback"]',
    fallbackSelector: '.terminal-controls',
    title: 'Send Feedback',
    content: 'Have ideas or found a bug? Click the feedback button to send us your thoughts! We read every submission.',
    placement: 'center',
    spotlight: true,
    arrow: 'up-right',
  },

  // ============================================================================
  // COMPLETION
  // ============================================================================
  {
    id: 'complete',
    selector: null,
    title: 'You\'re Ready to Go! â‰¡Æ’ÃœÃ‡',
    content: '**Try these next:**\n\nÎ“Ã‡Ã³ Press Ctrl+/ to open Forge Assist\nÎ“Ã‡Ã³ Press Ctrl+I to toggle Persistent Instructions\nÎ“Ã‡Ã³ Create a Command Card for your favorite command\nÎ“Ã‡Ã³ Browse files and use @ mentions\nÎ“Ã‡Ã³ Try Time Travel with Ctrl+Shift+H\nÎ“Ã‡Ã³ Customize your theme\n\nReplay this tour anytime from Settings Î“Ã¥Ã† Shell tab. Happy coding!',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

const TOUR_STORAGE_KEY = 'forge_tour_completed';
const TOUR_VERSION = '3.19.5'; // v3.12.10: Tour UX improvements, backspace fix, theme dark/light modes

export { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION };
