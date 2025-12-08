# Local Development Workflow Guide

**Quick Start:** Run `./run-dev.sh` to start Forge locally with full logging

---

## 🚀 Quick Start (Most Common)

### 1. Start Forge Locally
```bash
./run-dev.sh
```

This will:
- ✅ Build if needed
- ✅ Stop any existing instances
- ✅ Start Forge on http://localhost:3000
- ✅ Log everything to `forge-dev.log`
- ✅ Open in your browser automatically

### 2. Make Changes & Rebuild
```bash
# In another terminal
make build && pkill forge && ./bin/forge > forge-dev.log 2>&1 &
```

Or use the simple script:
```bash
./scripts/rebuild.sh  # (we'll create this next)
```

### 3. View Logs in Real-Time
```bash
# Terminal 1: Run Forge
./run-dev.sh

# Terminal 2: Watch logs with filtering
tail -f forge-dev.log | grep -E "AM API|LLM Logger|Terminal|Health Monitor|═══"
```

---

## 🔄 Development Workflows

### **Workflow A: Manual Rebuild (Recommended for Debugging)**

**Terminal 1:** Run Forge with logging
```bash
./run-dev.sh
```

**Terminal 2:** Watch filtered logs
```bash
tail -f forge-dev.log | grep "═══\|✅\|❌"
```

**Terminal 3:** Make changes and rebuild
```bash
# Edit code files...
make build
pkill forge
./bin/forge > forge-dev.log 2>&1 &
```

**Benefits:**
- ✅ Full control over rebuild timing
- ✅ See build errors clearly
- ✅ Easy to test specific changes
- ✅ Best for debugging AM logic

---

### **Workflow B: Auto-Rebuild on File Changes**

```bash
./run-live.sh
```

This watches for Go file changes and auto-rebuilds.

**Requirements:**
```bash
sudo apt-get install inotify-tools
```

**Benefits:**
- ✅ Zero-delay iteration
- ✅ Automatic rebuild on save
- ✅ Great for rapid prototyping

**Drawbacks:**
- ⚠️ Can rebuild while you're still editing
- ⚠️ Less control during debugging

---

### **Workflow C: Frontend-Only Development**

If only changing React/frontend code:

```bash
# Terminal 1: Run backend once
./bin/forge

# Terminal 2: Run Vite dev server
cd frontend
npm run dev
```

Visit http://localhost:5173 (Vite dev server with hot reload)

**Benefits:**
- ✅ Instant hot reload
- ✅ No backend rebuild needed
- ✅ Fastest for UI changes

---

## 🛠️ Common Development Tasks

### **1. Quick Test of Current Build**
```bash
# Just run what's already built
./bin/forge

# Or with logging
./run-dev.sh
```

### **2. Rebuild After Code Changes**
```bash
make build
pkill forge
./bin/forge > forge-dev.log 2>&1 &
```

### **3. Test Ultra-Robust Logging**
```bash
# Start Forge
./run-dev.sh

# In another terminal, run diagnostic
./test-am-robust-logging.sh

# Check logs
grep "CONVERSATION STARTED SUCCESSFULLY" forge-dev.log
```

### **4. Clean Build**
```bash
make clean
make build
./run-dev.sh
```

### **5. Test Command Card Trigger**
```bash
# Start with logging
./run-dev.sh

# In Forge UI:
# 1. Create command card with "Trigger AM" checked
# 2. Select "GitHub Copilot" as provider
# 3. Click Run

# Check logs immediately
tail -50 forge-dev.log | grep "COMMAND CARD TRIGGER"
```

---

## 📊 Log Analysis During Development

### **Watch Logs in Real-Time**
```bash
# All logs
tail -f forge-dev.log

# High-level flow only
tail -f forge-dev.log | grep "═══"

# Success/failure only
tail -f forge-dev.log | grep -E "✅|❌|⚠️"

# AM-specific logs
tail -f forge-dev.log | grep -E "AM API|LLM Logger|Health Monitor"

# Conversation tracking
tail -f forge-dev.log | grep -E "CONVERSATION|GetConversations|StartConversation"
```

