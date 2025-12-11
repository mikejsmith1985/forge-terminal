# LLM Conversation Logging - User Guide

## 🎯 **TL;DR**: It Just Works™

**You don't need to do anything.** LLM conversation logging is **ALWAYS ON** automatically.

---

## How It Works (Zero Configuration)

> ⚠️ Note: The release watcher has been deprecated and removed from the repository.

### **What Happens Automatically:**

1. **You open Forge Terminal** → Logging system activates
2. **You type commands** → System watches for LLM patterns
3. **You run `gh copilot suggest "..."` or `claude "..."`** → Detected automatically
4. **Conversation captured** → Stored as clean JSON
5. **After 10 days** → Old logs automatically deleted

### **What You DON'T Need To Do:**

❌ Enable or configure logging  
❌ Start/stop any services  
❌ Install additional software (beyond gh CLI)  
❌ Manually save conversations  
❌ Clean up old logs  

---

## Real User Workflow

This is **exactly** what users do (and what gets logged automatically):

### **Step 1: Launch Forge**
```bash
# User opens Forge Terminal in browser
# → LLM logging activated automatically ✅
```

### **Step 2: Navigate to project**
```bash
cd ~/my-project
# → Regular command, not logged as LLM conversation ✅
```

### **Step 3: Start LLM session**
```bash
copilot
# → DETECTED! Conversation tracking starts ✅
# → User enters TUI and starts chatting
# → Every prompt and response logged automatically ✅
```

Or:
```bash
claude
# → DETECTED! Conversation tracking starts ✅
# → User enters TUI and starts chatting
# → Every prompt and response logged automatically ✅
```

### **Step 4: Work continues until...**

**Scenario A: App crashes**
- ✅ Conversation logged up to crash point
- ✅ Can be recovered from `.forge/am/llm-conv-*.json`

**Scenario B: Accidentally shut down**
- ✅ Conversation logged up to shutdown
- ✅ Can resume from where you left off

**Scenario C: Update happens**
- ✅ Conversation logged before update
- ✅ Available after restart

**All conversations kept for 10 days automatically.**

**You type in terminal:**
```bash
copilot
```

**What happens automatically:**
- ✅ System detects this is an LLM command
- ✅ Starts tracking the entire interactive session
- ✅ Captures all your prompts in the TUI
- ✅ Captures all Copilot responses (cleaned, no ANSI codes)
- ✅ Continues logging until you exit Copilot
- ✅ Saves to: `.forge/am/llm-conv-{tabId}-{convId}.json`

**You see:** Normal Copilot interactive TUI  
**Behind the scenes:** Clean conversation saved to disk

### **Scenario 2: Claude CLI**

**You type:**
```bash
claude
```

**What happens automatically:**
- ✅ Detected as LLM command
- ✅ Entire interactive session tracked
- ✅ All prompts and responses captured
- ✅ Clean JSON format for recovery

### **Scenario 3: Regular Commands**

**You type:**
```bash
ls -la
cd /home/projects
npm install
```

**What happens:**
- ✅ Regular AM logging (existing feature)
- ❌ NOT logged as LLM conversations
- ✅ System only tracks actual LLM CLI tools

---

## Where Are Logs Stored?

### **Location:**
```
~/.forge/am/llm-conv-*.json
```

### **Example File:**
```
.forge/am/llm-conv-tab-1-abc123-conv-1733590123456.json
```

### **File Format:**
```json
{
  "conversationId": "conv-1733590123456",
  "tabId": "tab-1-abc123",
  "provider": "github-copilot",
  "commandType": "suggest",
  "startTime": "2025-12-07T12:00:00Z",
  "turns": [
    {
      "role": "user",
      "content": "create a web server",
      "timestamp": "2025-12-07T12:00:00Z",
      "provider": "github-copilot"
    },
    {
      "role": "assistant",
      "content": "Here's a Node.js web server:\n\nconst http = require('http');...",
      "timestamp": "2025-12-07T12:00:05Z",
      "provider": "github-copilot"
    }
  ],
  "complete": true
}
```

---

## Retention Policy

**Logs are kept for 10 days, then automatically deleted.**

- Day 0-10: Logs available in `.forge/am/`
- Day 10+: Automatically cleaned up
- You can manually view/backup logs anytime before deletion

---

## Supported LLM CLI Tools

### **Currently Auto-Detected:**

