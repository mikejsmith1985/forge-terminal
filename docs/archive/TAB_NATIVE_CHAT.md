# Forge Terminal: Tab-Native Chat Architecture

## 1. Unified Tab State
- **Logic:** Each `Tab` object in the frontend now has a `mode` field: `"chat" | "terminal"`.
- **Default:** New tabs always initialize in `"chat"` mode.
- **UI:** The main viewing area renders either the `ChatSidebar` (full width) or the `XtermTerminal`.

## 2. Shared Intelligence context
- **State Store:** Both modes share the same snapshot buffer.
- **Verification:** Chat mode can query the terminal's "Clean Buffer" to answer questions about errors that occurred in terminal mode.

## 3. The "Ghost Driver" (Execution Bridge)
- **Feature:** AI code suggestions in Chat mode have a "Run in Terminal" button.
- **Action:** Clicking "Run" switches the tab mode to `"terminal"` and injects the code directly into the PTY.

## 4. Smart Router Configuration UI
- **Placement:** Add a "Brain" icon (🧠) in the top-right corner of the Chat Tab.
- **Function:** Clicking this opens a small, elegant overlay or sidebar specifically for editing the `forge.toml` mappings.
- **Fields:** - **Tier 1 (Free):** Dropdown to select model or input for custom CLI command (e.g., gh copilot).
  - **Tier 2 (Standard):** Mapping for standard tasks.
  - **Tier 3 (High Reasoning):** Mapping for complex tasks (e.g., Claude Opus).
- **Validation:** Include a "Test" button next to each tier that runs the command in a background shell to verify it works before saving.

## 5. Temporal Synchronization (Time Travel + Chat)
- **Background Persistence:** The PTY and AM Snapshot system continue to run regardless of `viewMode`. 
- **State Consistency:** Switching from Chat to Terminal must land the user at the 'Live' tip of the terminal buffer. 
- **Contextual Rewind:** If a user is at a specific point in the History Slider, the Chat UI should offer a 'Chat about this point in time' button, allowing the AI to analyze historical states.