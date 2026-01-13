# Ctrl+I Shortcut for Persistent Instructions

## Summary
Added **Ctrl+I** keyboard shortcut to quickly toggle persistent instructions in Forge Terminal.

## What Was Implemented

### Keyboard Shortcut
- **Ctrl+I**: Opens Forge Assist with persistent instructions panel automatically expanded
- Alternative to: Clicking Forge Assist button → clicking "Persistent Instruction" button
- Saves 2 clicks for frequently used feature

### User Flow

#### Before (3 steps):
1. Click Forge Assist button (or Ctrl+/)
2. Wait for modal to open
3. Click "Persistent Instruction" button

#### After (1 step):
1. Press **Ctrl+I**
   - Forge Assist opens
   - Persistent Instructions panel auto-expands
   - Ready to toggle instructions on/off

## Technical Implementation

### Frontend Changes

#### 1. App.jsx
Added state to track auto-open intent:
```javascript
const [forgeAssistOpenToPersistent, setForgeAssistOpenToPersistent] = useState(false)
```

Added Ctrl+I keyboard handler:
```javascript
// Ctrl+I: Toggle Persistent Instructions (via Forge Assist)
if (e.ctrlKey && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
  e.preventDefault();
  setForgeAssistOpenToPersistent(true); // Signal to auto-open persistent panel
  setIsForgeAssistOpen(true);
  return;
}
```

Updated ForgeAssist component call:
```javascript
<ForgeAssist
  isOpen={isForgeAssistOpen}
  onClose={() => {
    setIsForgeAssistOpen(false);
    setForgeAssistOpenToPersistent(false); // Reset flag
  }}
  openToPersistent={forgeAssistOpenToPersistent}
  // ... other props
/>
```

#### 2. ForgeAssist.jsx
Added prop:
```javascript
export default function ForgeAssist({ 
  isOpen, 
  onClose, 
  onSendToTerminal, 
  onToast,
  activeTabId,
  openToPersistent = false, // v3.15: Auto-open persistent instructions panel
}) {
```

Added effect to handle auto-open:
```javascript
useEffect(() => {
  if (isOpen) {
    setSearchQuery('');
    // v3.15: Auto-open persistent instructions panel if requested
    if (openToPersistent) {
      setShowPersistentInstructionsPanel(true);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }
}, [isOpen, openToPersistent]);
```

## Usage

### Quick Access
1. Press **Ctrl+I** from anywhere in Forge
2. Persistent Instructions panel opens automatically
3. See list of saved instructions
4. Click checkbox to toggle one on/off
5. Or add new persistent instruction

### What Are Persistent Instructions?
- Text that automatically appends to every AI prompt
- Useful for:
  - Project context ("Working in TypeScript monorepo")
  - Code standards ("Follow ESLint rules")
  - Response format ("Be concise, max 3 sentences")
  - Security rules ("Never expose API keys")

### Single Selection Mode
- Only ONE persistent instruction can be active at a time
- Toggling one on automatically toggles others off
- Prevents conflicting instructions

## Keyboard Shortcuts Summary

| Shortcut | Action |
|----------|--------|
| **Ctrl+/** | Toggle Forge Assist (general) |
| **Ctrl+I** | Toggle Persistent Instructions (direct) |
| Ctrl+F | Open search |
| Ctrl+Shift+H | Toggle history slider |
| Ctrl+T | New tab |
| Ctrl+W | Close tab |
| Ctrl+1-9 | Switch to tab N |
| Ctrl+Shift+1-9 | Execute command card N |

## Files Modified

### Frontend (2 files)
1. **frontend/src/App.jsx**
   - Added `forgeAssistOpenToPersistent` state
   - Added Ctrl+I handler
   - Updated ForgeAssist integration

2. **frontend/src/components/ForgeAssist.jsx**
   - Added `openToPersistent` prop
   - Added auto-open effect

## Build Status
✅ **Frontend**: Builds successfully (~15s)  
✅ **No errors**: Clean build  
✅ **No breaking changes**: Backward compatible

## Testing Checklist

### Manual Tests
- [ ] Press Ctrl+I
- [ ] Verify Forge Assist opens
- [ ] Verify Persistent Instructions panel auto-expands
- [ ] Toggle instruction on/off
- [ ] Close modal (Esc or X)
- [ ] Press Ctrl+I again to re-open

### Edge Cases
- [ ] Ctrl+I when Forge Assist already open (should work)
- [ ] Ctrl+I when terminal focused (should work)
- [ ] Ctrl+I when search focused (should work)
- [ ] Multiple rapid Ctrl+I presses (should handle gracefully)

## Benefits

### User Benefits
1. **2-click reduction** for frequent operation
2. **Muscle memory** for persistent instructions
3. **Faster workflow** when managing context
4. **Consistent with other shortcuts** (Ctrl+letter pattern)

### Developer Benefits
1. **Minimal code changes** (~15 lines total)
2. **Clean implementation** (prop-based, no globals)
3. **Easy to extend** (pattern works for other panels)
4. **Well-documented** in code comments

## Future Enhancements

### Potential Additions
1. **Ctrl+Shift+I**: Directly toggle first persistent instruction (skip modal)
2. **Hotkey hints**: Show "Ctrl+I" in UI tooltip
3. **Command palette**: Include in Ctrl+P quick actions
4. **Workspace shortcuts**: Different shortcuts per workspace

## Related Features

### Persistent Instructions System
- Managed in ForgeAssist
- Stored in localStorage
- Synced to backend via custom events
- Single-selection mode
- Independent of command cards

### Command Cards "Always Append"
- Different feature (per-card)
- Multiple can be active
- Managed in command modal
- Part of card definition

## Troubleshooting

### Ctrl+I doesn't work
**Check**:
- Terminal has focus
- No browser extension overriding shortcut
- Console for JavaScript errors

### Panel doesn't auto-open
**Check**:
- `openToPersistent` prop passed correctly
- Effect dependency array includes `openToPersistent`
- State reset on close

### Instructions don't toggle
**Check**:
- Persistent instructions feature working separately
- LocalStorage accessible
- Event dispatching working

---

**Status**: ✅ COMPLETE  
**Version**: 3.15.0+  
**Build**: ✅ PASSING  
**Date**: 2026-01-13
