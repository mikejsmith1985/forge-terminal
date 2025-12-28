# Forge Terminal v1.20.9 - Enhancement Release

**Release Date:** December 9, 2025  
**Commit:** 8f4ca51

## Overview
Enhancement release introducing visual improvements with a striking "bead of light" animation on the active tab for maximum clarity and visual feedback.

## What's New

### ✨ Rotating Bead of Light Animation on Active Tab
- **Visual Enhancement:** Active tab now displays a rotating border gradient animation
- **3-Second Rotation Cycle:** Smooth, non-distracting animation that continuously rotates around the tab perimeter
- **Theme-Aware Colors:** Uses the active tab's accent color + complementary accent secondary color
- **Pure CSS Implementation:** No JavaScript overhead, fully hardware-accelerated
- **Works in All Modes:** Seamlessly adapts to both light and dark theme modes

### Implementation Details

#### Animation Architecture
- **CSS Conic Gradient:** Creates a smooth rotating gradient border effect
- **Mask Composite:** Renders only the border outline, keeping the tab interior clean
- **Non-Intrusive:** Pseudo-element (::before) doesn't interfere with tab interactions
- **Hardware Acceleration:** Leverages GPU for smooth 60fps animation

#### Visual Specifications
- **Animation Duration:** 3 seconds per complete rotation
- **Timing Function:** Linear (consistent, predictable motion)
- **Border Width:** 1px (subtle yet visible)
- **Color Gradient:** Primary accent → Secondary accent → Primary accent
- **Border Radius:** Matches tab shape (6px rounded top, square bottom)

## Technical Details

### Changes
- **frontend/src/index.css:** Added bead of light animation
  - New `@keyframes tab-bead-of-light` animation (10 lines)
  - Enhanced `.tab.active` with `position: relative` (1 line)
  - New `.tab.active::before` pseudo-element styling (24 lines)
  - Total: 35 lines added, 0 lines removed

### Build Status
- ✅ All 1744 modules transformed
- ✅ Production build successful
- ✅ CSS validates correctly
- ✅ No compilation or rendering errors
- ✅ Assets: 43.30 kB CSS (gzip: 9.49 kB), 928.35 kB JS (gzip: 247.64 kB)

## Browser Compatibility

- ✅ **Chrome/Chromium 85+** - Full support
- ✅ **Firefox 88+** - Full support
- ✅ **Safari 14.1+** - Full support
- ✅ **Edge 85+** - Full support

**CSS Features Used:**
- `conic-gradient` (widespread support)
- `mask-composite` (with -webkit- prefix for compatibility)
- CSS keyframe animations (universally supported)

## Performance Impact

- **CPU Usage:** Minimal - pure CSS animation
- **GPU Usage:** Efficient - hardware-accelerated transform
- **Memory:** No additional state required
- **Battery Impact:** Negligible (runs only on active tab)
- **Rendering:** Target 60fps smooth animation

## User Experience

- **Visibility:** Striking visual indicator for active tab clarity
- **Non-Intrusive:** Smooth animation doesn't distract from work
- **Intuitive:** Immediately clear which tab is active
- **Responsive:** Instantly updates when switching tabs
- **Adaptive:** Respects theme colors and user's color preferences

## Testing

✅ CSS animation renders correctly  
✅ No conflicts with existing tab styles  
✅ Integrates seamlessly with tab-activate-pulse animation  
✅ Works correctly in light and dark modes  
✅ No performance degradation detected  
✅ Tab interactions unaffected (close button, context menu, rename)

## What's Included

### Enhanced Tab Bar
- Active tabs now feature a continuous rotating "bead of light" border animation
- Improved visual hierarchy and clarity of tab states
- Smooth, polished UI experience
- Theme-responsive color integration

## Testing Notes

1. Open Forge Terminal and create or activate multiple tabs
2. Observe the active tab border - you'll see a rotating gradient animation
3. Switch between tabs to see the animation update instantly
4. The animation complements existing tab scale and glow effects
5. No performance impact noticed even with many tabs open

## Known Limitations

- Animation is continuous (no option to disable in v1.20.9 - can be added in future)
- Relies on CSS conic-gradient support (not available in very old browsers)

## Future Enhancements (Planned)

- [ ] User settings toggle to enable/disable animation
- [ ] Configurable animation speed (Slow/Medium/Fast presets)
- [ ] Alternative animation patterns
- [ ] Performance mode for low-power devices

## Commits Included

- `8f4ca51`: feat: Add rotating bead of light animation to active tab

## Installation

Update to v1.20.9 and restart the application. The bead of light effect will be immediately visible on the active tab.

```bash
# Update from v1.20.8 to v1.20.9
forge update
# or restart the application
```

## Changelog Summary

- **Added:** Rotating bead of light animation on active tab
- **Enhanced:** Visual clarity of active tab indicator
- **Improved:** Overall UI polish and visual hierarchy
- **Maintained:** Full backward compatibility with existing features

---

**Status:** ✅ Ready for production  
**Stability:** Stable - Pure CSS enhancement, no behavioral changes  
**Breaking Changes:** None
