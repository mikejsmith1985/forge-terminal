# AM Logging Validation Reference
**Date:** 2025-12-10  
**Version:** v1.21.1 (pending)  
**Purpose:** Validate TUI logging with command card triggers

## Problem Statement

After 10+ iterations, AM logging monitor shows no inputs/outputs despite active conversations. Need to validate if TUI capture is working when triggered by command cards.

## Changes Made in This Session

### 1. Detector Regex Fix
**File:** `internal/llm/detector.go` (line 59)

**Changed:**
```go
Regex: regexp.MustCompile(`(?i)^copilot\s*$`),  // Too strict - exact match only
```

**To:**
```go
Regex: regexp.MustCompile(`(?i)^copilot(\s|$)`),  // Allows whitespace/args
```

**Reason:** User runs standalone `copilot` CLI, not `gh copilot`. Original regex was too strict and wouldn't match terminal input.

### 2. Verified Existing Wiring

**Already Working (no changes needed):**
- ✅ `internal/terminal/handler.go` lines 256-264: PTY output → `llmLogger.AddOutput()`
- ✅ `internal/terminal/handler.go` line 331: User input → `llmLogger.AddUserInput()`
- ✅ `cmd/forge/main.go` lines 866-914: Command card `triggerAM` handling
- ✅ Command card in `~/.forge/commands.json` has `triggerAM: true`

## Command Card Configuration

User's existing copilot command card (already correct):
```json
{
  "id": 1,
  "description": "🤖 Run Copilot CLI",
  "command": "copilot",
  "keyBinding": "Ctrl+Shift+1",
  "triggerAM": true,
  "llmProvider": "copilot",
  "llmType": "chat"
}
```

## How It Works

### Flow When Command Card is Executed:

1. **User clicks command card** in Forge UI
2. **API receives:** POST to `/api/am/log` with `triggerAM=true`
3. **Provider inference:** `"copilot"` → `llm.ProviderGitHubCopilot`
4. **TUI detection:** Copilot is TUI tool → enable screen snapshot mode
5. **Conversation starts:** `StartConversationFromProcess()` called
6. **Conversation ID assigned** to tab's logger
7. **Terminal I/O capture begins:**
   - Every PTY output → `AddOutput()` → screen buffer
   - Every user input → `AddUserInput()` → input buffer
   - Screen clears → trigger snapshot save
8. **Data persists:** `~/.forge/am/llm-conv-{tabId}-{convId}.json`

### Key Guards to Understand

**From `internal/am/llm_logger.go`:**
```go
func (l *LLMLogger) AddOutput(rawOutput string) {
    if l.activeConvID == "" {  // Line 311
        return  // DROPS OUTPUT if no active conversation!
    }
    // ... capture logic
}

func (l *LLMLogger) AddUserInput(rawInput string) {
    if l.activeConvID == "" {  // Line 443
        return  // DROPS INPUT if no active conversation!
    }
    // ... capture logic
}
```

**This means:** Logging ONLY happens when:
- A command card with `triggerAM=true` was clicked, OR
- An LLM command was detected in terminal input

**Random terminal activity is NOT logged** (by design).

## Test Results

### Automated Test: test-command-card-trigger.sh

**Results:**
```
✓ Conversation started: conv-1765390486820861062
✓ Command card trigger detected in logs
✓ TUI mode enabled
✓ Found 1 conversation(s)
✓ Conversation file saved with tuiCaptureMode: true
```

**Test validated:**
- API accepts command card trigger ✅
- Conversation created with correct provider ✅
- TUI mode enabled ✅
- File persisted to disk ✅

**Test did NOT validate:**
- Real terminal I/O capture (needs actual UI interaction)
- Screen snapshot capture on terminal activity
- Conversation data appearing in AM monitor

## Validation Steps for Next Chat

### Prerequisites
1. Pull latest code (v1.21.1 or later)
2. Rebuild: `make build`
3. Start: `./run-dev.sh` or `NO_BROWSER=1 ./bin/forge`

### Step 1: Verify Command Card Exists
```bash
curl -s http://localhost:8333/api/commands | jq '.commands[] | select(.description | contains("Copilot"))'
```

**Expected:** Should show command with `triggerAM: true`

