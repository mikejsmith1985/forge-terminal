/**
 * tourSteps.js - Guided Tour Configuration for Forge Terminal v3.4.0
 *
 * Defines the tour steps for the First Run Experience.
 * Each step targets a specific CSS selector and provides content to display.
 * Steps can also trigger actions like opening modals.
 *
 * CONTRACT: These selectors must exist in the UI after fixes land:
 * - .chat-sidebar (ChatSidebar.jsx)
 * - .chat-input-area (ChatSidebar.jsx) - for @ mentions
 * - .router-config-btn (for router settings)
 * - .router-config-modal (RouterConfigOverlay.jsx)
 * - .history-slider-container (HistorySlider.jsx)
 */

export const TOUR_STEPS = [
  {
    id: 'welcome',
    // Step 1: Target the chat sidebar - the new AI command center
    selector: '.chat-sidebar',
    fallbackSelector: '.chat-view, .terminal-container',
    title: 'Chat Evolution',
    content: 'This is your new AI command center. Ask questions, get help with code, and run commands directly from chat responses.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'at-mentions',
    // Step 2: Target the chat input - show @ mention feature
    selector: '.chat-input-area',
    fallbackSelector: '.chat-input',
    title: 'Deep Context with @ Mentions',
    content: 'Type @ followed by a file path (like @src/main.go) to include file contents in your message. The AI will read and understand your code!',
    placement: 'top',
    spotlight: true,
  },
  {
    id: 'router-config-btn',
    // Step 3: Target the router config button and prepare to open it
    selector: '.router-config-btn',
    fallbackSelector: '.chat-header button[title*="Router"]',
    title: 'Configure Your AI Providers',
    content: 'Click here to connect to AI providers like GitHub Copilot and Claude. Let\'s open it and see how to set it up!',
    placement: 'bottom',
    spotlight: true,
    // Action to trigger when advancing to the next step
    onAdvance: 'openRouterConfig',
  },
  {
    id: 'router-config-modal',
    // Step 4: Show the router config modal (opened by previous step)
    selector: '.router-config-modal-v2',
    fallbackSelector: '.router-config-modal',
    title: 'Provider Connection',
    content: 'Here you can connect to GitHub Copilot and Claude. The system automatically checks if CLI tools are installed and authenticated. Click a provider to see setup instructions or enter an API key.',
    placement: 'right',
    spotlight: true,
    // Keep the modal open during this step
    requiresModalOpen: 'routerConfig',
  },
  {
    id: 'tier-config',
    // Step 5: Explain tier configuration
    selector: '.tiers-grid',
    fallbackSelector: '.tier-card',
    title: 'Tier Configuration',
    content: 'Assign different AI models to different complexity levels. Use a fast model for quick tasks (Tier 1) and a powerful model for complex architecture (Tier 3). The router automatically selects the right tier based on your prompt!',
    placement: 'left',
    spotlight: true,
    requiresModalOpen: 'routerConfig',
    // Close modal when advancing
    onAdvance: 'closeRouterConfig',
  },
  {
    id: 'interactive-tui',
    // Step 6: Explain the interactive TUI feature
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Smart Terminal Switching',
    content: 'When Claude or Copilot shows an interactive prompt (like multi-question wizards with Tab navigation), the app automatically switches from Chat to Terminal view so you can respond directly. You can switch back to Chat anytime using the toggle button.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'time-travel',
    // Step 7: Target the history slider - time travel feature
    selector: '.history-slider-container',
    fallbackSelector: '.theme-controls button[title*="Time Travel"]',
    title: 'Time Travel',
    content: 'Drag this slider to rewind your terminal state to any point in time. Perfect for reviewing long-running commands or recovering from mistakes.',
    placement: 'top',
    spotlight: true,
  },
  {
    id: 'complete',
    selector: null,
    fallbackPosition: 'center',
    title: 'You\'re All Set!',
    content: 'Explore these features as you work. Use @ mentions for file context, configure your AI providers, and enjoy automatic terminal switching for interactive prompts. Press Ctrl+Shift+H for Time Travel. Happy coding!',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

export const TOUR_STORAGE_KEY = 'forge_tour_completed';
export const TOUR_VERSION = '3.4.0';
