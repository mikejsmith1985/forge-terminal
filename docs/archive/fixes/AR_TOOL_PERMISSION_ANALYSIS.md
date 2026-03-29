# PromptDetector AR Issue Analysis

## Problem
Auto-Respond (AR) works with `copilot --allow-all-tools` but fails without it.

## Root Cause
When Copilot runs **without** `--allow-all-tools`, it shows **tool permission prompts** that are NOT detected by our PromptDetector patterns.

### Current Patterns (working for execution prompts)
Located in `ForgeTerminal.jsx` lines 112-200:

```javascript
const MENU_SELECTION_PATTERNS = [
  /[›❯>]\s*1\.\s*Yes\b/i,
  /[›❯>]\s*Yes\b/i,
  /[›❯>]\s*Run\s+this\s+command/i,
  /[●◉✓✔]\s*Yes\b/i,
];

const MENU_CONTEXT_PATTERNS = [
  /Confirm with number keys or.*Enter/i,
  /use.*arrow.*keys.*select/i,
  /Do you want to run this command\??/i,
  /Do you want to run\??/i,
  /Cancel with Esc/i,
];
```

### Missing Patterns (tool permission prompts)
These prompts appear when Copilot asks for permission to use tools:

```
Expected format:
❯ Allow tool: bash
  Deny
  
Allow this tool? (y/n):

OR

❯ 1. Allow bash to execute commands
  2. Deny
  
Confirm with number keys or press Enter
```

## Solution
Add detection patterns for tool permission prompts to `ForgeTerminal.jsx`.

### New Patterns Needed:

```javascript
// Tool permission prompts (Copilot without --allow-all-tools)
const TOOL_PERMISSION_PATTERNS = [
  // "Allow tool: bash" style
  /[›❯>]\s*Allow tool:\s*\w+/i,
  /[›❯>]\s*Allow\s+\w+/i,
  
  // "Allow this tool?" style
  /Allow\s+this\s+tool\?/i,
  /Allow\s+\w+\s+to\s+execute/i,
  /Grant\s+permission/i,
  
  // Numbered menu for tool permission
  /[›❯>]\s*\d+\.\s*Allow\s+\w+/i,
  
  // Tool authorization context
  /tool.*authorization/i,
  /requires.*permission/i,
];
```

### Why `--allow-all-tools` Works
With this flag, Copilot **skips** all tool permission prompts and only shows execution confirmation prompts, which our PromptDetector already handles.

### Why Without Flag Fails
Without the flag:
1. Copilot shows tool permission prompt
2. PromptDetector doesn't recognize it
3. AR never fires
4. User must manually respond
5. THEN Copilot shows execution prompt (which AR would detect)

## Test Case Needed
Create Playwright test that:
1. Runs `copilot` without `--allow-all-tools`
2. Captures the tool permission prompt
3. Verifies PromptDetector identifies it
4. Verifies AR responds with Enter or Y

## Files to Modify
1. `frontend/src/components/ForgeTerminal.jsx` - Add TOOL_PERMISSION_PATTERNS
2. `frontend/src/utils/promptDetection.test.js` - Add test cases
3. `tests/playwright/critical-app-failures.spec.js` - Add E2E test
