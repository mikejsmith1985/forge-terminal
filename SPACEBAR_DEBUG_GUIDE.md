# Spacebar Issue - Debugging Guide

## Current Status (v1.22.19)

**Fixes Applied:**
- ✅ v1.22.17: WelcomeModal event listener cleanup (prevents stale listener)
- ✅ v1.22.18: Enhanced diagnostics (textarea count, overlays, iframe detection)
- ✅ v1.22.19: Race condition fix (deep copy for async conversation saves)

**Problem:** Spacebar still not working

## Debugging Steps

### 1. Browser Console Debug Script

Paste this into your browser console:

```javascript
// Copy contents of debug-spacebar.js
```

Or run from file:
```bash
cat /home/mikej/projects/forge-terminal/debug-spacebar.js
```

### 2. Check for Symptoms

**If spacebar doesn't work at ALL:**
- Likely: Document-level event listener calling preventDefault()
- Check: Are other keys working? (letters, numbers, backspace)

**If spacebar works intermittently:**
- Likely: Focus issue or overlay blocking
- Check: Does clicking terminal fix it?

**If spacebar works after refresh:**
- Likely: Stale event listener from modal/component
- Check: Did you open any modals before it stopped working?

### 3. Common Root Causes

#### A. Event Listener Bugs (FIXED in v1.22.17)
- WelcomeModal had stale listener
- ConversationViewer had same pattern (also fixed)
- **Check:** Other components might have same bug

#### B. VisionOverlay (POTENTIAL ISSUE)
File: `/frontend/src/components/vision/VisionOverlay.jsx`
- Has document-level keydown listener
- **DOES NOT** call preventDefault on Space
- **BUT** has same cleanup pattern as WelcomeModal had

#### C. Overlay with pointer-events
- Transparent overlay covering terminal
- Diagnostics should show this in "overlappingElement"

#### D. Focus Loss
- activeElement becomes BODY instead of xterm-helper-textarea
- Fixed in v1.22.16 but might not be the real issue

### 4. What to Check Next

Run diagnostics (click bug icon in lower-left):
1. **XTerm Health Section:**
   - Textareas: Should be 1
   - Overlapping element: Should be null
   - iframe: Should be false

2. **Recent Events:**
   - Should show Space keydown/keyup events
   - Check if they reach TEXTAREA target

3. **Focus State:**
   - activeElement: Should be TEXTAREA (when typing)
   - If BODY: focus issue
   - If something else: overlay or modal blocking

### 5. Nuclear Option

If all else fails:
```bash
# Clear all browser state
rm -rf ~/.config/google-chrome/Default/Local\ Storage/leveldb/
# Or clear site data in DevTools > Application > Storage

# Clear forge state
rm -rf ~/.forge/am/*.json
mv ~/.forge/corrupted-* /tmp/ 2>/dev/null

# Full rebuild
cd ~/projects/forge-terminal
rm -rf frontend/node_modules/.vite
npm run build --prefix frontend
go build -o bin/forge ./cmd/forge
./bin/forge
```

### 6. Report Back

When reporting, include:
1. Output from debug-spacebar.js
2. Screenshot of diagnostics panel
3. Exact steps to reproduce
4. Does it work after refresh? After clicking terminal?

