# Per-Tab File Explorer Implementation

## Overview
Implemented per-tab file explorer with proper root path constraints and security boundaries. Each terminal tab now maintains its own file root directory, preventing users from browsing files outside of a tab's designated root.

## Problem Statement
Previously, the file explorer opened at the global application root, not respecting each terminal tab's current working directory. Additionally, there was no validation preventing navigation above a tab's designated root directory.

## Solution

### Backend Changes (Go)

#### `internal/files/handler.go`

1. **Added `isPathWithinRoot()` function**
   - Validates that requested paths are within the allowed root directory
   - Performs absolute path resolution for both target and root paths
   - Returns `false` if target is outside root, preventing unauthorized access
   - Used by all file API endpoints

2. **Updated request types to include `rootPath`**
   - `FileReadRequest`: Added `rootPath` field
   - `FileWriteRequest`: Added `rootPath` field
   - `FileDeleteRequest`: Added `rootPath` field

3. **Enhanced all file API handlers**
   - `HandleList`: Validates path is within rootPath before listing directory
   - `HandleRead`: Validates path is within rootPath before reading file
   - `HandleWrite`: Validates path is within rootPath before writing file
   - `HandleDelete`: Validates path is within rootPath before deleting
   - `HandleReadStream`: Validates path is within rootPath for streaming

4. **Security features**
   - Returns HTTP 403 Forbidden when attempting to access paths outside root
   - Defaults `rootPath` to "." if not specified (backward compatible)
   - Uses `filepath.Clean()` to normalize paths and prevent ".." traversal attacks

### Frontend Changes (React/JavaScript)

#### `frontend/src/components/FileExplorer.jsx`

1. **Updated component props**
   - Added `rootPath` parameter to component signature
   - Root path specifies the base directory for the file explorer

2. **Enhanced API calls**
   - `loadFileTree()` now includes `rootPath` in query parameters
   - Delete operation includes `rootPath` in request body
   - Uses root path as fallback when current path is invalid

3. **Improved path handling**
   - Defaults to `rootPath` when no `currentPath` is set
   - Handles missing `currentPath` gracefully by using `rootPath`
   - Maintains separate expanded directory sets per tab

#### `frontend/src/components/MonacoEditor.jsx`

1. **Added rootPath support**
   - New `rootPath` parameter in component props (defaults to ".")
   - File read operations include `rootPath` in request
   - File write operations include `rootPath` in request
   - Ensures editor respects tab's file boundaries

#### `frontend/src/App.jsx`

1. **FileExplorer integration**
   - Passes `activeTab?.currentDirectory` as both `currentPath` and `rootPath`
   - Each tab's file explorer rooted at its own working directory

2. **MonacoEditor integration**
   - Passes `activeTab?.currentDirectory` as `rootPath`
   - Editor restricted to files within tab's directory

### API Contract

#### Query Parameters (GET endpoints)
- `/api/files/list?path=<path>&rootPath=<root>`
- `/api/files/stream?path=<path>&rootPath=<root>`

#### Request Body (POST endpoints)
All POST endpoints now accept optional `rootPath` field:
```json
{
  "path": "/path/to/file",
  "rootPath": "/base/directory",
  "content": "file contents (write/delete only)"
}
```

### Backward Compatibility
- `rootPath` parameter is optional in all endpoints
- Defaults to "." if not specified, maintaining existing behavior
- Existing code without `rootPath` continues to work

## Security Considerations

1. **Path Validation**
   - All paths validated against `rootPath` before file operations
   - Prevents directory traversal using ".." sequences
   - Uses `filepath.Clean()` to normalize paths

2. **Forbidden Access**
   - Returns HTTP 403 when attempting to access paths outside `rootPath`
   - Clear error messages for debugging

3. **Per-Tab Isolation**
   - Each tab can have different root directory
   - File operations strictly limited to tab's root
   - Prevents cross-tab file access violations

## Testing

### Automated Tests (Playwright)
- Created `frontend/e2e/per-tab-files.spec.js`
- 10 comprehensive test cases covering:
  - File explorer initialization at tab root
  - Separate files for different tabs
  - Path maintenance across tab switches
  - Directory traversal prevention
  - API parameter acceptance
  - Path boundary validation
  - Delete/read/write validation
  - Graceful handling of missing rootPath

### Test Results
- ✅ All 10 new tests pass
- ✅ All 9 existing tab-related tests pass
- ✅ No regressions detected

## Files Modified

1. `internal/files/handler.go` - Backend file API implementation (+123 lines)
2. `frontend/src/components/FileExplorer.jsx` - Per-tab file explorer (-16 lines)
3. `frontend/src/components/MonacoEditor.jsx` - Editor root path support (+4 lines)
4. `frontend/src/App.jsx` - Integration with tabs (+2 lines)
5. `frontend/e2e/per-tab-files.spec.js` - New test suite (added)
6. `cmd/forge/web/index.html` - Web build output (regenerated)

## Future Enhancements

1. **Windows/WSL Path Conversion**
   - When WSL is active, convert Windows paths (`C:\`) to WSL paths (`/mnt/c/`)
   - Handle path translation for cross-terminal operations

2. **Path Breadcrumbs**
   - Display navigation breadcrumb in file explorer
   - Allow quick navigation to parent directories (within bounds)

3. **Recent Directories**
   - Track recently visited directories per tab
   - Quick access to common paths within root

4. **Favorites/Bookmarks**
   - Allow users to bookmark directories within root
   - Quick navigation to frequently used locations

## Deployment Notes

- No database migrations needed
- No configuration changes required
- Fully backward compatible
- No breaking API changes

## Documentation

See `PER_TAB_FILES_IMPLEMENTATION.md` for detailed implementation notes.
