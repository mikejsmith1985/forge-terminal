# 🔥 Forge Terminal v2.3.7

## Critical Bug Fix Release

This release restores the Artificial Memory (AM) system that was inadvertently disabled by default configuration.

---

## 🚨 Critical Fix

### AM System Restored
- **Fixed:** AM system defaulting to disabled, preventing session capture
- **Impact:** 13+ days of missing conversation logs and context
- **Root Cause:** Both frontend and backend defaults were set to `false`
- **Resolution:** Changed defaults to `true` for legal compliance and functionality

**Before:**
```
[Terminal] AM is ENABLED for tab - initializing LLM Logger
[Terminal] NO LLM logger available for tabID: xxx
```

**After:**
```
[Terminal] AM is ENABLED for tab - initializing LLM Logger
[Terminal] Using LLM logger for tabID: xxx, activeConv: yyy
```

---

## 📝 Changes

### Frontend
- Changed `amDefaultEnabled` default from `false` to `true` in `App.jsx`
- New tabs now automatically enable AM capture
- Existing users: Check Settings if AM still disabled

### Backend Config
- Default `amEnabled: true` now properly used for new installations
- **Existing users:** If you have `~/.forge/terminal/config.json`, ensure `"amEnabled": true`
- Or delete the config file to reset to system defaults

### CSS
- Improved modal scrolling with `min-height: 0` on `.modal-body`

---

## 🔍 For Existing Users

If AM is not working after updating:

1. Open Settings (gear icon)
2. Check **AM Master Control** is enabled (green toggle)
3. Check **AM Default for New Tabs** is enabled
4. Or delete `~/.forge/terminal/config.json` and restart

---

## 📦 Installation

**Windows:**
Download `forge-v2.3.7-windows-amd64.exe` and run.

---

## 🔗 Full Details

See `RELEASE_SUMMARY_v2.3.7.md` and `AM_LOGGER_DIAGNOSTIC_REPORT_2025-12-27.md` for complete investigation and fix details.

---

**Full Changelog:** https://github.com/mikejsmith1985/forge-terminal/compare/v2.3.6...v2.3.7