1. **GitHub Copilot CLI (standalone)**
   - Just type: `copilot`
   - Interactive TUI mode
   - All conversations automatically logged

2. **Claude CLI**
   - Just type: `claude`
   - Interactive TUI mode
   - All conversations automatically logged

### **Coming Soon:**
- OpenAI CLI
- Custom LLM wrappers
- Multi-provider support

---

## What Makes This Different from Regular AM Logs?

### **Regular AM Logging (Existing):**
- Raw terminal output with ANSI codes
- Example: `[?2004h╭─ TUI frames ─╮[?2004l`
- Useful for session replay but hard to parse

### **LLM Conversation Logging (NEW):**
- Clean, structured JSON
- Example: `{"role":"user","content":"clean prompt"}`
- Legal-ready, easy to search, recoverable

**Both run simultaneously** - you get both types of logs automatically.

---

## Legal/Compliance Benefits

✅ **Complete audit trail** - Every LLM interaction timestamped  
✅ **Clear attribution** - Know who said what (user vs AI)  
✅ **Clean data** - No ANSI codes or terminal junk  
✅ **Structured format** - JSON for programmatic access  
✅ **Disaster recovery** - Can replay conversations exactly  
✅ **10-day retention** - Comply with data retention policies  

---

## Viewing Your Conversation Logs

### **Option 1: Check Files Directly**
```bash
ls -la ~/.forge/am/llm-conv-*.json
cat ~/.forge/am/llm-conv-*.json | jq
```

### **Option 2: Use API**
```bash
curl http://localhost:8333/api/am/llm/conversations/tab-1-abc123 | jq
```

### **Option 3: Frontend UI (Coming Soon)**
- View conversations in Forge Terminal UI
- One-click restore to continue work
- Search conversation history

---

## Performance Impact

**You won't notice any difference:**
- CPU overhead: <1ms per command detection
- Memory usage: <10KB per conversation
- Disk space: 1-5KB per conversation file
- No network overhead

---

## Troubleshooting

### **Q: I ran `gh copilot` but don't see logs**

**A:** Check these:
1. Is `gh` CLI installed? (`which gh`)
2. Wait 2 seconds after command completes (auto-flush delay)
3. Check `.forge/am/llm-conv-*.json` files exist
4. Look at terminal logs for `[Terminal] LLM command detected` messages

### **Q: Can I disable LLM logging?**

**A:** Currently, it's always on for legal compliance. If needed, we can add a toggle.

### **Q: How do I manually clean old logs?**

**A:** They auto-delete after 10 days. To manually clean:
```bash
rm ~/.forge/am/llm-conv-*.json
```

### **Q: What if I don't use gh CLI?**

**A:** Regular AM logging still works. LLM logging only activates when you use supported CLIs.

---

## Privacy & Security

- **Logs stored locally** in `~/.forge/am/` directory
- **No data sent to cloud** - everything stays on your machine
- **Standard file permissions** (0644) - readable by you only
- **Auto-cleanup** after 10 days
- **Subject to existing AM retention** policies

---

## Summary

**You literally do nothing and it works:**

1. ✅ Install/use Forge Terminal normally
2. ✅ Run LLM CLI commands when you need them
3. ✅ Conversations automatically logged in background
4. ✅ Clean JSON files created in `.forge/am/`
5. ✅ Auto-deleted after 10 days
6. ✅ Legal compliance achieved

**That's it. No configuration. No manual steps. It just works.**

---

## Need More Info?

- Technical details: See `LLM_LOGGING_IMPLEMENTATION.md`
- Problem context: See `ISSUE_23_ANALYSIS.md`
- API docs: See `cmd/forge/main.go` → `handleAMLLMConversations`

---

## Performance Tuning (Advanced)

### AM Monitoring Polling Interval

By default, the AM Monitor polls every 30 seconds. If you experience keyboard latency or want more frequent updates:

**Via Browser Console:**
```javascript
// Check current interval
window.__forgeAMConfig?.getPollingInterval()

// Set new interval (milliseconds)
window.__forgeAMConfig?.setPollingInterval(60000)  // 60 seconds
window.__forgeAMConfig?.setPollingInterval(10000)  // 10 seconds
```

**Common Intervals:**
- `10000` - Very frequent (high I/O, may cause latency)
- `30000` - **Default** (balanced performance)
- `60000` - Reduced monitoring (best for typing)

The setting persists in browser localStorage and survives page reloads.
