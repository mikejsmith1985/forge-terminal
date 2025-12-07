# AM Logging Debug Implementation Summary

## What Was Done

Implemented comprehensive debug logging for the AM (Artificial Memory) LLM conversation tracking system to diagnose why LLM conversations are not being captured.

## Changes Made

### 1. Enhanced Terminal Handler (`internal/terminal/handler.go`)

**Added:**
- Logs every command entered by the user with length
- Shows LLM detection result for every command
- Clearly indicates when LLM commands are detected vs. not detected
- Shows conversation IDs when LLM tracking starts

**Example Output:**
```
[Terminal] Command entered: 'copilot' (length: 7)
[Terminal] LLM detection result: detected=true provider=github-copilot type=chat command='copilot'
[Terminal] ✅ LLM command DETECTED: provider=github-copilot type=chat
[Terminal] ✅ Started LLM conversation: conv-1733581234567890000
```

### 2. Enhanced LLM Logger (`internal/am/llm_logger.go`)

**Added:**
- Detailed conversation start logging (tab ID, conversation ID, provider)
- File save operation logging (directory, filename, file size)
- Buffer accumulation tracking (logs every 1000 bytes)
- Output flush logging (buffer size, cleaned output size)
- Turn count tracking
- Success/failure indicators for all operations

**Example Output:**
```
[LLM Logger] Starting conversation: tabID=abc123 convID=conv-1733581234567890000 provider=github-copilot
[LLM Logger] Conversation started, saving initial state...
[LLM Logger] Saving conversation to: /home/user/project/.forge/am
[LLM Logger] Writing to file: .forge/am/llm-conv-abc123-conv-1733581234567890000.json
[LLM Logger] JSON data size: 245 bytes
[LLM Logger] ✅ Conversation saved successfully: llm-conv-abc123-conv-1733581234567890000.json
```

### 3. Documentation

**Created:**
- `AM_LOGGING_DEBUG_GUIDE.md` - Comprehensive debugging guide with:
  - System overview
  - Detailed explanation of all log messages
  - Step-by-step testing instructions
  - Troubleshooting section for common issues
  - Testing checklist
  - File locations reference

### 4. Test Scripts

**Created:**
- `test-am-logging.sh` - Automated test for AM system
- `test-llm-detection.sh` - Unit test runner for LLM detection

## How to Use

### Quick Test

1. Build Forge:
   ```bash
   make build
   ```

2. Run with logging:
   ```bash
   ./bin/forge 2>&1 | tee forge-debug.log
   ```

3. In another terminal, watch logs:
   ```bash
   tail -f forge-debug.log | grep -E "\[Terminal\]|\[LLM Logger\]"
   ```

4. In Forge, type `copilot` or `claude` and press Enter

5. Observe the logs to see:
   - If command was detected
   - If conversation was started
   - If JSON file was created
   - Any errors that occurred

### Verify Files

Check for conversation files:
```bash
ls -lh .forge/am/llm-conv-*.json
```

Inspect content:
```bash
cat .forge/am/llm-conv-*.json | jq '.'
```

## Expected Behavior

When typing `copilot` or `claude` in a tab with AM enabled:

1. ✅ Command is detected by LLM detector
2. ✅ Conversation tracking starts
3. ✅ JSON file is immediately created
4. ✅ Output accumulates in buffer
5. ✅ After 2 seconds of inactivity, output is flushed
6. ✅ Assistant turn is added to conversation
7. ✅ JSON file is updated
8. ✅ AM Monitor UI shows green "AM Active (1)"

## Debug Output Locations

All debug output goes to:
- **stdout/stderr** if running in terminal
- **forge-debug.log** if redirected with `tee`
- Browser console may also show WebSocket messages

## Known Working

✅ LLM command detection (unit tests pass)
✅ Session logging (markdown files work)
✅ API endpoint `/api/am/llm/conversations/{tabId}` responds
✅ File system has correct permissions

## Next Steps for User

1. **Run the tests** to see if LLM conversations are now being logged
2. **Check the logs** for any errors or "❌" indicators
3. **Verify JSON files** are created when running `copilot` or `claude`
4. **Report findings** including:
   - What command was typed
   - What the logs showed
   - Whether JSON files were created
   - Any error messages

## Why This Helps

Before these changes, it was unclear where the LLM logging was failing:
- Was the command being detected?
- Was the conversation starting?
- Were files being written?
- Were there permission errors?

Now, every step is logged clearly, making it easy to identify exactly where the problem occurs.

## Testing Status

- ✅ Code compiles without errors
- ✅ Unit tests pass (LLM detection)
- ✅ API endpoint works
- ⏳ End-to-end test needs real LLM commands (`copilot` or `claude`)

## Files Modified

- `internal/terminal/handler.go` - Added command input logging and detection result logging
- `internal/am/llm_logger.go` - Added verbose operation logging throughout
- `AM_LOGGING_DEBUG_GUIDE.md` - New comprehensive debugging guide
- `test-am-logging.sh` - New automated test script
- `test-llm-detection.sh` - New unit test runner

## Commit

```
feat: add comprehensive debug logging for AM LLM tracking
```

Git hash: `9fc03a9`
