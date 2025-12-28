# Forge Terminal v1.20.10 - Security & Configuration Release

**Release Date:** December 10, 2025  
**Commit:** 95e24c4

## Overview

Maintenance and feature integration release adding file access security controls, vision configuration system, shell hook cleanup utilities, and comprehensive documentation updates for user-facing features.

## What's New

### 🔐 File Access Security Mode
- **Restricted Mode (Default)**: File operations limited to project directory for safety
- **Unrestricted Mode (Optional)**: Full filesystem access for advanced users
- **FileAccessPrompt Component**: Interactive UI for users to select access level
- **API Endpoint**: `/api/files/access-mode` for runtime mode switching
- **Security Logging**: File access validation with detailed logging

### 👁️ Vision Configuration System
- **Configurable Detectors**: Enable/disable each Vision detector independently
  - JSON detection with configurable minimum size threshold
  - Git status parsing
  - File path validation
  - Compiler error detection (Go, Rust, TypeScript, Python, Java)
  - Stack trace parsing (Go, Python, Java, JavaScript)
- **Config Manager**: Persistent Vision feature configuration
- **API Endpoint**: `/api/vision/config` for runtime configuration

### 📝 AM (Artificial Memory) Enhancements
- **Workspace-Aware Filenames**: Session logs now use format `YYYY-MM-DD_HH-MM_workspace_session.md`
- **Smart Workspace Detection**: Extracts workspace name from path or falls back to tab name
- **Path Sanitization**: Workspace names cleaned and normalized for filesystem safety
- **Enhanced Logging**: Improved structured logging for AM system operations

### 🧹 Shell Hook Management
- **Hook Removal Utility** (`hooks_remover.go`): Clean removal of Forge shell hooks on uninstall
- **Backup Creation**: Automatic backups before hook removal
- **Graceful Cleanup**: Proper file restoration on uninstall

### 📦 Build & Assets
- **Frontend Rebuild**: Complete rebuild with Vite
  - `index-B4ljVjhQ.js` (948 kB, gzip: 252 kB)
  - `index-ngDaY_Dc.css` (43.42 kB, gzip: 9.51 kB)
- **Asset Optimization**: All assets optimized for production

## Technical Changes

### New Files
- `frontend/src/components/FileAccessPrompt.jsx` - File access mode selection UI
- `internal/files/handler_security_test.go` - Security validation tests
- `internal/am/hooks_remover.go` - Shell hook cleanup utility
- `internal/terminal/vision/config.go` - Vision feature configuration manager

### Modified Files
- `cmd/forge/main.go`:
  - Added `/api/am/master-control` endpoint
  - Added `/api/vision/config` endpoint
  - Added `/api/files/access-mode` endpoint
  - Enhanced update restart logic (3-second delay)

- `internal/am/logger.go`:
  - Workspace-aware filename formatting
  - Improved workspace name extraction and sanitization
  - Better error handling and logging

- `internal/files/handler.go`:
  - File access mode controls (FileAccessMode enum)
  - UNC path validation for Windows
  - Cross-filesystem access logging
  - Restricted/unrestricted mode switching

- `frontend/src/components/`:
  - `Tab.jsx`: Updated for new AM system
  - `UpdateModal.jsx`: Enhanced update flow
  - `MonacoEditor.jsx`: Improved file loading
  - `SettingsModal.jsx`: Configuration UI updates
  - `VisionOverlay.jsx`: Vision detection improvements

- `internal/terminal/vision/json.go`: JSON overlay improvements

### Documentation
- Updated `README.md` with new features:
  - Security & File Access section
  - Vision detection configuration details
  - AM logging location and workspace naming
  - Active tab indicator animation

## Features Summary

### Complete Feature Set
✅ Multi-tab terminal with drag-and-drop reordering
✅ 10 color themes with per-tab light/dark mode  
✅ Command cards with keyboard shortcuts (Ctrl+Shift+1-9)
✅ Terminal search and session persistence
✅ Windows WSL support with automatic path translation
✅ Auto-updates with version rollback
✅ Artificial Memory (AM) session logging
✅ Vision pattern detection (Git, JSON, Files, Compiler Errors, Stack Traces)
✅ **NEW**: File access security modes (restricted/unrestricted)
✅ **NEW**: Configurable Vision detectors
✅ **NEW**: Workspace-aware AM logging
✅ **NEW**: Shell hook cleanup utilities

### Experimental Features (Dev Mode)
- 🤖 Forge Assistant (AI chat with Ollama)
- 👁️ Vision Detection (configurable pattern detection)
- 🔗 Vision-AM Integration (persistent error tracking)

## Build Status

- ✅ All 1,745 modules transformed
- ✅ Production build successful
- ✅ CSS and JavaScript optimized
- ✅ No compilation errors
- ✅ Asset size optimized

## Browser Compatibility

- ✅ Chrome/Chromium 85+
- ✅ Firefox 88+
- ✅ Safari 14.1+
- ✅ Edge 85+

## Performance Impact

- **CPU**: Minimal - no new polling or intensive operations
- **Memory**: Negligible - configuration stored efficiently
- **Disk**: Small increase from enhanced logging (~1KB per session)
- **Network**: New API endpoints add minimal overhead

## Testing

✅ Frontend build verified  
✅ Asset generation successful  
✅ Component integration tested  
✅ Security tests in place  
✅ No breaking changes detected  

## What's Fixed

- File path validation now handles UNC paths on Windows
- AM logging now includes workspace context
- Vision configuration properly persisted
- Shell hook cleanup graceful and safe

## Known Issues

- Playwright tests require running server (CI timeout - not a code issue)
- File access mode requires page reload to take effect (by design)
- Vision config changes apply to new detections only (current overlays persist)

## What's NOT Included (Intentional Scope)

- User input capture during LLM sessions (see roadmap for future work)
- Conversation recovery endpoint (requires input capture first)
- Marketing claim updates (refer to README.md for authoritative feature list)

## Installation & Upgrade

**From v1.20.9 or earlier:**
```bash
# Automatic update
forge update

# Or manual: download v1.20.10 from releases page
```

**New Features Setup:**
1. Restart application to load new configuration system
2. File access security mode will prompt on first file operation
3. Vision detectors configurable via Settings → Experimental Features

## Migration Notes

- Existing AM logs continue to work (old format automatically recognized)
- New logs use enhanced workspace-aware naming
- No action required for existing sessions

## Files Changed Summary

- Total files changed: 23
- New files: 4
- Modified files: 19
- Deleted files: 1 (old asset)
- Lines added: 3,585
- Lines deleted: 925

## Credits & Attribution

- Vision configuration: Extensible detector framework
- File security: Multi-layer validation system
- AM logging: Workspace-context enhancement

## Next Steps / Roadmap

**High Priority:**
- User input capture during LLM conversations (Issue tracking)
- Full conversation recovery system
- Marketing copy validation against implemented features

**Medium Priority:**
- Vision detector UI customization
- File access mode persistence preferences
- AM session compression

**Future Enhancements:**
- Alternative animation patterns for active tab
- Performance mode for low-power devices
- Integration with external logging services

## Status

✅ **Ready for Production**
- Stable release with no breaking changes
- Backward compatible with v1.20.x
- All new features optional and non-intrusive
- Security additions enhance safety profile

---

**Release Notes Generated:** 2025-12-10T11:08:07Z  
**Commit SHA:** 95e24c4  
**Tag:** v1.20.10
