# Architecture Decision: Client-Side Context Injection

**Date**: 2026-01-10  
**Status**: Phase 3 Architectural Pivot

---

## Problem with Server-Side Injection

Initial plan was to inject persistent context server-side in the PTY handler. However, this approach has fundamental limitations:

### Technical Constraints

1. **Environment Variables Are Static**
   - Set once at session creation
   - Cannot be dynamically updated during session lifetime
   - Shell child processes inherit the environment at spawn time

2. **Child Process Isolation**
   - LLM CLI tools (`copilot`, `claude`) are spawned by the shell as child processes
   - Go backend cannot inject into their STDIN (they read from shell's PTY)
   - No IPC mechanism to modify running child processes

3. **Command Timing Issue**
   - Commands are written to PTY immediately for responsiveness (line 1020 in handler.go)
   - Detection happens AFTER the write (lines 1044-1049)
   - Cannot modify commands that have already been sent to shell

---

## Correct Architecture: Client-Side Conditional Injection

### Design

**Context is appended in the frontend BEFORE sending to WebSocket, but ONLY for detected LLM commands.**

```
User Types → Frontend Detection → Conditional Append → WebSocket → PTY → Shell
             (IsLLMCommand)       (LLM: add context)
                                  (Shell: pass through)
```

### Implementation

**Backend (Already Complete):**
- ✅ `ContextManager`: Store context per session
- ✅ `IsLLMCommand()`: Pattern matching utility
- ✅ WebSocket handler: Receive/store context via `PROMPT_INJECTION_CONFIG`

**Frontend (Phase 3 Updated):**
- [ ] Import `IsLLMCommand` logic to JavaScript (copy pattern matching)
- [ ] In `ForgeTerminal.jsx`, before sending PTY input:
  - Check if command is LLM command
  - If yes AND context enabled: append context to command
  - If no: send command unchanged
- [ ] Command Cards: Never append (explicit commands, user controls them)

---

## Code Examples

### Frontend Detection (JavaScript)

```javascript
function isLLMCommand(cmd) {
  const trimmed = cmd.trim().toLowerCase();
  if (!trimmed) return false;
  
  // Subagent invocation
  if (trimmed.startsWith('@')) return true;
  
  // LLM CLI tools
  const prefixes = ['copilot', 'gh copilot', 'claude', 'aider'];
  return prefixes.some(prefix => 
    trimmed === prefix || trimmed.startsWith(prefix + ' ')
  );
}
```

### Frontend Integration Point

```javascript
// ForgeTerminal.jsx - PTY input handler
handlePTYInput(data) {
  // Check if Enter key was pressed (command submission)
  if (data.includes('\r') || data.includes('\n')) {
    const command = this.inputBuffer.trim();
    
    // Get persistent context from localStorage
    const context = this.getPersistentContext();
    
    // Only append context for LLM commands
    if (context.enabled && isLLMCommand(command)) {
      const modifiedData = data.replace(/\r|\n/, ` ${context.text}\r`);
      this.socket.send(modifiedData);
    } else {
      this.socket.send(data); // Pass through unchanged
    }
  } else {
    this.socket.send(data); // Pass through typing
  }
}
```

---

## Why This Is Better

### ✅ Advantages

1. **Zero PTY Pollution**: Context never reaches shell for non-LLM commands
2. **Dynamic Control**: Context can be toggled on/off instantly (no session restart)
3. **Command Cards Work**: Explicit commands bypass context logic
4. **Terminal Stays Clean**: Users see `copilot explain`, not `copilot explain\n\nContext: ...`
5. **Simpler Backend**: No complex interception logic needed

### ⚠️ Trade-offs

1. **Client-Side Trust**: Context injection happens in browser (could be bypassed)
   - Acceptable: This is a user productivity feature, not security control
2. **Code Duplication**: `IsLLMCommand` logic exists in both Go and JavaScript
   - Acceptable: Pattern matching is simple and stable

---

## Updated Implementation Plan

### Phase 3: Frontend Integration (Revised)

1. **Copy LLM detection logic to JavaScript**
   - Create `frontend/src/utils/llmDetection.js`
   - Port `IsLLMCommand()` from Go

2. **Update ForgeTerminal.jsx**
   - Add PTY input interception hook
   - Detect LLM commands before sending to WebSocket
   - Append context conditionally

3. **Testing**
   - Unit tests for JavaScript `isLLMCommand()`
   - E2E Cypress tests:
     - Enable context → type `copilot explain` → verify context appended
     - Enable context → type `ls` → verify NO context appended
     - Command Cards → verify NO context appended

---

## Success Criteria (Updated)

- ✅ Command Cards execute WITHOUT context appended
- ✅ Enter key sends command exactly ONCE
- ✅ Terminal shows clean commands (no context visible)
- ✅ LLM commands receive context (logged client-side)
- ✅ Shell commands bypass context injection
- ✅ No server-side PTY writes for context

---

## Rollback Safety

If frontend implementation fails:
- Backend changes are harmless (just storage, no injection)
- Feature can be disabled by removing frontend interception
- Main branch already has feature fully removed (safe fallback)

---

**Decision**: Proceed with **client-side conditional injection** architecture.
