/**
 * tourSteps.js - Guided Tour Configuration for Forge Terminal v3.5.0
 *
 * Defines the tour steps for the First Run Experience.
 * Each step targets a specific CSS selector and provides content to display.
 *
 * v3.5.0: Updated to reflect terminal-first workflow.
 * The Smart Routing works through CLI tools (copilot, claude) in the terminal.
 * Chat interface is experimental (Dev Mode only).
 */

export const TOUR_STEPS = [
  {
    id: 'welcome',
    // Step 1: Welcome and explain Forge's purpose
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Welcome to Forge Terminal',
    content: 'Forge enhances your CLI AI tools like GitHub Copilot and Claude. Just use them normally in the terminal - Forge tracks your sessions, learns your patterns, and helps optimize model selection.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'llm-tools',
    // Step 2: Explain how to use LLM tools
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Using AI Tools',
    content: 'Type "copilot" or "claude" in the terminal to start an AI session. Forge automatically detects when you\'re using these tools and begins tracking the conversation for smart features.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'smart-routing',
    // Step 3: Explain the smart routing
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Smart Model Selection',
    content: 'Forge analyzes your prompts to predict complexity. Over time, it learns which models work best for different tasks - saving you credits while getting better results.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'settings-budget',
    // Step 4: Point to settings for budget
    selector: '.settings-btn, [title="Settings"]',
    fallbackSelector: '.header button',
    title: 'Budget & Intelligence Settings',
    content: 'Open Settings to configure your monthly budget (credits or dollars). In Developer Mode, you can also see the Smart Routing engine status and learning progress.',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'time-travel',
    // Step 5: Target the history slider - time travel feature
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
    content: 'Start using Copilot or Claude in the terminal. Forge will learn your patterns and optimize model selection automatically. Check Settings → Intelligence (Dev Mode) to see your learning progress. Happy coding!',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

export const TOUR_STORAGE_KEY = 'forge_tour_completed';
export const TOUR_VERSION = '3.5.0';
