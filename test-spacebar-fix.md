# Manual Test Plan: Spacebar Fix

## Test 1: Fresh Load
1. **Kill** any running Forge Terminal instances
2. Start: `./forge` or `make dev`
3. Wait for app to fully load
4. **Immediately** click in terminal and press spacebar
5. ✅ **Expected:** Space character appears
6. ❌ **Bug:** Nothing happens (need to refresh)

## Test 2: Console Debug Logs
Open DevTools Console and check for:
```
[Terminal] activeElement after init: xterm-helper-textarea
[Terminal] Space keydown at: xterm-helper-textarea
```

If you see different elements, that's the problem source.

## Test 3: Tab Switch
1. Open terminal
2. Click outside the terminal area (sidebar, tab bar, etc.)
3. Click back into terminal
4. Press spacebar
5. ✅ **Expected:** Works immediately

## Test 4: Window Blur/Focus
1. Terminal open and working
2. Click outside browser (different app/window)
3. Click back into browser
4. Press spacebar in terminal
5. ✅ **Expected:** Works immediately

## Test 5: Vision Overlay (Dev Mode only)
1. Enable Dev Mode in Settings
2. Enable Vision feature for a tab
3. Trigger a vision overlay (e.g., git status)
4. Dismiss overlay (Esc or click outside)
5. Press spacebar in terminal
6. ✅ **Expected:** Overlay doesn't block keyboard

## What to Check if Still Broken

### Console Logs Show Wrong Element
```
[Terminal] activeElement after init: BODY
```
→ Something is stealing focus **after** initialization. Check for modals/overlays.

### No Console Logs at All
```
(nothing)
```
→ Event listeners not attached. Check that file saved correctly and rebuild ran.

### Spacebar Works After Click But Not After Load
→ Initial focus is failing. The queueMicrotask/RAF pattern should fix this.

## Rollback
If this breaks something:
```bash
cd /home/mikej/projects/forge-terminal
git checkout HEAD -- frontend/src/components/ForgeTerminal.jsx
cd frontend && npm run build
```

## Success Criteria
- [ ] Spacebar works on fresh load (no refresh needed)
- [ ] Spacebar works after tab switch
- [ ] Spacebar works after window blur/focus
- [ ] Console shows correct activeElement (xterm textarea)
- [ ] Vision overlay doesn't block keyboard
- [ ] Ctrl+C copy still works
- [ ] Ctrl+V paste still works
- [ ] No regressions in existing functionality

## Debug Mode
If you need more verbose logging, uncomment the debug sections in ForgeTerminal.jsx:
- Line ~670: `console.log('[Terminal] activeElement after init: ...')`
- Line ~770: `console.log('[Terminal] Space keydown at: ...')`

These can be removed once issue is confirmed fixed.