### Step 2: Open Forge UI
```
http://localhost:8333
```

### Step 3: Execute Command Card
1. Create a new terminal tab
2. Press `Ctrl+Shift+1` or click "🤖 Run Copilot CLI"
3. Verify command `copilot` is executed in terminal

### Step 4: Have a Conversation
1. Type a question to copilot
2. Wait for response
3. Exchange a few messages

### Step 5: Check Logs in Real-Time
```bash
# Terminal 1: Watch logs
tail -f forge-dev.log | grep -E "COMMAND CARD|TUI|AddOutput|AddInput|snapshot"

# Terminal 2: Check conversation API
curl -s http://localhost:8333/api/am/llm/conversations/{TAB_ID} | jq
```

### Step 6: Inspect Saved Conversation
```bash
# Find most recent conversation
ls -lt ~/.forge/am/llm-conv-*.json | head -1

# View details
cat $(ls -t ~/.forge/am/llm-conv-*.json | head -1) | jq '{
  conversationId,
  provider,
  tuiCaptureMode,
  turnCount: (.turns | length),
  snapshotCount: (.screenSnapshots | length),
  firstTurn: .turns[0],
  lastSnapshot: .screenSnapshots[-1]
}'
```

### Expected Outputs

**If working correctly:**
- ✅ Logs show "COMMAND CARD TRIGGER" when card clicked
- ✅ Logs show "TUI tool detected"
- ✅ Logs show "AddOutput" calls with terminal data
- ✅ Conversation file has `turns` array with content
- ✅ Conversation file has `screenSnapshots` array
- ✅ AM Monitor UI shows conversation turns

**If NOT working:**
- ❌ Logs show trigger but no AddOutput calls
- ❌ Conversation file has empty turns array
- ❌ No screen snapshots despite terminal activity
- ❌ AM Monitor shows conversation but no content

## Critical Files for Debugging

If validation fails, check these files:

1. **Terminal Handler:** `internal/terminal/handler.go`
   - Lines 256-264: Output capture
   - Line 331: Input capture
   - Lines 346-365: LLM detection and conversation start

2. **LLM Logger:** `internal/am/llm_logger.go`
   - Lines 307-322: `AddOutput()` method
   - Lines 439-455: `AddUserInput()` method
   - Lines 173-230: `StartConversationFromProcess()` method

3. **Main API:** `cmd/forge/main.go`
   - Lines 866-920: Command card trigger handling
   - Lines 947-979: Provider and type inference

4. **Logs:**
   - `forge-dev.log` - All runtime logs
   - `~/.forge/am/llm-conv-*.json` - Saved conversations

## Known Limitations

1. **Manual validation required:** Automated tests can't simulate real browser + terminal interaction
2. **Timing sensitive:** Screen snapshots only saved on screen clear detection
3. **No logging without active conversation:** By design, random terminal I/O is not captured

## Questions to Answer in Next Chat

1. Does the command card trigger start a conversation? (API should return convID)
2. Do logs show "AddOutput" and "AddUserInput" calls during the conversation?
3. Does the conversation file contain actual turn content?
4. Do screen snapshots get saved when copilot refreshes the screen?
5. Does the AM Monitor UI reflect the conversation activity?

## Reference Commands

```bash
# Check if forge is running
pgrep -af "bin/forge"

# View recent logs
tail -50 forge-dev.log

# List active conversations
curl -s http://localhost:8333/api/am/llm/conversations/{TAB_ID} | jq

# Check AM health
curl -s http://localhost:8333/api/am/health | jq

# Find recent conversation files
find ~/.forge/am -name "llm-conv-*.json" -mmin -10

# View command cards
cat ~/.forge/commands.json | jq
```

## Expected Version

This validation applies to:
- **Minimum version:** v1.21.1
- **Commit:** Contains detector regex fix in `internal/llm/detector.go`
- **Build:** Must be rebuilt after pulling latest code

## Success Criteria

✅ Command card click creates conversation with TUI mode  
✅ Terminal I/O appears in forge-dev.log as AddOutput/AddInput calls  
✅ Conversation file contains turns with actual content  
✅ Screen snapshots array is populated  
✅ AM Monitor UI shows conversation turns  

If all criteria met = **Logging is fully functional** 🎉
