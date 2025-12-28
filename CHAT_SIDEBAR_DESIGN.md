# Forge Terminal: Chat Sidebar & Invisible Intelligence

## 1. The "Clean Room" Interface
- **Objective:** Provide a Chat UI that does not interact with the PTY shell until explicitly requested.
- **UI Component:** `ChatSidebar.jsx` – A sliding panel on the right side of the terminal.
- **Style:** iOS/iMessage aesthetic (Rounded bubbles, "User" on right, "Agent" on left, monospace code blocks).

## 2. Invisible Context Bridge
- **The "Whisper" Payload:** Every message sent from the Chat UI must automatically include:
  1. The last 50 lines of the active terminal buffer (stripped of ANSI).
  2. The most recent Image Summary (if a screenshot was pasted).
  3. The current project name and directory.
- **Logic:** This context is prepended to the user's prompt in the backend, so the AI "sees" what is happening without the user seeing the raw data.

## 3. Executive Mapping
- **Decision Engine:** Use the existing Model Router.
- **Routing:** - Tier 1: Routed to `gh copilot`
           - Tier 3: Routed to `claude-opus`
- **Visibility:** A small badge above the chat bubble indicates which tool is handling the request.

## 4. Platform Reliability (v3.3.0)
- **Shortcut Fix:** Use a native PowerShell wrapper to create the `.lnk` file.
- **Update Heartbeat:** Semantic version comparison with explicit UI state (Checking -> Ready -> Success).