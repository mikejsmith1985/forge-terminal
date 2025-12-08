Artificial Memory (AM) — Architecture, Implementation, Dependencies, Logging & Debugging Monitors
================================================================================

Generated: 2025-12-07T19:55:59Z
Repository: forge-terminal

Purpose
-------
This document summarizes how the AM (Artificial Memory) feature works: its scope, architecture, implementation notes, dependencies, logging approach, debugging monitors (including the release watcher), troubleshooting steps, and recommended test/check commands. It is intended for engineers and operators who need to understand, run, debug, or extend AM and its observability.

Executive summary
-----------------
- AM provides per-terminal-tab session logging, and LLM-aware conversation capture (e.g., GitHub Copilot CLI, Claude CLI) for crash recovery, audit, and restore workflows.
- Core pieces: input detection (LLM detector), terminal handler integration, output parsing (ANSI/TUI cleanup), LLM-aware logger (structured JSON), API endpoints, frontend UI hooks (AM toggle, restore card), archive & cleanup.
- Observability: detailed, timestamped logging across Terminal, Detector, LLM Logger with an "ultra-robust" mode available for forensic diagnosis.

Release watcher deprecation
---------------------------
- The release watcher has been deprecated and removed.
- AM no longer depends on release polling.

Quick commands
--------------
- Check watcher: ./watcher-status.sh
- Start watcher (temporary): ./scripts/watch-releases.sh &
- Manage systemd user service (recommended): ./watcher-manage.sh install && ./watcher-manage.sh enable
- Check AM runtime logs and LLM debug: ./bin/forge 2>&1 | tee forge-debug.log  (then tail -f forge-debug.log | grep -E "\[Terminal\]|\[LLM Logger\]")

Scope and goals
---------------
- Capture everything needed to recover a terminal-based development session after interruption.
- Provide legal-ready, structured LLM conversation logs (JSON) for audit and restore.
- Keep session logs small and short-lived (default retention: 7–10 days depending on config).
- Surface a restore workflow in the UI (Restore Session Card) that can feed past context back into an LLM CLI.

High-level architecture
-----------------------
1. Terminal Input/PTY layer (frontend/back-end WebSocket): receives raw bytes from user terminal.
2. Terminal handler (internal/terminal/handler.go): accumulates input buffer, detects newline boundaries, and invokes LLM detection.
3. LLM Detector (internal/llm/detector.go): pattern matching to identify known LLM CLI invocations (e.g., `copilot`, `claude`, `gh copilot suggest`).
4. LLM Parser (internal/llm/parser.go): cleans PTY output — strips ANSI, removes TUI frames, removes CLI footers/menus, extracts assistant text.
5. LLM Logger (internal/am/llm_logger.go): manages conversation lifecycle, buffers output, flushes turns to JSON files (.forge/am/llm-conv-{tabId}-{convId}.json), exposes in-memory map for active conversations.
6. API endpoints (cmd/forge/main.go): e.g., GET /api/am/llm/conversations/{tabId} to retrieve conversations for UI.
7. Frontend UI: AM Toggle per-tab, AM Monitor indicator, RestoreSessionCard to show interrupted sessions and provide restore action.
8. Archive & Cleanup job: moves finished sessions to `.forge/am/archive/` and cleans older than retentionDays.

Data formats
------------
- Session logs (human readable): .forge/am/session-{tabId}-{date}.md (markdown format with entries: USER_INPUT, AGENT_OUTPUT, COMMAND_EXECUTED, etc.).
- LLM conversations: structured JSON:
  - Fields: conversationId, tabId, provider, commandType, startTime, endTime, turns (array of {role, content, timestamp, provider}), complete (bool).
  - Filenames: .forge/am/llm-conv-{tabId}-{convId}.json

Dependencies
------------
- Runtime/languages: Go (>=1.19), Node.js (frontend build), bash for scripts.
- CLIs for detection and testing: GitHub Copilot CLI (copilot), Claude CLI (claude), gh (for some automation). These are required only to exercise LLM detection workflows; AM logging itself is local.
- Filesystem: `.forge/am/` directory (auto-created), write permissions required.
- For release watcher: curl, notify-send (optional), and network access to GitHub API; systemd user instance if using service mode.

Implementation notes and decisions
---------------------------------
- Detection occurs on newline-terminated input: the handler waits for newline, trims and runs the detector; if detected, StartConversation() is invoked.
- Output is buffered and flushed after a small inactivity window (default 2s) to group assistant output into coherent turns.
- Parser removes ANSI and TUI artifacts to yield clean assistant text for legal/audit purposes.
- Conversations are saved incrementally (initial state on start, subsequent assistant turns appended and re-saved) to avoid losing data mid-session.
- Logging style uses log.Printf (stderr) for consistent timestamped logs and to ensure capturing with `2>&1 | tee`.

