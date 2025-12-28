# Manual Auto-Respond Test Plan

## Purpose
Verify if auto-respond is actually broken or if there's a testing/verification issue.

## Test Steps

### 1. Start Forge Terminal
```powershell
.\forge-terminal.exe
```

### 2. Enable Auto-Respond
- Right-click on the terminal tab
- Click "Auto-respond" to enable it
- Look for confirmation toast

### 3. Trigger a CLI Prompt
Test with GitHub Copilot CLI:
```powershell
gh copilot suggest "list files"
```

Expected: When the prompt appears with ❯ Yes selected, it should automatically send Enter

### 4. Test with npm
```powershell
# In a test project
npm init
```

Expected: Should auto-respond to yes/no prompts

### 5. Check Debug Info
- Open browser DevTools (F12)
- Watch Console for:
  - "detectCliPrompt" messages
  - WebSocket send events
  - "waiting" state changes

## What to Look For

### If Working:
- Auto-respond toggle shows checkmark
- Prompts are automatically answered
- No manual Enter needed

### If Broken:
- Toggle appears enabled but doesn't respond
- Prompts appear but require manual Enter
- Console shows detection but no WebSocket send

## Known Issues from Past 72 Hours

1. **Starvation Bug (e9c25c3)**: Fixed - detection was being cancelled during continuous output
2. **Confidence Filter (bbeaf09)**: Removed - was blocking low-confidence detections  
3. **Syntax Error (ffd5119)**: Fixed - missing closing brace

## Current Code State
- Auto-respond code: lines 1132-1144 in ForgeTerminal.jsx
- Starvation fix: lines 1090-1097
- Tests: 20/20 passing in promptDetection.test.js

## Investigation Questions

1. Is auto-respond toggle actually persisting?
2. Is WebSocket connection stable?
3. Is the buffer being cleared too aggressively?
4. Is there a timing issue between detection and send?
5. Is the issue only with certain types of prompts?
