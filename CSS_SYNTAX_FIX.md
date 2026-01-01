# CSS Syntax Error Fix - Instruction Mode Button

## Problem
The Instruction Mode button was completely missing from the UI after the latest changes.

## Root Cause
**CSS Syntax Error** in `frontend/src/components/ForgeAssist.css`

There was an extra closing brace `}` at line 366 that broke the CSS parsing:

```css
.forge-assist-hint kbd {
  background: #1a1a1a;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #333;
  font-family: monospace;
  font-size: 0.7rem;
}
}  ← EXTRA BRACE - SYNTAX ERROR!

.forge-assist-item.selected {
  ...
}
```

This syntax error caused the CSS parser to fail, which prevented all subsequent CSS rules from being applied, hiding the button.

## Solution
Removed the extra closing brace at line 366.

## Additional Issues Fixed
1. **Duplicate footer CSS**: The `.forge-assist-footer` class was defined twice
   - Lines 340-356: Original definition
   - Lines 445-459: Duplicate definition
   
   Kept the original definition and updated `justify-content` to `space-between` to accommodate the new split layout (hints on left, contextual message on right).

2. **Removed orphaned code**: Cleaned up duplicate CSS rules and unused empty state definitions.

## Files Modified
- `frontend/src/components/ForgeAssist.css`

## Verification
The Instruction Mode button should now be visible in the Power Features header:
- **OFF state**: Gray button with "📄 Instructions" label
- **ON state**: Purple button with "📄 Instructions ON" label + "Edit" button

## Testing
Rebuild the dev instance and the button should appear in the top-right area of the Power Features modal, next to the close button.

```bash
npm run dev  # or your build command
```

The button should be prominently displayed next to the CLI tabs in the header.
