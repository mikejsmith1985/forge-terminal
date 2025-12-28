# Release v1.23.3: Fix CMD/PowerShell Default Path Persistence

**Release Date:** December 14, 2025  
**Tag:** v1.23.3  
**Previous Release:** v1.23.2

## Overview
This release fixes issue #44 where CMD and PowerShell terminal settings for default paths weren't persisting across application restarts. Each shell type now has independent, configurable default working directories.

## What's Fixed

### Issue #44: CMD Terminal Settings Default Path Not Updating
- **Problem:** Users could enter a default path in Settings for CMD or PowerShell, but the value wasn't saved to disk
- **Root Cause:** Backend `Config` struct was missing fields for `CmdHomePath` and `PsHomePath`
- **Solution:** Added these fields to the Config struct to properly persist cross-platform paths

## Changes

### Backend Changes
**File:** `internal/commands/config.go`

```go
type Config struct {
    ShellType   string `json:"shellType"`   // "powershell", "cmd", or "wsl"
    WSLDistro   string `json:"wslDistro"`   // e.g., "Ubuntu-24.04"
    WSLHomePath string `json:"wslHomePath"` // e.g., "/home/mikej"
    
    // NEW:
    CmdHomePath string `json:"cmdHomePath"` // CMD default working directory
    PsHomePath  string `json:"psHomePath"`  // PowerShell default working directory
}
```

### How It Works

1. **User Configuration:** Users can set default paths via Settings Modal
2. **Persistence:** Values are saved to `~/.forge/config.json`
3. **Restoration:** On app restart, paths are loaded from config
4. **Usage:** Terminal sessions start in configured directories

## Features

✨ **Cross-Platform Path Support**
- Windows CMD can use paths like `C:\ProjectsWin`
- PowerShell can use paths like `C:\ProjectsWin`
- WSL can use paths like `/home/user/projects`
- Each shell type has independent configuration

✨ **Persistent Configuration**
- Settings are saved to config file
- Restored across application restarts
- Independent per shell type

✨ **Seamless Integration**
- Works with existing terminal session management
- No migration required for existing users
- Backward compatible with old config files

## Integration Points

- **Frontend UI:** SettingsModal now properly captures home directory inputs
- **Frontend State:** App.jsx loads/saves config with new fields
- **Frontend Terminal:** ForgeTerminal passes paths as WebSocket query parameters
- **Backend API:** `/api/config` endpoint handles new fields
- **Backend Session:** Terminal sessions use configured paths

## Technical Details

### Configuration Flow
```
Settings UI Input
  ↓
Frontend State Update (cmdHomePath, psHomePath)
  ↓
Save to Backend (/api/config POST)
  ↓
Backend Config Struct (with new fields)
  ↓
Persist to ~/.forge/config.json
  ↓
[ App Restart ]
  ↓
Load from ~/.forge/config.json
  ↓
Frontend loads via /api/config GET
  ↓
Terminal uses values as WebSocket params
  ↓
Terminal session sets working directory
```

### Data Persistence
- **Location:** `~/.forge/config.json`
- **Format:** JSON with optional fields
- **Backward Compatible:** Old configs without these fields still work
- **Example:**
```json
{
  "shellType": "cmd",
  "cmdHomePath": "C:\\ProjectsWin",
  "psHomePath": "C:\\ProjectsWin",
  "wslDistro": "Ubuntu-24.04",
  "wslHomePath": ""
}
```

## User Guide

### Setting a Default Path for CMD
1. Click Settings (⚙️ icon)
2. Select "CMD" shell
3. Enter home directory path (e.g., `C:\ProjectsWin`)
4. Click "Save & Restart Terminal"
5. New terminals will start in that directory

### Setting a Default Path for PowerShell
1. Click Settings (⚙️ icon)
2. Select "PowerShell" shell
3. Enter home directory path (e.g., `C:\ProjectsWin`)
4. Click "Save & Restart Terminal"
5. New terminals will start in that directory

### Independent Paths
Each shell type maintains its own default path independently:
- CMD: `C:\My\CMD\Projects`
- PowerShell: `C:\My\PS\Projects`
- WSL: `/home/user/linux/projects`

## Testing

All integration points verified:
- ✓ Config struct serialization/deserialization
- ✓ Settings UI input capture
- ✓ Configuration persistence to disk
- ✓ Terminal session initialization
- ✓ Build verification
- ✓ Backward compatibility

## Breaking Changes
None. This is a backward-compatible release.

## Migration
No action required. Existing configurations continue to work. New fields are optional and default to empty strings.

## Known Limitations
- Paths are stored as-is without validation
- No automatic expansion of environment variables
- Users should enter absolute paths for best results

## Related Issues
- Closes #44: CMD Terminal settings of default path doesn't actually update the file path

## Commits
- `941cbe0`: fix: Add configurable home directories for CMD and PowerShell shells (Issue #44)

## Files Changed
- `internal/commands/config.go`: +2 lines

## Performance Impact
- **Negligible:** Only 2 additional string fields in memory
- **Disk:** Minimal increase in config file size (~50 bytes max)

## Security Considerations
- Paths are not validated or sanitized (user responsibility)
- No new network endpoints or API changes
- Local file I/O only

---

## Installation

Update to v1.23.3:
```bash
git fetch origin
git checkout v1.23.3
```

Or download the latest release from GitHub.

## Support
For issues or questions, please open an issue on GitHub.
