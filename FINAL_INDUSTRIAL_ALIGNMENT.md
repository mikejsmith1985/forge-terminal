# Forge Terminal: Final Industrial Alignment (v3.2.0)

## 1. Echo Handshake Enforcement
- **Objective:** Fix the empty `echo_buffer.go` to prevent self-triggering.
- **Logic:** - Implement a thread-safe `EchoQueue` in `echo_buffer.go`.
  - Hook `TerminalHandler.Write()` to push bytes into this queue.
  - Hook `TerminalHandler.Read()` loop to cross-reference incoming PTY data against the `EchoQueue` and discard matches.

## 2. Dynamic Multimodal Injection
- **Objective:** Finalize the "Optical Nerve" bridge.
- **Logic:** Ensure the `?` trigger logic in `executive_trigger.go` checks for the latest `ImageSummary`. If present, it must be automatically prepended to the final shell command.

## 3. Tool Reliability Test
- **Objective:** Verify multi-tool support.
- **Mandate:** Test with `aider`, `gh copilot`, and `claude`. Ensure forking these through the PTY doesn't result in double-input or hanging states.