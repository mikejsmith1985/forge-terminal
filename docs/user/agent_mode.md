# Forge Agent Mode

Forge Terminal v2.1.0 introduces **Agent Mode**, a new way to interact with your AI assistant. Instead of a traditional terminal, Agent Mode provides a full-screen chat interface where you can collaborate with the AI to perform tasks.

## Features

*   **Full-Screen Chat**: A dedicated workspace for AI interaction, free from terminal clutter.
*   **Invisible Router**: Automatically selects the best AI model for your task. Simple queries are handled locally (fast!), while complex tasks are routed to GitHub Copilot (powerful!).
*   **Copilot Integration**: Direct access to GitHub Copilot's unlimited models for heavy lifting.
*   **Seamless Switching**: Create Agent tabs alongside your regular terminal tabs.

## How to Use

### Opening an Agent Tab

1.  **Keyboard Shortcut**: Press `Ctrl+Shift+T` to open a new Agent tab instantly.
2.  **UI Button**: Click the purple **Agent (+)** button in the tab bar, next to the standard New Tab button.

### Interacting with the Agent

*   **Type your request**: "Fix the bug in main.go", "Explain this error", "Git status".
*   **Let the Agent work**: The Agent will analyze your request, choose the right tool, and execute commands or provide answers.
*   **Review**: See the Agent's "Thinking" process and approve/deny tool execution requests (if configured).

## Configuration

Agent Mode uses the **Copilot Provider** by default for complex queries. Ensure you have the GitHub Copilot CLI installed and authenticated.

*   **Model Selection**: The router automatically picks the most economical model.
    *   Supports specific model targeting (e.g., `copilot-opus`, `copilot-haiku`) via the backend CLI.
*   **Local Fallback**: If Copilot is unavailable, the system falls back to the local Ollama model.

## Tips

*   Use Agent Mode for complex refactoring or debugging sessions where you need a "pair programmer" experience.
*   Keep a standard terminal tab open for quick manual commands.
*   Use `Ctrl+Tab` to switch between your Agent and Terminal tabs.
