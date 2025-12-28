# Release Summary v3.3.9

## 🐛 Bug Fixes

### Auto Respond
- **Fixed Prompt Detection**: Resolved an issue where the "Continue/Exit" menu prompt was not being detected, preventing auto-response from working correctly. Added support for `> Continue` pattern.

### Command Cards
- **System Cards Restored**: Fixed a regression where system command cards (Release Manager, Git Status, Build Project) were hidden from the UI.
- **Protection Added**: Added safeguards to prevent accidental deletion or editing of system-defined cards.

### Terminal Tabs
- **Theme Fallback**: Fixed a visual bug where terminal tabs could appear transparent or broken if the selected theme or mode configuration was missing. Added robust fallbacks to 'molten' theme and 'dark' mode.

## ⚡ Performance Improvements

### AM Logging Optimization
- **Freeze Fix**: Eliminated UI freezes caused by the Artificial Memory (AM) logging system processing extremely large terminal outputs.
- **Buffer Management**: Implemented smart buffer slicing to ensure regex operations always run in <1ms, regardless of output volume.
- **Memory Protection**: Added caps to input and output buffers to prevent memory bloat during long sessions.
