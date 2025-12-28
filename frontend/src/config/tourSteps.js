/**
 * tourSteps.js - Guided Tour Configuration for Forge Terminal v3.3.6
 *
 * Defines the tour steps for the First Run Experience.
 * Each step targets a specific CSS selector and provides content to display.
 *
 * CONTRACT: These selectors must exist in the UI after fixes land:
 * - .chat-sidebar (ChatSidebar.jsx)
 * - .chat-input-area (ChatSidebar.jsx) - for @ mentions
 * - .router-config-btn (for router settings)
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
    id: 'router-config',
    // Step 3: Target the router config button
    selector: '.router-config-btn',
    fallbackSelector: '.chat-header button[title*="Router"]',
    title: 'Configure Your AI Router',
    content: 'Click here to configure which AI models handle your requests. Set up GitHub Copilot, Claude, or other CLI tools for different complexity levels.',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'time-travel',
    // Step 4: Target the history slider - time travel feature
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
    content: 'Explore these features as you work. Use @ mentions for file context, configure your router for optimal AI responses, and press Ctrl+Shift+H for Time Travel. Happy coding!',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

export const TOUR_STORAGE_KEY = 'forge_tour_completed';
export const TOUR_VERSION = '3.3.6';
