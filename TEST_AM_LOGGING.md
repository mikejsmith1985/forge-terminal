# How to Test AM LLM Logging (Quick Start)

## What You're Testing

The AM (Artificial Memory) system should automatically log your interactions with AI coding assistants like GitHub Copilot CLI and Claude CLI.

## Prerequisites

You need one of these installed:
- **GitHub Copilot CLI** - Install via `npm install -g @githubnext/github-copilot-cli`
- **Claude CLI** - Install via Claude Desktop or Anthropic

## Test Steps

### 1. Build Forge

```bash
make build
```

### 2. Run Forge with Logging

Open a terminal and run:
```bash
./bin/forge 2>&1 | tee forge-debug.log
```

### 3. Watch Logs (Optional)

In another terminal, watch for LLM activity:
```bash
tail -f forge-debug.log | grep -E "\[Terminal\]|\[LLM Logger\]"
```

### 4. Enable AM in a Tab

In the Forge Terminal UI:
1. Click the **Settings** icon in a tab
2. Toggle **"Enable AM Logging"** to ON
3. The tab should show a green "AM Active" indicator

### 5. Run an LLM Command

In the terminal, type one of these:

```bash
copilot
```

OR

```bash
claude
```

Then press **Enter**.

### 6. Check the Logs

You should see output like this:

**✅ SUCCESS:**
```
[Terminal] Command entered: 'copilot' (length: 7)
[Terminal] LLM detection result: detected=true provider=github-copilot type=chat command='copilot'
[Terminal] ✅ LLM command DETECTED: provider=github-copilot type=chat
[Terminal] ✅ Started LLM conversation: conv-1733581234567890000
[LLM Logger] Starting conversation: tabID=tab-1-abc123 convID=conv-1733581234567890000 provider=github-copilot
[LLM Logger] Conversation started, saving initial state...
[LLM Logger] ✅ Conversation saved successfully: llm-conv-tab-1-abc123-conv-1733581234567890000.json
```

**❌ PROBLEM:**
```
[Terminal] Command entered: 'copilot' (length: 7)
[Terminal] ❌ Not an LLM command: 'copilot'
```

### 7. Verify Files Created

Check for JSON files:
```bash
ls -lh .forge/am/llm-conv-*.json
```

You should see files like:
```
-rw-r--r-- 1 user user 245 Dec  7 13:45 llm-conv-tab-1-abc123-conv-1733581234567890000.json
```

### 8. Inspect a Conversation

View the JSON:
```bash
cat .forge/am/llm-conv-*.json | jq '.'
```

Expected content:
```json
{
  "conversationId": "conv-1733581234567890000",
  "tabId": "tab-1-abc123",
  "provider": "github-copilot",
  "commandType": "chat",
  "startTime": "2025-12-07T18:45:00Z",
  "turns": [
    {
      "role": "user",
      "content": "",
      "timestamp": "2025-12-07T18:45:00Z",
      "provider": "github-copilot"
    }
  ],
  "complete": false
}
```

### 9. Check the UI

In the Forge Terminal tab bar, look for the **AM Monitor** indicator:

- **Green "AM Active (1)"** ✅ - LLM conversation was logged
- **Red "No LLM Activity"** ❌ - No LLM conversation detected

## What to Report

### If It Works ✅

Report:
- ✅ Command detected: `copilot` or `claude`
- ✅ JSON file created
- ✅ UI shows "AM Active (N)"
- Share a screenshot of the working UI

### If It Doesn't Work ❌

Report:
1. **What command did you type?** (exact text)
2. **What did the logs show?** (copy the relevant lines)
3. **Were any JSON files created?** (`ls -lh .forge/am/llm-conv-*.json`)
4. **Any error messages?** (look for ❌ in logs)

Attach or share:
- `forge-debug.log` file
- Screenshot of the terminal
- Output of: `cat forge-debug.log | grep -E "\[Terminal\]|\[LLM Logger\]"`

## Common Issues

### "command not found: copilot"

**Problem:** GitHub Copilot CLI is not installed.

**Fix:** Install it:
```bash
npm install -g @githubnext/github-copilot-cli
```

### "❌ Not an LLM command" for `copilot`

**Problem:** Extra characters or whitespace in the command.

**Debug:** Check the log line that shows:
```
[Terminal] Command entered: '...' (length: N)
```

The command must be exactly `copilot` or `claude` with no extra characters.

### JSON files not created

**Problem:** Permission issues with `.forge/am/` directory.

**Fix:**
```bash
mkdir -p .forge/am
chmod 755 .forge/am
```

### "No LLM Activity" in UI even though JSON exists

**Problem:** Tab ID mismatch between file and UI.

**Debug:** 
1. Check the tab ID in the JSON filename
2. Check if the UI is requesting the correct tab ID
3. Look for API call errors in browser console

## Quick Automated Test

Run this script:
```bash
./test-am-logging.sh
```

It will:
1. Start Forge
2. Test the API endpoint
3. Check for JSON files
4. Show relevant logs

## More Help

For detailed troubleshooting, see:
- `AM_LOGGING_DEBUG_GUIDE.md` - Complete debugging guide
- `AM_DEBUG_SUMMARY.md` - Implementation summary

For questions or issues, provide:
- Your OS (Windows/macOS/Linux)
- Forge version: `./bin/forge --version` 
- Full debug logs from `forge-debug.log`
