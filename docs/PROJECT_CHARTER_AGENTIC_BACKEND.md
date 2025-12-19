# Project Charter: Forge Assistant (Agentic Backend)

## 1. Vision Statement
To transform Forge Terminal from a passive TUI-monitoring tool into a high-performance Agentic Orchestrator. Forge will leverage the enterprise-grade reasoning and subscription limits of GitHub Copilot Pro+ and Claude Code while providing a custom, reliable, and recoverable React-based Assistant UI.

## 2. Problem Statement
*   **TUI Scraping Flakiness**: Capturing AI conversations by scraping ANSI terminal buffers is error-prone, performance-heavy, and visually inconsistent.
*   **Lack of Persistence**: Conversation history in standalone CLIs is often volatile or hidden in deep config files, making it hard for users to audit or recover.
*   **Context Switching**: Users must toggle between a "Chat" window and a "Terminal" window, losing the mental model of the active task.
*   **Subscription Value Gap**: Premium AI subscriptions (Copilot Pro/Claude Max) offer massive token limits that are currently trapped inside proprietary, closed-source UI wrappers.

## 3. The "Invisible Backend" Architecture
Forge will treat the Copilot and Claude CLIs as headless compute engines, orchestrated by the Go backend.

*   **Go (Backend)**: Acts as the Process Manager. It will invoke CLI binaries using "programmatic flags" (e.g., `claude --output-format stream-json` or `copilot -p`).
*   **React (Frontend)**: Acts as the Interaction Layer. It receives structured data (JSON) from Go and renders it using native React components (Markdown, Syntax Highlighting, Diff Viewers).
*   **The Bridge (WebSockets)**: Uses the existing `gorilla/websocket` infrastructure to stream AI "thinking" and "output" in real-time without blocking the main terminal thread.

## 4. Technical Strategy

### Backend Execution
| Engine | Strategy | Primary Command |
| :--- | :--- | :--- |
| **Claude Code** | Structured JSON Stream | `claude -p "..." --output-format stream-json` |
| **Copilot CLI** | Programmatic Stdout | `copilot -p "..." --allow-all-tools` |

### Key Requirements for the Agents

#### 1. Unified Provider Interface
**Path**: `internal/assistant/providers/interface.go`
Define a Go `AIProvider` interface to abstract the underlying CLI differences.

```go
package providers

import "context"

type AIProvider interface {
    // Ask sends a prompt to the provider and returns a channel of events
    Ask(ctx context.Context, prompt string, opts AskOptions) (<-chan StreamEvent, error)
    // Cancel stops the current generation
    Cancel() error
    // GetHistory returns the conversation history
    GetHistory() ([]Message, error)
}

type StreamEvent struct {
    Type    string // "thinking", "text", "tool_use", "error"
    Content string
    Meta    map[string]interface{}
}
```

#### 2. JSON Stream Parser
**Path**: `internal/assistant/parsers/claude_parser.go`
Build a robust Go parser for Claude's `stream-json` format to separate "Thinking Blocks" from "Tool Use" and "Final Response."

#### 3. Permission Intercept
**Path**: `internal/assistant/security/interceptor.go`
The Go backend must catch "Tool Use" requests (e.g., `bash_execute`) and emit a WebSocket event to the React UI for user approval before executing.

#### 4. State Recovery
**Path**: `internal/storage/conversations.go`
Store every prompt/response in a local SQLite database (or JSONL) indexed by the current Forge Tab ID.

## 5. Success Metrics
*   **Zero TUI Scraping**: 100% of the Assistant's data must come from direct process output (stdout/stderr of the CLI process), NOT from reading the terminal buffer.
*   **Reduced Latency**: Elimination of terminal buffer polling should result in <1% CPU overhead for the assistant.
*   **Full Recoverability**: Users can close the app and reopen it to find their exact AI conversation history reconstructed in the React UI.

## 6. Implementation Plan (TDD)

**CRITICAL: Testing Philosophy**
*   **GREP and CURL are NOT testing.**
*   Tests must be executed from the **User Perspective**.
*   If the user can't perform the actions the code enables, the code doesn't work.
*   **NO MOCK DATA**: Integration tests must use **REAL** CLI execution with **REAL** prompts.
*   **Copilot Model**: Use the `GPT-4.1 (0x)` model for all Copilot interactions to ensure high-quality reasoning.
*   Use Go unit tests for parsers and logic.
*   Use Live Integration tests for Providers (invoking the actual binaries).

### Phase 1: Interface & Parsers
1.  Define `AIProvider` interface.
2.  Implement `ClaudeParser` with TDD.
3.  Implement `CopilotParser` with TDD.

### Phase 2: Providers
1.  Implement `ClaudeProvider` using `os/exec`.
2.  Implement `CopilotProvider` using `os/exec`.
3.  **Verification**: Run a real prompt ("Hello, are you working?") against the installed CLIs.

### Phase 3: Integration
1.  Update `internal/assistant/core.go` to use `AIProvider`.
2.  Wire up WebSocket events for streaming.
3.  Implement Frontend components for "Thinking" and "Tool Approval".

### Phase 4: Persistence
1.  Implement `ConversationStore`.
2.  Hook into `Ask` flow to save messages.
