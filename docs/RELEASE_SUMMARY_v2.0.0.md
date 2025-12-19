# Release Summary v2.0.0

## 🚀 Major Architecture Upgrade: The Invisible Backend

Forge Terminal v2.0.0 introduces a revolutionary "Invisible Backend" architecture, transforming the application from a passive TUI wrapper into a true Agentic Orchestrator.

### Key Features

*   **Agentic Backend Core**:
    *   **NEW: Agent Mode UI**: Full-screen chat tabs (`Ctrl+Shift+T`) for immersive AI collaboration.
    *   **NEW: Smart Router**: Intelligent model selection (Local vs. Copilot) for optimal performance and cost.
    *   Direct integration with Claude Code and GitHub Copilot CLI binaries.
    *   Headless execution engine that bypasses TUI scraping for 100% reliability.
    *   Structured JSON stream parsing for precise "Thinking" vs "Output" separation.

*   **Real-time Event Bus**:
    *   New internal `EventBus` system for decoupled communication between layers.
    *   WebSocket integration forwarding AI events directly to the React frontend.
    *   Support for streaming "Thinking" blocks and Tool Use requests.

*   **Stability & Performance**:
    *   **Dev Mode Fixes**: Resolved crash loops caused by unauthenticated update checks in isolated environments.
    *   **Connection Reliability**: Improved WebSocket reconnection logic and port conflict resolution.
    *   **Resource Efficiency**: AM Logging and Vision features are now **disabled by default** to respect user preference and reduce background overhead.

### Technical Improvements

*   **Refactored EventBus**: Implemented robust subscription management to prevent memory leaks.
*   **Frontend-Backend Wiring**: Complete end-to-end wiring of the Assistant stream from Go provider -> EventBus -> WebSocket -> React Hook.
*   **Isolated Dev Environment**: Enhanced `run-dev.sh` and backend logic to support fully isolated `dev-data` environments without polluting production state.

### Breaking Changes

*   **Default Settings**: Artificial Memory (AM) and Vision features are now OFF by default. Users must explicitly enable them in settings.
*   **Port Priority**: The application now prioritizes port `3005` to avoid conflicts with standard development ports.

---
*Forged with precision.*
