# AM Logging Debugging Guide

## Overview

The AM (Artificial Memory) system has two logging components:
1. **Session Logging** - Tracks terminal activity (working ✅)
2. **LLM Conversation Logging** - Tracks `copilot` and `claude` command interactions (needs testing)

## Debug Logging Added

### What Was Changed

Added comprehensive debug logging to trace LLM command detection and conversation tracking:

#### 1. Terminal Handler (`internal/terminal/handler.go`)
- **Logs all commands** entered in the terminal
- **Shows LLM detection results** for every command
- **Indicates when LLM conversations start** with conversation ID

Example output:
```
[Terminal] Command entered: 'copilot' (length: 7)
[Terminal] LLM detection result: detected=true provider=github-copilot type=chat command='copilot'
[Terminal] ✅ LLM command DETECTED: provider=github-copilot type=chat
[Terminal] ✅ Started LLM conversation: conv-1733581234567890000
```

#### 2. LLM Logger (`internal/am/llm_logger.go`)
- **Conversation start** - Shows when conversation begins
- **File saving** - Shows when JSON files are written to disk
- **Buffer accumulation** - Shows every 1000 bytes of output collected
- **Output flushing** - Shows when accumulated output is processed
- **Turn tracking** - Shows number of conversation turns

Example output:
```
[LLM Logger] Starting conversation: tabID=abc123 convID=conv-1733581234567890000 provider=github-copilot
[LLM Logger] Conversation started, saving initial state...
[LLM Logger] Saving conversation to: /path/to/.forge/am
[LLM Logger] Writing to file: /path/to/.forge/am/llm-conv-abc123-conv-1733581234567890000.json
[LLM Logger] JSON data size: 245 bytes
[LLM Logger] ✅ Conversation saved successfully: llm-conv-abc123-conv-1733581234567890000.json
[LLM Logger] Initial conversation saved
```

## How to Test

### Step 1: Build with Debug Logging

```bash
make build
```

### Step 2: Run Forge and Monitor Logs

```bash
# Run in terminal
./bin/forge 2>&1 | tee forge-debug.log

# In another terminal, watch the log file
tail -f forge-debug.log | grep -E "\[Terminal\]|\[LLM Logger\]"
```

### Step 3: Test LLM Commands

In the Forge Terminal tab, type:
```bash
copilot
```

Or:
```bash
claude
```

### Step 4: Check the Logs

Look for these indicators:

**✅ SUCCESS - LLM Command Detected:**
```
[Terminal] Command entered: 'copilot' (length: 7)
[Terminal] ✅ LLM command DETECTED: provider=github-copilot type=chat
[Terminal] ✅ Started LLM conversation: conv-1733581234567890000
[LLM Logger] ✅ Conversation saved successfully
```

**❌ FAILURE - Command Not Detected:**
```
[Terminal] Command entered: 'copilot' (length: 7)
[Terminal] ❌ Not an LLM command: 'copilot'
```

### Step 5: Verify Files Created

Check for JSON conversation files:
```bash
ls -lh .forge/am/llm-conv-*.json
```

Each conversation should create a file like:
```
.forge/am/llm-conv-[tabID]-conv-[timestamp].json
```

### Step 6: Inspect JSON Content

```bash
cat .forge/am/llm-conv-*.json | jq '.'
```

Expected structure:
```json
{
  "conversationId": "conv-1733581234567890000",
  "tabId": "tab-1-abc123",
  "provider": "github-copilot",
  "commandType": "chat",
  "startTime": "2025-12-07T18:30:00Z",
  "endTime": "",
  "turns": [
    {
      "role": "user",
      "content": "",
      "timestamp": "2025-12-07T18:30:00Z",
      "provider": "github-copilot"
    }
  ],
  "complete": false
}
```

### Step 7: Check the AM Monitor in UI

The AM Monitor component should show:
- **Green "AM Active (N)"** when LLM conversations are logged
- **Red "No LLM Activity"** when no conversations are found

## Troubleshooting

### Problem: "❌ Not an LLM command" appears for `copilot` or `claude`

**Cause:** The command detection regex might not be matching

**Debug Steps:**
1. Check the exact command being sent (look at the log)
2. Check for extra whitespace or special characters
3. Verify the regex patterns in `internal/llm/detector.go`:
   - `copilotPattern = regexp.MustCompile('^copilot\\s*$')`
   - `claudePattern = regexp.MustCompile('^claude\\s*$')`

**Fix:** The patterns require exact matches. If your shell is sending extra characters, update the patterns.

### Problem: LLM command detected but no JSON files created

**Cause:** File write permissions or directory issues

**Debug Steps:**
1. Look for "[LLM Logger] ❌ Failed to create AM dir" or "Failed to write conversation"
2. Check directory permissions:
   ```bash
   ls -la .forge/am/
   ```
3. Manually test file creation:
   ```bash
   touch .forge/am/test-file.json
   ```

**Fix:** Ensure `.forge/am/` directory exists and is writable:
```bash
mkdir -p .forge/am
chmod 755 .forge/am
```

### Problem: JSON files created but count shows 0 in UI

**Cause:** Frontend API call might be failing or using wrong tab ID

**Debug Steps:**
1. Check the browser console for errors
2. Test the API directly:
   ```bash
   curl http://localhost:8333/api/am/llm/conversations/[your-tab-id]
   ```
3. Check the tab ID in the JSON filename matches the UI's tab ID

**Fix:** Ensure tab IDs are consistent between WebSocket session and file naming.

### Problem: Buffer accumulation but no flushing

**Cause:** The flush timeout (2 seconds of inactivity) might not be triggering

**Debug Steps:**
1. Look for "[LLM Logger] Buffer size: N bytes" messages
2. Check if FlushOutput is being called
3. Verify the inactivity timeout is appropriate for your LLM tool

**Fix:** Adjust `flushTimeout` in `internal/terminal/handler.go` (currently 2 seconds).

## Testing Checklist

- [ ] Build completes without errors
- [ ] Forge starts and shows "🔥 Forge Terminal starting"
- [ ] Typing any command shows "[Terminal] Command entered: ..."
- [ ] Typing `copilot` shows "[Terminal] ✅ LLM command DETECTED"
- [ ] LLM conversation start shows "[LLM Logger] Starting conversation"
- [ ] JSON file is created in `.forge/am/llm-conv-*.json`
- [ ] JSON file contains valid conversation data
- [ ] API returns `count > 0` when querying `/api/am/llm/conversations/[tabId]`
- [ ] UI shows "AM Active (N)" in green when conversations exist
- [ ] Output accumulation shows "[LLM Logger] Buffer size: N bytes"
- [ ] Output flushing shows "[LLM Logger] Flushing output buffer"
- [ ] Conversation end marks file as complete

## Next Steps

Once debugging confirms the system is working:

1. **Remove excessive debug logging** - Keep only error-level logs
2. **Add user documentation** - Explain how AM LLM logging works
3. **Add UI indicators** - Show when LLM commands are being tracked
4. **Add manual controls** - Allow users to start/stop conversation tracking
5. **Add conversation viewer** - UI to browse past LLM conversations

## File Locations

- **Session logs**: `.forge/am/session-[tabId]-[date].md`
- **LLM conversations**: `.forge/am/llm-conv-[tabId]-[convId].json`
- **Archived sessions**: `.forge/am/archive/`
- **Debug logs**: `forge-debug.log` (if you redirect output)

## Contact

If you encounter issues not covered here, please:
1. Run Forge with full logging: `./bin/forge 2>&1 | tee forge-debug.log`
2. Attempt to reproduce the issue
3. Share the relevant log sections showing the problem
