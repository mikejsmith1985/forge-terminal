# Release Notes v2.3.4

**Release Date:** December 27, 2025  
**Build:** Production Ready  
**Focus:** Enhanced Debug Panel with Live Monitoring

---

## 🎯 Release Highlights

### Enhanced Debug Panel with Draggable Cards 🐛
Complete rebuild of the debug panel with advanced monitoring capabilities and zero performance impact when collapsed.

**Key Features:**
- **9 Collapsible/Draggable Cards:** Full drag-and-drop reordering with persistent state
- **Live Activity Indicators:** Pulsing green dots show active systems in real-time
- **Smart Performance:** Collapsed cards consume ZERO CPU/memory
- **Recent Logs Feature:** New `getRecentLogs(minutes)` function for time-based log filtering
- **DndKit Integration:** Professional drag-and-drop experience
- **localStorage Persistence:** Card order and collapse state saved across sessions

**Debug Cards:**
1. **Terminal Info** - Tab ID, dimensions, textarea state
2. **WebSocket** - Connection state + message rate (msg/s)
3. **Auto-Respond Monitor** - Live event feed with color coding *(default collapsed)*
4. **Freeze Monitor** - Go runtime metrics: goroutines, heap, GC *(default collapsed)*
5. **Performance** - FPS counter, JS heap memory tracking
6. **Keyboard Events** - Last 20 events with timestamps
7. **Console Logs** - Live stream (last 20 logs, color-coded)
8. **Focus State** - Active element tracking
9. **Viewport** - Window dimensions

**Performance Optimizations:**
- ✅ FPS counter only runs when Performance card expanded
- ✅ WebSocket monitoring only when WS card expanded
- ✅ Keyboard tracking only when Keyboard card expanded
- ✅ 1 second update interval (not per-frame)
- ✅ Only last 3 minutes of data retained

### Logger Enhancement 📝
Added timestamp tracking to console logger for time-based filtering.

**New Features:**
- Each log entry now stores timestamp
- New `getRecentLogs(minutes)` export function
- Backward compatible with existing `getLogs()` function
- Used by Feedback Modal to capture last 3 minutes

---

## 📦 Files Modified

### Frontend Changes
- `frontend/src/components/DebugPanel.jsx` **(COMPLETE REWRITE)**
  - Added DndKit imports for drag-and-drop
  - Implemented `DebugCard` component with collapse/expand
  - Added GripVertical drag handles
  - 9 live monitoring cards with conditional updates
  - localStorage for card order and collapse state
  - Activity indicators with pulse animation

- `frontend/src/utils/logger.js`
  - Enhanced log storage with timestamps
  - Added `getRecentLogs(minutes)` function
  - Returns time-filtered logs for debugging
  - Used by feedback modal and debug panel

- `frontend/package.json`
  - Added @dnd-kit dependencies (core, sortable, utilities)

### Backend Changes
- `internal/updater/updater.go`
  - Version bumped to 2.3.4

### Test Files Added
- `tests/e2e/test-debug-panel-enhanced.spec.js` - Debug panel E2E tests
- `tests/e2e/test-feedback-button.spec.js` - Feedback button tests
- `tests/e2e/test-image-paste-filepath.spec.js` - Image paste tests

### Documentation
- `frontend/src/components/DebugPanel.old.jsx` - Backup of old panel

---

## 🧪 Verification

### Test 1: Drag and Drop Cards
```
1. Enable Dev Mode in Settings
2. Click Debug tab
3. Drag any card using GripVertical handle
4. Drop in new position
5. Refresh page - order persists
```
**✅ VERIFIED:** DndKit integration working

### Test 2: Collapse Performance
```
1. Open Debug panel with all cards expanded
2. Collapse all cards
3. Check CPU usage (Task Manager)
4. Expected: No background updates, minimal CPU
```
**✅ VERIFIED:** Conditional rendering prevents updates when collapsed

### Test 3: Recent Logs Function
```javascript
import { getRecentLogs } from './utils/logger';
const logs = getRecentLogs(3); // Last 3 minutes
```
**✅ VERIFIED:** Timestamp filtering working correctly

---

## 🚀 Deployment

### Build Commands
```bash
# Frontend build
cd frontend && npm run build

# Backend build
go build -ldflags "-X forge-terminal/internal/updater.Version=2.3.4" -o forge-terminal.exe .\cmd\forge
```

### Installation
1. Download `forge-terminal.exe`
2. Enable Dev Mode in Settings
3. Access enhanced Debug panel from sidebar
4. Drag cards to preferred order
5. Collapse unused cards for clean view

---

## 🔄 Breaking Changes
None - fully backward compatible.

---

## 🐛 Known Issues
None identified.

---

## 📝 Migration Notes
- Old debug panel backed up as `DebugPanel.old.jsx`
- Card order/collapse state auto-saved to localStorage
- No user action required for upgrade

---

**Version:** 2.3.4  
**Status:** ✅ Production Ready  
**Previous:** v2.3.3 (getActiveTerminal fix)  
**Next Release:** TBD
