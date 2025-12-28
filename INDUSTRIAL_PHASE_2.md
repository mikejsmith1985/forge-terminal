# Forge Terminal: Industrial Phase 2 - Premium Intelligence

## 1. Multimodal "Eyes" for CLI Agents
- **Mandate:** Convert "Image Paste" from a file-saver to a Context Provider.
- **Logic:** When `internal/am/image_detector.go` detects a new image, it must trigger a background "Vision Analysis" turn using a Tier 1 model (Haiku).
- **Injection:** Store the image description in the AM turn. When the user invokes a CLI agent (Copilot/Claude), Forge must automatically prepend the last image description to the agent's input buffer.

## 2. Event-Driven Visual Snapshots (Forge Vision v2)
- **Refactor:** `internal/terminal/vision/insights.go`.
- **New Logic:** Stop scanning every line. Only snapshot the terminal state on `Non-Zero Exit Codes` or `SIGABRT`. 
- **Snapshot Content:** Capture the last 50 lines of "Cleaned" text from the new `parser_core.go` and send it for "Forensic Analysis" to Opus.

## 3. The "Time-Travel" Scrubber (UI)
- **Frontend:** Add a `HistorySlider` component to the Ribbon.
- **Backend:** Create an API endpoint `/api/am/session/:id/rewind?t=timestamp`.
- **Effect:** Scrubbing the slider should update the Monaco Editor or a "Ghost Terminal" overlay with the state of the terminal at that exact moment in history.

## 4. Model Router Activation
- **Task:** Finalize `internal/llm/router.go`.
- **Integration:** Hook the router into the `WorkflowExecutor`. If a workflow step is "Architectural," force the call to Opus 4.5. If it is "Refactor," use Sonnet. If it is "Test/Lint," use Haiku.