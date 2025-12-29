/**
 * tourSteps.js - Guided Tour Configuration for Forge Terminal v3.5.0
 *
 * Defines the tour steps for the First Run Experience.
 * Each step targets a specific CSS selector and provides content to display.
 *
 * v3.5.0: Updated to reflect both terminal and chat workflows.
 * Chat interface now uses CLI tools (copilot -p, claude -p) - no API key needed.
 */

export const TOUR_STEPS = [
  {
    id: 'welcome',
    // Step 1: Welcome and explain Forge's purpose
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Welcome to Forge Terminal',
    content: 'Forge enhances your CLI AI tools like GitHub Copilot and Claude. Use them in the terminal or through the chat sidebar - both use your existing CLI authentication.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'terminal-usage',
    // Step 2: Explain terminal usage
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Terminal Mode',
    content: 'Type "copilot" or "claude" in the terminal for interactive AI sessions. Forge automatically tracks your conversations and learns your patterns for smart model selection.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'chat-sidebar',
    // Step 3: Show the chat sidebar
    selector: '.chat-sidebar, .chat-toggle-btn',
    fallbackSelector: '.terminal-container',
    title: 'Chat Sidebar',
    content: 'Click the chat icon to open the sidebar. Ask questions directly - Forge uses your installed copilot or claude CLI behind the scenes. No separate API key needed!',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'smart-routing',
    // Step 4: Explain the smart routing
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Smart Model Selection',
    content: 'Forge analyzes your prompts to predict complexity. Over time, it learns which models work best for different tasks - saving you credits while getting better results.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'settings-budget',
    // Step 5: Point to settings for budget
    selector: '.settings-btn, [title="Settings"]',
    fallbackSelector: '.header button',
    title: 'Budget & Intelligence Settings',
    content: 'Open Settings to configure your monthly budget (credits or dollars). Enable Developer Mode to see the Smart Routing engine status and learning progress.',
    placement: 'bottom',
    spotlight: true,
  },
  {
    id: 'time-travel',
    // Step 6: Target the history slider - time travel feature
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
    content: 'Use the terminal for interactive sessions or the chat sidebar for quick questions. Forge learns from your usage to optimize model selection. Check Settings → Intelligence (Dev Mode) to see your learning progress. Happy coding!',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

export const TOUR_STORAGE_KEY = 'forge_tour_completed';
export const TOUR_VERSION = '3.5.0';
