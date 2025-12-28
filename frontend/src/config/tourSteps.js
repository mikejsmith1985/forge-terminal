/**
 * tourSteps.js - Guided Tour Configuration for Forge Terminal v3.3.0
 *
 * Defines the tour steps for the First Run Experience.
 * Each step targets a specific CSS selector and provides content to display.
 *
 * CONTRACT: These selectors must exist in the UI after fixes land:
 * - .chat-container (ChatSidebar.jsx)
 * - .badge-router (ChatSidebar.jsx)
 * - .history-slider-container (HistorySlider.jsx)
 */

export const TOUR_STEPS = [
  {
    id: 'welcome',
    // Step 1: Target the chat container - the new AI command center
    selector: '.chat-container',
    fallbackSelector: '.chat-view, .terminal-container',
    title: 'Chat Evolution',
    content: 'This is your new AI command center. Ask questions, get help with code, and run commands directly from chat responses.',
    placement: 'right',
    spotlight: true,
  },
  {
    id: 'smart-router',
    // Step 2: Target the router badge - shows prompt complexity routing
    selector: '.badge-router',
    fallbackSelector: '.model-tier-indicator, .router-config-btn',
    title: 'Smart Routing',
    content: 'This badge changes based on the complexity of your prompt. Standard tasks use fast models, while Expert queries route to more capable ones automatically.',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'time-travel',
    // Step 3: Target the history slider - time travel feature
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
    content: 'Explore these features as you work. Press Ctrl+Shift+H anytime to toggle Time Travel. Happy coding!',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

export const TOUR_STORAGE_KEY = 'forge_tour_completed';
export const TOUR_VERSION = '3.3.0';
