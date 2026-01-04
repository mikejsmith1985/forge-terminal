# v3.11.5 Quick Reference - Testing Guide

## 🧪 Automated Testing

```bash
# Run full Playwright test suite
npx playwright test tests/playwright/critical-app-failures.spec.js

# Run with UI
npx playwright test tests/playwright/critical-app-failures.spec.js --ui

# Run specific test
npx playwright test -g "Debug panel should not crash"
```

## 🔍 Manual Testing

### Test 1: AM Monitor Timestamp (Critical)
**Goal:** Verify "Active Xh ago" shows accurate timestamps

```bash
# 1. Start Forge with new binary
./forge-v3.11.5-fixed.exe

# 2. Start Copilot session
gh copilot

# 3. Have conversation (5-10 turns)

# 4. Wait 2+ hours (leave session open)

# 5. Check AM Monitor badge
# Expected: "Active <60s ago" (or whatever time since last save)
# NOT: "Active 2h ago" or "Active 16h ago"
```

**Pass Criteria:** Shows timestamp within 60s of last conversation activity

---

### Test 2: Paste Reliability (Critical)
**Goal:** Verify Ctrl+V works 100% of time

```bash
# 1. Start Forge terminal
./forge-v3.11.5-fixed.exe

# 2. Copy this text:
echo "Testing paste reliability fix v3.11.5"

# 3. Press Ctrl+V 100 times in terminal

# 4. Count failures (permission denied errors)
```

**Pass Criteria:** 
- ✅ 100/100 pastes succeed
- ❌ 0/100 "permission denied" errors

---

### Test 3: Debug Panel (Quick Check)
```bash
# 1. Open Forge terminal
# 2. Click "Debug" tab in sidebar
# 3. Observe app behavior
```

**Pass Criteria:** App does NOT freeze or crash

---

### Test 4: Command Cards (Quick Check)
```bash
# 1. Open Forge terminal
# 2. Wait for command cards to load
# 3. Check they appear within 3 seconds
```

**Pass Criteria:** Cards load successfully, no infinite spinner

---

### Test 5: Auto-Respond Tool Permissions
```bash
# 1. Start Copilot WITHOUT --allow-all-tools
gh copilot

# 2. Enable Auto-Respond in Forge UI

# 3. Ask Copilot: "show me the files in current directory"

# 4. Copilot will ask: "Allow tool: bash?"

# 5. Auto-Respond should detect and respond
```

**Pass Criteria:** Auto-Respond detects permission prompt and auto-confirms

---

## 📊 Success Metrics

| Test | Target | Critical? |
|------|--------|-----------|
| AM Monitor Accuracy | <60s drift | ✅ YES |
| Paste Success Rate | 100/100 | ✅ YES |
| Debug Panel | No crash | ⚠️ Medium |
| Command Cards | Loads <3s | ⚠️ Medium |
| Auto-Respond | Detects prompts | ⚠️ Medium |

## 🐛 If Tests Fail

### AM Monitor still shows stale time
1. Check: Is conversation being saved? (Look for save logs)
2. Check: Does JSON file have `lastSaveTime` field?
3. Verify: Backend using `conv.LastSaveTime` not `turn.Timestamp`

### Paste still fails
1. Check: Does Ctrl+V handler still have `setTimeout`?
2. Verify: Clipboard API called immediately (no delay)
3. Test in different browsers (Chrome, Firefox, Edge)

### Debug panel still crashes
1. Check: Using `addEventListener` not `ws.onmessage =`
2. Verify: No direct `console.log` override

## 📝 Reporting Results

After testing, report:
```
✅ AM Monitor: Shows "Active 12s ago" during live session
✅ Paste: 100/100 success (0 permission errors)
✅ Debug Panel: No crash
✅ Command Cards: Loaded in 1.2s
✅ Auto-Respond: Detected tool permission prompt
```

## 🚀 Ready to Release

Once all tests pass:
1. Tag: `git tag v3.11.5`
2. Update CHANGELOG
3. Deploy `forge-v3.11.5-fixed.exe`
4. Monitor production metrics