Logging & Debugging monitors
---------------------------
- Terminal logs: prefix [Terminal]; log all input bytes, buffer state, command lines, LLM detection results.
- Detector logs: prefix [LLM Detector]; show original vs trimmed strings, lengths, hex-dump if needed, pattern match attempts and reasons for failure.
- LLM Logger logs: prefix [LLM Logger]; start/stop conversation, buffer accumulation, flush decisions (ShouldFlushOutput reasoning), file write attempts and sizes, success/failure.
- Ultra-robust mode: additional forensic logs (hex dumps, buffer snapshots, function entry/exit, state diffs) are added to make failures diagnosable without gaps.
- Watchers for release automation: scripts/watch-releases.sh (curl GitHub releases API + sync handshake docs), watcher-manage.sh (systemd user service install/enable/disable), watcher-status.sh (quick check for running process or service).

What to look for in logs (troubleshooting checklist)
----------------------------------------------------
1. Was the input received?
   - [Terminal] Received input data: N bytes (contains newline: true/false)
2. Did newline and trimming produce expected command string?
   - [Terminal] Newline detected, buffer contains: 'copilot' (before: N, after: M)
3. Did detector match pattern?
   - [LLM Detector] ✅ MATCHED copilot pattern  OR  [LLM Detector] copilot pattern DID NOT match (why: whitespace, extra chars, etc.)
4. Did StartConversation run and set active conversation?
   - [LLM Logger] Starting conversation: tabID=... convID=...   plus verification logs
5. Are buffers being fed and flushed?
   - [LLM Logger] Buffer accumulating: N bytes  and  [LLM Logger] Flushing output buffer: N bytes
6. Are JSON files created and where?
   - .forge/am/llm-conv-*.json  (check permissions, disk space)
7. If invisible logs occurred before: ensure all components log via log.Printf (stderr) to be captured together with timestamps.

Known failure modes and fixes
----------------------------
- "Not an LLM command" while typing `copilot` — cause: detector regex requires exact match; fix: inspect command hex dump and whitespace; adjust regex if different invocation (look in internal/llm/detector.go).
- JSON files not created — cause: directory missing or permission error; fix: mkdir -p .forge/am && chmod 755 .forge/am
- Logs appear split or unsynchronized — cause: some modules used fmt.Printf (stdout) while others used log.Printf (stderr); fix: unified to log.Printf (already applied in lllm_logger change).
- Buffer not flushed — cause: flush timeout too long or not triggered; fix: adjust flushTimeout in handler or ensure inactivity threshold is being measured correctly.

Release watcher (deprecated)
----------------------------
- The release watcher and handshake orchestration are deprecated and removed. AM no longer depends on release polling. This document last updated: 2025-12-07T20:24:16.018Z.

Testing and verification steps (recommended)
-------------------------------------------
1. Build: make build
2. Run Forge with debug logging: ./bin/forge 2>&1 | tee forge-debug.log
3. In another terminal watch for LLM logs: tail -f forge-debug.log | grep -E "\[Terminal\]|\[LLM Logger\]"
4. Enable AM for a tab in UI (or ensure default config has logging enabled) and type: copilot  (or claude)
5. Expected: logs showing detection, StartConversation, LLM Logger flushes and file created in .forge/am/
6. Validate API: curl http://localhost:8333/api/am/llm/conversations/{tabId}
7. Test watcher: ./watcher-status.sh (should show running if started) and view .forge/release-watcher.log for activity.

Operational recommendations
---------------------------
- Keep AM directory writable by the user running the process; document its path in settings.
- Default retention: 7 days for session logs, 10 days for LLM conversations — configurable in DEFAULT_CONFIG.
- Limit ultra-verbose forensic logging to debugging sessions; revert to info/error levels in production to limit noise and performance impact.
- Run the release watcher as a user systemd service for reliability (watcher-manage.sh install), or run scripts/watch-releases.sh in a supervisor/container.

Appendix: Where to find code & docs in this repo
-----------------------------------------------
- Detector: internal/llm/detector.go
- Parser: internal/llm/parser.go
- Terminal handler: internal/terminal/handler.go
- LLM logger: internal/am/llm_logger.go
- API: cmd/forge/main.go
- Tests and guides: AM_DEBUG_SUMMARY.md, AM_FEATURE_PLAN.md, AM_LOGGING_DEBUG_GUIDE.md, AM_LOGGING_FIX.md, LLM_LOGGING_IMPLEMENTATION.md, TEST_AM_LOGGING.md, USER_GUIDE_LLM_LOGGING.md, ULTRA_ROBUST_LOGGING_REPORT.md
- Watcher scripts: scripts/watch-releases.sh, watcher-status.sh, watcher-manage.sh, scripts/forge-release-watcher.service

If the release watcher needs immediate start
-------------------------------------------
- Quick (ephemeral): ./scripts/watch-releases.sh &
- Persistent (recommended): ./watcher-manage.sh install  (then watcher-manage.sh enable or use systemctl --user commands)
- Validate: ./watcher-status.sh  (should report RUNNING or show systemd service status)

Contact points & next steps
---------------------------
- If you want me to: (pick one)
  1) Install/enable the systemd user service for the watcher and verify it's running, or
  2) Add a small README or troubleshooting snippet to README.md with start/enable instructions, or
  3) Run an end-to-end test with Copilot/Claude (requires those CLIs installed in this environment).

End of document
