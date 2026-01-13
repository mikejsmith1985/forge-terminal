# Persistent Instruction Slash Command Fix

## Issue
Users reported that persistent instruction injection was interfering with slash commands (e.g., `/model`, `/clear`) when enabled. The injection mechanism was appending instructions to *all* commands, causing slash commands to fail or be malformed.

## Root Cause
In `frontend/src/components/ForgeTerminal.jsx`, a check for "LLM commands" was previously removed to allow injection in interactive modes (like `gh copilot suggest`). However, this removal was too broad and included system/slash commands.

## Fix
Added a specific exclusion for commands starting with `/` in the injection logic.

### File: `frontend/src/components/ForgeTerminal.jsx`

```javascript
// v3.14.6 FIX: Exclude slash commands (e.g. /model, /clear) from injection
if (persistentContextRef.current && 
    persistentContextRef.current.enabled && 
    command &&
    !command.startsWith('/')) { // <-- Added check
```

## Verification
- Normal commands (e.g., `npm run test`) -> Injection continues (if configured)
- Slash commands (e.g., `/model`) -> Injection skipped
- Interactive commands (e.g., `gh copilot suggest`) -> Injection continues (as they don't start with `/`)

## Documentation
Updated `INSTRUCTION_MODE_USAGE_GUIDE.md` to note the exception.