### **Search Recent Logs**
```bash
# Last 100 lines
tail -100 forge-dev.log | grep "COMMAND CARD TRIGGER"

# Last 5 minutes
find . -name "forge-dev.log" -mmin -5 -exec grep "CONVERSATION STARTED" {} \;

# Count conversations created
grep -c "CONVERSATION STARTED SUCCESSFULLY" forge-dev.log
```

### **Compare Before/After State**
```bash
# Before code change
grep "mapSize=" forge-dev.log > before.txt

# Make code change and rebuild

# After code change  
grep "mapSize=" forge-dev.log > after.txt

# Compare
diff before.txt after.txt
```

---

## 🐛 Debugging Workflow

### **Issue: 0 Conversations Detected**

**Step 1:** Start with logging
```bash
./run-dev.sh
```

**Step 2:** Execute command card in UI

**Step 3:** Check logs immediately
```bash
# Did trigger work?
tail -50 forge-dev.log | grep "COMMAND CARD TRIGGER"

# Was conversation created?
tail -50 forge-dev.log | grep "CONVERSATION STARTED SUCCESSFULLY"

# Can we retrieve it?
tail -50 forge-dev.log | grep "GetConversations() returned"

# Tab ID consistency?
grep -E "tabID=|/conversations/" forge-dev.log | tail -10
```

**Step 4:** Add more logging if needed
```go
// In the suspicious function
log.Printf("[DEBUG] My custom debug: value=%v", someValue)
```

**Step 5:** Rebuild and test
```bash
make build
pkill forge
./bin/forge > forge-dev.log 2>&1 &

# Test again and check new logs
tail -f forge-dev.log | grep DEBUG
```

---

## 🔧 Useful Scripts

### **Quick Rebuild Script**

Create `scripts/rebuild.sh`:
```bash
#!/bin/bash
set -e
echo "🔨 Rebuilding..."
make build
echo "⚠️  Stopping Forge..."
pkill forge || true
sleep 1
echo "🚀 Starting Forge..."
./bin/forge > forge-dev.log 2>&1 &
echo "✅ Done! Forge restarted."
echo "   URL: http://localhost:3000"
echo "   Logs: tail -f forge-dev.log"
```

### **Log Cleaner Script**

Create `scripts/clean-logs.sh`:
```bash
#!/bin/bash
echo "🧹 Cleaning logs..."
rm -f forge-dev.log forge.log test-am-*.log
echo "✅ Logs cleaned"
```

---

## 📝 Best Practices

### **During Development**

1. ✅ **Always use `forge-dev.log` for local testing**
   - Keeps it separate from production `forge.log`
   - Easy to clean up

2. ✅ **Use filtered log watching**
   - Don't watch raw logs (too noisy)
   - Filter for what you're debugging

3. ✅ **Test with diagnostic script**
   ```bash
   ./test-am-robust-logging.sh
   ```
   - Validates all paths
   - Reports exact issues

4. ✅ **Clear logs between tests**
   ```bash
   > forge-dev.log  # Clear log
   ./bin/forge > forge-dev.log 2>&1 &  # Restart
   ```

5. ✅ **Use multiple terminals**
   - Terminal 1: Run Forge
   - Terminal 2: Watch logs
   - Terminal 3: Run tests/make changes

### **Before Pushing to Production**

1. ✅ **Test locally first**
   ```bash
   make build
   ./test-am-robust-logging.sh
   ```

2. ✅ **Verify no regressions**
   ```bash
   make test  # If you have tests
   ```

3. ✅ **Clean up debug logs**
   ```bash
   # Remove any temporary debug logging
   grep -r "DEBUG" internal/ cmd/
   ```

4. ✅ **Test with real workflow**
   - Create command cards
   - Execute them
   - Verify AM Monitor shows count

