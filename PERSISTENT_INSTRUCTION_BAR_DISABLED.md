# Persistent Instruction Bar - DISABLED (Critical Bugs)

**Date**: 2026-01-10  
**Status**: Feature DISABLED until proper fix implemented  
**Severity**: CRITICAL - Breaks core terminal functionality

---

## 🚨 Critical Issues Identified

The Persistent Instruction Bar feature (v3.12.15) has fundamental architectural problems that break core terminal functionality:

### Issue #1: Command Card Execution Breaks
**Problem**: When persistent instructions are enabled, Command Cards stop working.

**Root Cause**: `PersistentInstructionBar` calls `sendToTerminal(fullPrompt)`, which uses `termRef.write()` to inject raw text into the PTY. This appends the persistent instruction text to EVERY command.

**Example Failure**:
```bash
# User clicks "Launch Copilot" command card
# Expected: copilot
# Actual:   copilot

Context: don't break stuff

# Result: Command fails with syntax error
```

### Issue #2: Enter Key Doesn't Send
**Problem**: Pressing Enter in the Persistent Instruction Bar textarea doesn't send the message—it just keeps appending the same text.

**Root Cause**: Each Enter press calls `handleSend()` → `sendToTerminal()` → `termRef.write()`, which physically types the text into the terminal again instead of executing it once.

**Example**:
```
User types: "test"
Presses Enter: "test\n\nContext: don't break stuff" appears in terminal
Presses Enter again: Same text appears AGAIN
```

---

## 🔍 Root Cause Analysis

### Architectural Flaw
The feature attempts to inject LLM context by **writing to the PTY (terminal input)**, which is fundamentally wrong:

```javascript
// WRONG: Writes raw text to terminal (like user typing)
const sendToTerminal = (text) => {
  termRefObj.write(text + '\r');  // ← Appends to terminal input buffer
};

// CORRECT: Sends as a command (like Command Cards)
const handleExecute = (cmd) => {
  termRef.sendCommand(cmd.command, cmd.delay);  // ← Proper command execution
};
```

### Why This Breaks
1. **Command Cards** use `termRef.sendCommand()` (proper execution)
2. **Persistent Instructions** use `termRef.write()` (raw PTY injection)
3. Result: Instructions get physically typed into terminal, breaking commands

---

## ✅ Temporary Fix Applied

### Changes Made
1. **Disabled PersistentInstructionBar component** in `App.jsx`:
   ```javascript
   {/* <PersistentInstructionBar ... /> */}  // Commented out
   ```

2. **Disabled toggle button** in `ForgeAssist.jsx`:
   ```javascript
   // Shows "Bar: DISABLED" with error message
   onClick={() => onToast('Feature Disabled: Breaks commands', 'error')}
   ```

3. **Disabled Ctrl+I keyboard shortcut** in `App.jsx`:
   ```javascript
   // Shows error toast instead of toggling feature
   if (e.ctrlKey && e.key === 'I') {
     addToast('Quick Instruction Bar disabled', 'error');
   }
   ```

---

## 🔧 Proper Fix Required

The Persistent Instruction feature needs **complete reimplementation**:

### Option 1: Server-Side LLM Context Injection (RECOMMENDED)
- Modify backend LLM API to accept context metadata
- Append instructions to LLM system prompt, NOT terminal input
- No PTY involvement

**Architecture**:
```
User Input → Backend API → LLM Prompt Builder
                              ↓
                     System Prompt + User Prompt + Context
                              ↓
                           LLM Response
```

### Option 2: Copy-to-Clipboard Only
- Show persistent instructions in UI
- Provide "Copy with Context" button
- User manually pastes into terminal/chat
- No automatic injection

### Option 3: Chat-Only Context (if AI chat exists)
- Only inject into dedicated AI chat interface
- Never touch terminal PTY
- Separate from command execution

---

## 📋 Testing Checklist (for future fix)

Before re-enabling, verify:

- [ ] Command Cards execute without instruction text appended
- [ ] Enter key sends message exactly once
- [ ] Terminal commands work normally with feature enabled
- [ ] No PTY writes for context injection
- [ ] Context only reaches LLM, not shell

---

## 📁 Files Modified

1. `frontend/src/App.jsx` - Disabled component + keyboard shortcut
2. `frontend/src/components/ForgeAssist.jsx` - Disabled toggle button
3. `frontend/src/components/PersistentInstructionBar.jsx` - Component still exists, just not rendered

---

## 🔗 Related Issues

- User report: "Command cards don't work when bar is enabled"
- User report: "Enter key just appends message again"
- Follow-Me logs: `debug-1767960553545` shows toggling behavior

---

## ⚠️ Important Notes

- **DO NOT re-enable** until server-side LLM integration exists
- **DO NOT use `termRef.write()`** for feature injection
- **DO NOT modify PTY input buffer** for LLM context

The feature concept is valid, but the implementation must be **server-side**, not client-side PTY manipulation.
