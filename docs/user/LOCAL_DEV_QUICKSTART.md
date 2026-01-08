# 🚀 LOCAL DEVELOPMENT - QUICK START

> **⚠️ Note:** Some testing commands in this guide reference the deprecated "AM" (Artificial Memory) feature which was removed in v3.12.12.

**You're ready to test locally! No more push-to-production cycle.**

---

## ⚡ Fastest Way to Start

### Option 1: Simple Start (Recommended)
```bash
./run-dev.sh
```
Then open http://localhost:3000 in your browser.

---

## 📊 Watch Logs While Testing

**Terminal 1:** Run Forge
```bash
./run-dev.sh
```

**Terminal 2:** Watch filtered logs
```bash
./scripts/watch-logs.sh forge-dev.log
```

Or use tail directly:
```bash
tail -f forge-dev.log | grep -E "═══|✅|❌"
```

---

## 🔄 After Making Code Changes

### Quick Rebuild
```bash
./scripts/rebuild.sh
```

### Manual Rebuild
```bash
make build
pkill forge
./bin/forge > forge-dev.log 2>&1 &
```

---

## 🐛 Debug the "0 Conversations" Issue

### Step 1: Start Forge
```bash
./run-dev.sh
```

### Step 2: In another terminal, watch logs
```bash
tail -f forge-dev.log | grep "CONVERSATION\|tabID="
```

### Step 3: Execute your command card
- Go to http://localhost:3000
- Run your configured command card with "Trigger AM" checked

### Step 4: Check logs immediately
```bash
# Did it trigger?
grep "COMMAND CARD TRIGGER" forge-dev.log | tail -5

# Was conversation created?
grep "CONVERSATION STARTED SUCCESSFULLY" forge-dev.log | tail -5

# Can we retrieve it?
grep "GetConversations() returned" forge-dev.log | tail -5

# Tab ID consistency?
grep -E "tabID=|/conversations/" forge-dev.log | tail -10
```

### Step 5: Run diagnostic test
```bash
./test-am-robust-logging.sh
```

This will tell you exactly what's wrong!

---

## 🎯 Common Commands

| What | Command |
|------|---------|
| **Start Forge** | `./run-dev.sh` |
| **Rebuild** | `./scripts/rebuild.sh` |
| **Watch logs** | `./scripts/watch-logs.sh forge-dev.log` |
| **Test AM** | `./test-am-robust-logging.sh` |
| **Clean logs** | `./scripts/clean-logs.sh` |
| **Stop Forge** | `pkill forge` |

---

## 💡 Pro Tips

**Terminal Layout:**
```
┌─────────────────┬─────────────────┐
│  Terminal 1     │  Terminal 2     │
│  ./run-dev.sh   │  Watch logs     │
│                 │  tail -f ...    │
├─────────────────┴─────────────────┤
│  Terminal 3: Edit code & rebuild  │
│  ./scripts/rebuild.sh             │
└───────────────────────────────────┘
```

**Best Workflow:**
1. Start Forge in Terminal 1
2. Watch logs in Terminal 2  
3. Make changes and rebuild in Terminal 3
4. See results immediately!

---

## 📚 Full Documentation

- **Quick Start:** This file
- **Complete Guide:** `LOCAL_DEV_GUIDE.md`
- **Logging Guide:** `AM_ULTRA_ROBUST_LOGGING_GUIDE.md`
- **Quick Reference:** `AM_LOGGING_QUICK_REF.md`

---

## ✅ Ready to Go!

You now have:
- ✅ Local binary built with ultra-robust logging
- ✅ Development scripts for quick iteration
- ✅ Log filtering tools
- ✅ Diagnostic test suite
- ✅ Complete documentation

**Time per test cycle:** ~30 seconds (vs 10 minutes to production)  
**Logs:** Available immediately, not after SSH  
**Safety:** Break things locally, fix before pushing

---

## 🎉 Next Action

**Start testing now:**
```bash
./run-dev.sh
```

Then in another terminal:
```bash
./test-am-robust-logging.sh
```

This will identify the exact cause of "0 conversations detected" in under 5 minutes!

---

**Status:** ✅ READY  
**Binary:** bin/forge (with ultra-robust logging)  
**Scripts:** All executable and ready  
**Documentation:** Complete

**Let's find that bug! 🐛🔍**
