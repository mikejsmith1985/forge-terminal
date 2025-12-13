# Diagnostic Tool Quick Start

## 🚀 Quick Access

### Diagnostics Button
**Look for the floating bug icon (🐛) in the bottom-left corner of your terminal**

### Slash Command
Type `/diagnose all` in the terminal

---

## 🎯 Common Scenarios

### Scenario 1: Spacebar Not Working
1. Click the **bug icon** (bottom-left)
2. Click **"Test Spacebar Now"**
3. Press spacebar when prompted
4. Check results:
   - ✅ **Green** = Spacebar detected (issue is elsewhere)
   - ❌ **Red** = Spacebar not detected (event blocking issue)

### Scenario 2: Keyboard Lag/Lockout
1. Click **bug icon** when lag occurs
2. Check **"Main Thread Delay"**:
   - < 50ms = Normal
   - \> 50ms = Performance issue
3. Check **"Pending Keys"**:
   - Should be 0
   - If > 0, shows stuck keys

### Scenario 3: Report a Bug
1. Click **bug icon**
2. Click **"Copy"** button (clipboard icon)
3. Paste diagnostics into bug report
4. Include when the issue started

---

## 📊 Understanding Results

### XTerm Health
| Indicator | Meaning | Action |
|-----------|---------|--------|
| Textareas: **1** | ✅ Normal | None |
| Textareas: **0** | ❌ Not initialized | Refresh page |
| Textareas: **>1** | ⚠️ Multiple instances | Report bug |
| Overlay detected | ⚠️ UI blocking input | Report bug |

### Spacebar Test
| Result | Response Time | Meaning |
|--------|--------------|---------|
| ✅ Detected | < 100ms | Working normally |
| ✅ Detected | > 100ms | Slight lag |
| ❌ Timed out | N/A | Completely blocked |

### Focus Distribution
- **On xterm textarea** - Should be highest count
- **On BODY** - Occasional is normal
- **Elsewhere** - If high, focus is drifting

---

## 🔧 Advanced Diagnostics

### Event Listeners Check
```bash
/diagnose listeners
```

Shows:
- Document-level keyboard listeners
- xterm textarea listeners
- Total elements with keyboard listeners

**Note:** Requires Chrome DevTools API

### Individual Tests
```bash
/diagnose keyboard    # Test keyboard event handling
/diagnose focus       # Monitor focus changes
/diagnose overlays    # Check for UI blocking terminal
/diagnose terminal    # Validate terminal DOM state
```

---

## 💡 Tips

1. **Capture diagnostics immediately** when issue occurs
2. **Compare before/after** - Capture when working, then when broken
3. **Test spacebar first** - Quickest way to isolate the issue
4. **Copy to clipboard** - Easy sharing with support
5. **Check warning icon** - Orange pulse = suspected lockout detected

---

## 🆘 Troubleshooting

### Diagnostics button not visible?
- Check terminal is active/focused
- Try clicking terminal area
- Refresh page if needed

### Spacebar test not responding?
- Ensure terminal has focus
- Click terminal before testing
- Check if browser window is active

### Can't copy diagnostics?
- Browser may block clipboard access
- Manually select and copy text from panel
- Screenshot as alternative

---

## 📝 What Gets Captured

When you click the diagnostics button, it captures:
- ✅ Keyboard event counts and timing
- ✅ Focus state and history
- ✅ Terminal DOM health
- ✅ WebSocket connection state
- ✅ Memory usage (if available)
- ✅ Recent events with millisecond timing
- ✅ Pending/stuck keys
- ✅ Overlay detection
- ✅ Main thread performance

**All captured data is read-only and safe to share**

---

## 🔗 Related

- Release Summary: `RELEASE_SUMMARY_v1.22.32.md`
- Technical Details: `docs/sessions/2025-12-13-diagnostic-tool-reactivation.md`
- Legacy diagnostic: `diagnose-event-listeners.js` (reference only)