5. ✅ **Check build for production**
   ```bash
   make clean
   make build
   ./bin/forge  # Quick smoke test
   ```

---

## 🔍 Comparison: Local vs Production Testing

### **Local Development (Recommended for Debugging)**

✅ **Immediate feedback** (seconds, not minutes)  
✅ **Full logs available** in real-time  
✅ **Easy to add debug logging** and rebuild  
✅ **No deployment delay**  
✅ **Can test with debugger** (delve)  
✅ **Safe to break things**  

**Time per iteration:** ~30 seconds  
**Workflow:** Edit → `make build` → `pkill forge` → Run → Test → Repeat

---

### **Production Deployment (Use for Final Validation)**

⚠️ **Slow feedback** (5-10 minutes)  
⚠️ **Logs harder to access**  
⚠️ **Can't easily add debug logging**  
⚠️ **Git commit required**  
⚠️ **GitHub Actions delay**  
⚠️ **Affects live system**  

**Time per iteration:** ~10 minutes  
**Workflow:** Edit → Commit → Push → Wait for CI → SSH to server → Check logs

---

## 🎯 Recommended Workflow for AM Debugging

### **Phase 1: Diagnose Locally (Now)**

```bash
# Terminal 1
./run-dev.sh

# Terminal 2  
tail -f forge-dev.log | grep "═══\|✅\|❌"

# Terminal 3
./test-am-robust-logging.sh

# Review output and identify root cause
grep "ZERO conversations found" forge-dev.log
grep -E "tabID=" forge-dev.log | tail -10
```

**Expected time:** 5-15 minutes to find issue

---

### **Phase 2: Fix Locally**

```bash
# Edit the problematic file
nano internal/am/llm_logger.go

# Add debug logging if needed
log.Printf("[DEBUG] Tab ID: %s", tabID)

# Rebuild and test
make build
pkill forge
./bin/forge > forge-dev.log 2>&1 &

# Test again
./test-am-robust-logging.sh

# Verify fix
grep "Found [1-9]" forge-dev.log  # Should show conversations found
```

**Expected time:** 10-20 minutes to fix and verify

---

### **Phase 3: Push to Production**

```bash
# Clean up any debug logging
grep -r "DEBUG" internal/ cmd/

# Final local test
make clean
make build
./test-am-robust-logging.sh

# Commit and push
git add -A
git commit -m "fix: resolve 0 conversations issue with tab ID consistency"
git push origin main

# Wait for GitHub Actions
# SSH to server and verify in production
```

**Expected time:** 5-10 minutes for deployment

---

## 📚 Quick Reference

| Task | Command |
|------|---------|
| Start locally | `./run-dev.sh` |
| Rebuild | `make build && pkill forge && ./bin/forge > forge-dev.log 2>&1 &` |
| Watch logs | `tail -f forge-dev.log \| grep "═══"` |
| Test AM | `./test-am-robust-logging.sh` |
| Check conversations | `grep "GetConversations() returned" forge-dev.log` |
| Compare tab IDs | `grep -E "tabID=\|/conversations/" forge-dev.log` |
| Clean logs | `> forge-dev.log` |
| Clean build | `make clean && make build` |

---

## 🎉 Next Steps

1. **Start Forge locally:**
   ```bash
   ./run-dev.sh
   ```

2. **Test with your configured card:**
   - Execute the command card that triggered the toast
   - Watch logs in another terminal

3. **Run diagnostic:**
   ```bash
   ./test-am-robust-logging.sh
   ```

4. **Review logs and find root cause:**
   ```bash
   tail -100 forge-dev.log | grep "COMMAND CARD TRIGGER\|GetConversations"
   ```

5. **Fix, rebuild, test - all locally!**

---

**Time saved per iteration:** ~9 minutes (10 min deployment → 1 min local)  
**Total time saved:** Hours over multiple debugging cycles  
**Developer happiness:** 📈 Significantly improved! 🎉
