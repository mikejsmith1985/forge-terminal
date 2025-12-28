# Forge Terminal: Auto-Respond Industrial Refactor

## 1. Contextual Awareness (User vs. AI)
- **Problem:** Auto-respond triggers on the user's own echoed input.
- **Mandate:** Implement an `InputTracker` in `internal/terminal`. 
- **Logic:** When a key is pressed in the UI, flag that character as 'User Echo'. The Auto-Responder must ignore any bytes marked as 'User Echo'. 

## 2. Dynamic Sequence Handling (Claude-Style Multichoice)
- **Problem:** Claude Code provides 4-way choices (Tab to move, Enter to select).
- **Mandate:** Replace single-string matching with **'Sequence State Machine'**.
- **Logic:** - Define a 'Complex Prompt' as a multi-line pattern.
  - Implement 'Action Chains': Instead of just sending "yes\n", allow a chain like `[TAB, TAB, ENTER]` or `[SPACE, ENTER]`.

## 3. Heuristic Timing (Anti-Race Condition)
- **Problem:** Auto-respond fires too fast, before the TUI has finished rendering the question.
- **Implementation:** Add a `SettleTime` (200ms default). The pattern must remain stable on the screen for 200ms before the response is injected. This ensures the AI has actually finished "asking" before we "answer".

## 4. Graceful Failure & Manual Override
- **Feature:** If a user starts typing *while* an auto-respond is queued, immediately **Abort** the auto-response. User input always has P0 priority.