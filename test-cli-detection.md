# CLI Detection Fix - Manual Test Plan

## Issue
Persistent instruction was injecting into **all** commands, including shell commands like launching the CLI tool itself (e.g., `gh copilot`).

## Fix Applied
**File**: `frontend/src/components/ForgeTerminal.jsx` (lines 1633-1690)

**Change**: Added CLI detection check using `detectCliPrompt()` before injecting persistent context.

**Logic**:
```javascript
const currentBuffer = outputBufferRef.current?.data || '';
const { waiting } = detectCliPrompt(currentBuffer, false);

// Only inject if CLI tool is actively waiting for input
if (persistentContextRef.current && 
    persistentContextRef.current.enabled && 
    command &&
    !command.startsWith('/') &&
    waiting) {  // NEW CHECK
  // ... injection logic
}
```

## Test Cases

### ✅ Test 1: Shell Command (Should NOT inject)
1. Enable persistent instruction: Ctrl+I → Add instruction "follow @instructions"
2. Type shell command: `gh copilot`
3. Press Enter
4. **Expected**: Command executes normally WITHOUT appending context
5. **Console log**: `[ContextInjection] Shell command (no CLI tool waiting), no injection: gh copilot`

### ✅ Test 2: CLI Tool Active (Should inject)
1. Launch CLI: `gh copilot`
2. Wait for prompt: `? Ask Copilot: `
3. Type: `how do I list files`
4. Press Enter (first time)
5. **Expected**: Appends " follow @instructions" to the line WITHOUT executing
6. **Console log**: `[ContextInjection] CLI tool detected, appending context, waiting for confirmation...`
7. Press Enter (second time)
8. **Expected**: Command executes with context
9. **Console log**: `[ContextInjection] Context already present, executing...`

### ✅ Test 3: Persistent Context Disabled (Should NOT inject)
1. Disable persistent instruction: Ctrl+I → Toggle off
2. Launch CLI: `gh copilot`
3. Type at prompt: `test query`
4. Press Enter
5. **Expected**: Command executes normally
6. **Console log**: `[ContextInjection] Persistent context disabled, no injection`

### ✅ Test 4: Slash Command (Should NOT inject)
1. Enable persistent instruction
2. In CLI, type: `/model`
3. Press Enter
4. **Expected**: Command executes normally (slash commands excluded)

### ✅ Test 5: Low Confidence False Positive (Should NOT inject)
1. Ensure persistent instruction is enabled.
2. Run a command that outputs text resembling a prompt but isn't one (e.g. `echo "Use > Yes to confirm"`).
3. Type another command.
4. **Expected**: No injection. (Fixed in v3.16.3 by ignoring low-confidence CLI detection).

## Technical Details

**Detection Function**: `detectCliPrompt(text, debugLog)`
- Returns: `{ waiting: boolean, responseType, confidence, excluded }`
- **Updated Logic (v3.16.3)**: 
  - Low confidence detections (e.g. `> Yes` without context) now return `waiting: false`.
  - Added specific support for `Copilot` and `Claude` brand indicators to boost confidence to 'medium' even without other context.
  - Constrained detection to last 15 lines of buffer to prevent history false positives.
- Patterns detected:
  - Menu-style prompts (❯ Yes, numbered options)
  - Y/N prompts
  - TUI frames (box drawing characters)
  - Tool permission prompts

**Buffer**: Uses `outputBufferRef.current.data` (last 800 chars of terminal output)

## Validation
- [x] Build successful
- [ ] Manual test: Shell command
- [ ] Manual test: CLI tool active
- [ ] Manual test: Context disabled
- [ ] Manual test: Slash command
