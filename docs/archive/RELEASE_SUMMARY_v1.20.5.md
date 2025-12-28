# Forge Terminal v1.20.5 - Minor Release

**Release Date:** December 9, 2025

## Overview
Minor patch release implementing Ctrl+V clipboard paste support for terminal.

## What's New

### ✅ Ctrl+V Clipboard Paste Support
- Added custom key event handler to intercept Ctrl+V
- Reads from browser clipboard API (`navigator.clipboard.readText()`)
- Sends pasted text to terminal via WebSocket
- Sanitizes newlines to prevent unintended command execution
- Firefox shows clipboard permission popup on first use (normal security measure)
- Subsequent pastes work without prompts

### Browser Support
- ✅ Firefox: Works with clipboard permission popup
- ✅ Chrome/Chromium: Works directly
- ✅ Safari: Should work (untested)
- ✅ Edge: Should work (untested)

## Technical Details

### Changes
- **frontend/src/components/ForgeTerminal.jsx:** Added Ctrl+V handler (30 lines)
  - Intercepts Ctrl+V keyboard event
  - Reads from navigator.clipboard
  - Sanitizes and sends via WebSocket
  - Proper error handling and logging

- **frontend/src/App.jsx:** Minor adjustment to allow Ctrl+V propagation
  - Returns early for Ctrl+C/V without preventDefault
  - Lets terminal handlers process the events

### Build
- ✅ All 1744 modules transformed
- ✅ Production build generated successfully
- ✅ No compilation errors

## Testing Notes
1. Copy text from outside Forge Terminal
2. Press Ctrl+V in terminal
3. Firefox: Click "Allow" on clipboard permission popup (first time only)
4. Text should paste into terminal

## Known Issues
- If terminal crashes during init: Please report the crash logs
- Firefox clipboard permission persists per origin

## Commits Included
- eb8f98f: Implement Ctrl+V clipboard paste handler via custom key event
- 0f2037c: Simplify Ctrl+C/Ctrl+V handling to work with xterm's native clipboard support
- a18fa88: Enable Ctrl+C and Ctrl+V keyboard copy-paste in terminal

## Installation
Update to v1.20.5 and restart the application.

---
**Status:** Ready for production testing
