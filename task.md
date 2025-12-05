# Current Task: v1.5.0 Release

## Status
- [x] **Issue #1: Project Scaffold**
- [x] **Issue #2: PTY Backend**
- [x] **Issue #3: Commands API**
- [x] **Issue #4: Frontend**
- [x] **Issue #5: Polish & Release**
- [x] **v1.5.0 Features**
  - [x] Session Persistence (tabs restore on refresh/restart)
  - [x] Terminal Search (Ctrl+F with prev/next navigation)

## v1.5.0 Implementation Details

### Session Persistence
- Added `/api/sessions` endpoint (GET/POST)
- Sessions saved to `~/.forge/sessions.json`
- Tabs (id, title, shellConfig, colorTheme) and activeTabId persisted
- Debounced save (500ms) on tab changes
- Auto-restore on page load

### Terminal Search
- Added `@xterm/addon-search` dependency
- SearchBar component with Ctrl+F shortcut
- Prev/Next navigation (Enter/Shift+Enter)
- Match highlighting with no-results indicator
- Escape to close

## Next Steps
- Tag and release v1.5.0
- Push to GitHub to trigger release workflow
