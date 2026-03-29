# Custom Version Setting Feature - v3.16.14

## Feature Overview

Added the ability to manually set a custom version number in the Release Manager (Update Modal). This enables:
- **Version skipping**: Jump to any version without installing (e.g., skip from 3.16.14 to 4.0.0)
- **Testing**: Set version for testing update prompts and version-dependent features
- **Manual control**: Override the build-time version without rebuilding

## Changes Made

### Frontend (UpdateModal.jsx)

#### 1. Added State Management
```javascript
const [customVersionInput, setCustomVersionInput] = useState('');
```

#### 2. Added Handler Function
```javascript
const handleSetCustomVersion = async () => {
  // Validates version format (X.Y.Z or vX.Y.Z)
  // Calls /api/update/set-version endpoint
  // Triggers page reload to show new version
}
```

#### 3. Added UI Section
New section in the Update Modal between version list and "Install from Downloaded File":
- Input field for version number (e.g., "3.17.0" or "v4.0.0")
- "Set Version" button
- Validation for semver format
- Helper text explaining usage

**Styling:**
- Purple accent color (`#8b5cf6`) to distinguish from update actions
- History icon to indicate version control
- Disabled state during processing
- Monospace input for version formatting

### Backend (main.go)

#### 1. Added API Endpoint
```
POST /api/update/set-version
```

**Request:**
```json
{
  "version": "3.17.0"
}
```

**Response (Success):**
```json
{
  "success": true,
  "oldVersion": "3.16.14",
  "newVersion": "3.17.0",
  "message": "Version updated from 3.16.14 to 3.17.0"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Invalid version format. Expected: X.Y.Z or X.Y.Z-suffix"
}
```

#### 2. Added Handler Function
```go
func handleSetCustomVersion(w http.ResponseWriter, r *http.Request)
```

**Features:**
- Validates version format using regex: `^\d+\.\d+\.\d+(-[\w.]+)?$`
- Strips "v" prefix automatically
- Updates `updater.Version` package variable
- Logs version change
- Returns old and new version in response

## Usage

### Via UI (Update Modal):

1. Open Forge Terminal
2. Click the Download icon in top bar (or use Update notification)
3. Scroll to "Set Custom Version" section
4. Enter desired version: `3.17.0` or `v4.0.0`
5. Click "Set Version"
6. Page automatically reloads with new version

### Via API (Direct):

```bash
curl -X POST http://localhost:3000/api/update/set-version \
  -H "Content-Type: application/json" \
  -d '{"version": "4.0.0"}'
```

## Use Cases

### 1. Version Skipping
**Scenario**: Current is 3.16.14, next release is 3.17.0, but you want to test 4.0.0 behavior

```
Current: 3.16.14
Action: Set custom version to 4.0.0
Result: App thinks it's running 4.0.0
```

### 2. Update Testing
**Scenario**: Test update notification when a newer version is released

```
1. Set version to 3.10.0
2. Check for updates (3.16.14 is latest)
3. Update prompt appears
4. Test update flow
```

### 3. Feature Gating
**Scenario**: Features that depend on version checks

```javascript
if (parseVersion(currentVersion) >= parseVersion('3.17.0')) {
  enableNewFeature();
}
```

### 4. Rollback Simulation
**Scenario**: Test how app behaves on "older" version

```
Set version to 3.15.0 to see legacy behavior
```

## Validation

### Valid Formats:
- ✅ `3.16.14`
- ✅ `v3.16.14`
- ✅ `4.0.0`
- ✅ `3.17.0-beta`
- ✅ `1.2.3-alpha.1`

### Invalid Formats:
- ❌ `3.16` (missing patch version)
- ❌ `v3` (incomplete)
- ❌ `latest` (not semver)
- ❌ `3.16.14.5` (too many parts)
- ❌ `abc` (not a number)

## Files Modified

```
frontend/src/components/UpdateModal.jsx
  - Line 12: Added customVersionInput state
  - Line 28: Reset state on modal close
  - Line 335: Added handleSetCustomVersion function
  - Line 712: Added custom version UI section

cmd/forge/main.go
  - Line 16: Added regexp import
  - Line 287: Registered /api/update/set-version endpoint
  - Line 1129: Added handleSetCustomVersion handler
```

## Technical Details

### Version Storage
The version is stored in `internal/updater/updater.go`:
```go
var Version = "3.13.4"  // Set at build time via ldflags
```

This variable is:
- Set at compile time via `-ldflags "-X ...Version=..."`
- Used throughout the app for version checks
- **Mutable** - can be changed at runtime (which this feature does)

### Page Reload Requirement
After setting the custom version, the page reloads because:
1. The version is displayed in multiple UI components
2. React state needs to refresh from server
3. Ensures consistency across all components

### Security Considerations
- **No authentication** - This is a local application, authentication not required
- **Format validation** - Regex prevents injection attacks
- **Logging** - All version changes are logged for audit trail
- **No persistence** - Version resets on app restart (reverts to build-time version)

## Limitations

### Temporary Change
The custom version is **runtime-only** and does not persist across restarts:
```
Set version to 4.0.0 → Restart app → Back to 3.16.14
```

To make it persistent, you'd need to:
1. Store custom version in config file
2. Read on startup and override build version
3. Add "Reset to build version" button

### No Binary Modification
This does NOT:
- Change the actual binary
- Modify build artifacts
- Update the version embedded at compile time

It only changes the runtime variable used for version checks.

## Future Enhancements

### Potential Additions:
1. **Persist custom version** - Save to config file
2. **Version history** - Track manual version changes
3. **Reset button** - "Restore to build version"
4. **Version presets** - Quick buttons for common versions
5. **Validation warnings** - Warn if version is way out of range

## Testing Checklist

- [x] Build compiles successfully
- [x] Frontend validates version format
- [x] Backend accepts valid versions
- [x] Backend rejects invalid versions
- [x] Page reloads after setting version
- [ ] New version shows in UI after reload
- [ ] Version persists during session
- [ ] Version resets after app restart
- [ ] Update check works with custom version
- [ ] Can set version with "v" prefix
- [ ] Can set version without "v" prefix

## Version

- **Feature Version:** 3.16.14
- **Component:** UpdateModal, Release Manager
- **API Endpoint:** `POST /api/update/set-version`

## Binary
- **Built:** `forge-custom-version.exe`
- **Test Command:** `./forge-custom-version.exe`
