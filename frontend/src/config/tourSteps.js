/**
 * tourSteps.js - Guided Tour Configuration for Forge Terminal v3.5.1
 *
 * Defines the tour steps for the First Run Experience.
 * Each step targets a specific CSS selector and provides content to display.
 *
 * v3.5.1: Chat UI is now an Enhanced UX layer for CLI tools.
 * - Analyzes prompts with Smart Routing before CLI execution
 * - Displays rich output (files, screenshots)
 * - Uses CLI authentication (copilot/claude) - no API key needed
 */

export const TOUR_STEPS = [
  {
    id: 'welcome',
    // Step 1: Welcome and explain Forge's purpose
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Welcome to Forge Terminal',
    content: 'Forge enhances your CLI AI tools like GitHub Copilot and Claude. It tracks conversations, learns your patterns, and optimizes model selection - all using your existing CLI authentication.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'terminal-usage',
    // Step 2: Explain terminal usage
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Terminal Mode',
    content: 'Type "copilot" or "claude" in the terminal for interactive AI sessions. Forge automatically tracks your conversations in the background.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'chat-sidebar',
    // Step 3: Show the chat sidebar as Enhanced UX
    selector: '.chat-sidebar, .chat-toggle-btn',
    fallbackSelector: '.terminal-container',
    title: 'Chat Interface - Enhanced UX',
    content: 'The Chat view is an enhanced UX layer for your CLI tools. It analyzes prompts with Smart Routing, then executes via copilot/claude CLI. Same authentication, richer experience.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'command-cards',
    // Step 4: Command cards in sidebar
    selector: '.command-cards-container, .commands-panel',
    fallbackSelector: '.terminal-container',
    title: 'Command Cards',
    content: 'Command cards are quick actions that execute in the active tab. They work whether you\'re viewing Chat or Terminal - both share the same session.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'smart-routing',
    // Step 5: Explain the smart routing
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Smart Model Selection',
    content: 'Before each prompt reaches the CLI, Forge analyzes complexity (1-10 scale), detects task type, and predicts which model will work best. Over time, it learns from your usage patterns.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'settings-budget',
    // Step 6: Point to settings for budget
    selector: '.settings-btn, [title="Settings"]',
    fallbackSelector: '.header button',
    title: 'Intelligence & Budget',
    content: 'Open Settings → Intelligence to configure your monthly budget and see Smart Routing status. Enable Developer Mode to view learning progress and SLM engine details.',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'time-travel',
    // Step 7: Target the history slider - time travel feature
    selector: '.history-slider-container',
    fallbackSelector: '.theme-controls button[title*="Time Travel"]',
    title: 'Time Travel',
    content: 'Drag this slider to rewind your terminal state to any point in time. Perfect for reviewing long-running AI responses or recovering from mistakes.',
    placement: 'top',
    spotlight: true,
  },
  {
    id: 'complete',
    selector: null,
    fallbackPosition: 'center',
    title: 'You\'re All Set!',
    content: 'Use Terminal for interactive sessions or Chat for enhanced UX. Both use your CLI tools - no extra configuration needed. Check Settings → Intelligence to manage your budget.',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

export const TOUR_STORAGE_KEY = 'forge_tour_completed';
export const TOUR_VERSION = '3.5.1';
