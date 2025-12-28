# Forge Terminal: Industrial Architecture & Scaling Plan

## 1. Concurrency & Non-Blocking I/O (Anti-Freeze Mandate)
- **Mandate:** The PTY Read Loop (main thread) must NEVER wait for AM, Vision, or LLM logging.
- **Implementation:** Use Go Channels with a `select { case ch <- data: default: }` pattern. If a background worker is slow, data is dropped rather than freezing the UI.
- **Worker Pool:** Create a dedicated goroutine pool in `internal/am` for CPU-heavy tasks (ANSI stripping, JSON serialization).

## 2. Brittle Regex Replacement (The Parser Mandate)
- **Problem:** Brittle Regex in `internal/am/tui_parser.go` and `internal/llm/parser.go` causes crashes and missed data.
- **Solution:** Implement a **State-Machine Byte Parser**. 
- **Task:** Refactor parsing logic to iterate through bytes. Detect ANSI escape sequences (starting with `\x1b`) and TUI frames by state transitions, not pattern matching. 
- **Performance:** Use `sync.Pool` for `bytes.Buffer` to minimize memory allocations and GC pressure.

## 3. Intelligent Model Routing (`internal/llm/router.go`)
- **Router Logic:** Classify incoming tasks by "Token Density" and "Reasoning Depth."
- **Tier 1 (Haiku):** Regex fixes, file listing, simple shell execution.
- **Tier 2 (Sonnet):** React component updates, Go handler implementation.
- **Tier 3 (Opus):** Architectural refactors, multi-goroutine synchronization, PTY layer changes.

## 4. Event-Driven Forge Vision
- **Logic:** Vision only captures snapshots on `STDOUT_EVENT` triggers defined in `internal/terminal/vision/config.go`.
- **Cooldown:** Mandatory 5,000ms debounce between any two vision snapshots per tab.
- **Differential Storage:** Only store the diff of the terminal state to minimize disk I/O.

## 5. Automated "Vibe" & Reliability Testing
- **E2E:** Playwright tests must run in `headed` mode during dev to verify visual stability.
- **Stress Test:** Every AM change must pass a "High-Frequency Stream Test" (e.g., running `top` or `cmatrix` for 30s without a UI hang).