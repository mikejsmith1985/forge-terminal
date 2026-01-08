# Quick Instruction Activation Fix v3.13.0

## Issue
In production v3.13.0, the Quick Instruction collapsed bar was not visible, even after enabling the feature in Settings.

## Root Cause
The `QuickInstructionBar` component visibility was controlled by **two conditions**:
```jsx
isEnabled={quickInstructionEnabled && showQuickInstruction}
```

This meant:
1. `quickInstructionEnabled` = Setting toggle (from Settings panel)
2. `showQuickInstruction` = Ctrl+I keyboard shortcut state

The bar only appeared when BOTH were true. But `showQuickInstruction` defaults to `false`, so even if you enabled it in Settings, the collapsed bar never showed up.

## Fix Applied

### Changed Component Props
**Before:**
```jsx
<QuickInstructionBar
  isEnabled={quickInstructionEnabled && showQuickInstruction}
  ...
/>
```

**After:**
```jsx
<QuickInstructionBar
  isEnabled={quickInstructionEnabled}
  isExpanded={showQuickInstruction}
  onOpen={() => setShowQuickInstruction(true)}
  onClose={() => setShowQuickInstruction(false)}
  ...
/>
```

### Behavior Change
- **`isEnabled`**: Controls whether the component renders at all (from Settings)
- **`isExpanded`**: Controls whether the bar is collapsed or expanded (from Ctrl+I)
- **Collapsed bar**: Always visible when enabled in Settings
- **Expanded bar**: Shows when Ctrl+I is pressed or collapsed bar is clicked

### Files Modified
1. `frontend/src/App.jsx` - Updated props passed to QuickInstructionBar
2. `frontend/src/components/QuickInstructionBar.jsx` - Separated isEnabled from isExpanded logic

## Result
✅ Enable Quick Instructions in Settings → Collapsed bar appears immediately  
✅ Press Ctrl+I → Bar expands  
✅ Click collapsed bar → Bar expands  
✅ Press Escape → Bar collapses (stays visible)  
✅ Disable in Settings → Bar disappears completely

## Testing
1. Open Settings → Quick Instructions
2. Toggle "Enable Quick Instruction Bar"
3. **Expected:** Collapsed purple bar appears above Forge Assist button
4. Press Ctrl+I or click the bar
5. **Expected:** Bar expands with input fields

## Build Info
- Frontend rebuilt: v3.13.0
- Backend rebuilt: fterm.exe
- Files updated: 2
- Build time: ~15 seconds

## Deployment
Production binary `fterm.exe` has been rebuilt with the fix.
Restart the application to see the changes.
