# Release Summary: v2.2.7

**Release Date:** December 24, 2024  
**Type:** Bug Fix Release

## 🐛 Critical Fixes

### Fixed: Image Drop Zone Crash
- **Issue:** App crashed when pasting or dropping images into the ImageDropZone
- **Root Cause:** JSON parsing error due to unescaped Windows file paths with backslashes
- **Fix:** Use `json.NewEncoder()` instead of `fmt.Fprintf()` to properly escape paths
- **Impact:** Image paste/drop now works reliably on Windows without crashes

### Fixed: Toast Notification Errors
- **Issue:** Toast function calls were using incorrect parameter format (object vs positional args)
- **Root Cause:** `ImageDropZone` calling `onToast()` with object parameter, but `addToast()` expects positional arguments
- **Fix:** Updated all 7 toast calls to use correct format: `onToast(message, type, duration)`
- **Impact:** Toast notifications display correctly without errors

### Fixed: Ctrl+V Text Paste Not Working
- **Issue:** Text paste (Ctrl+V) didn't work when ImageDropZone was focused
- **Root Cause:** `handlePaste()` was calling `preventDefault()` immediately, blocking all paste events
- **Fix:** Check for images first, only prevent default if image is found in clipboard
- **Impact:** Text paste now works correctly in terminal and TUI

## 📝 Technical Changes

### Backend Changes
**File:** `cmd/forge/tempimages.go`
```go
// BEFORE
fmt.Fprintf(w, `{"filePath":"%s","filename":"%s"}`, destPath, filename)

// AFTER
response := map[string]string{
    "filePath": destPath,
    "filename": filename,
}
json.NewEncoder(w).Encode(response)
```

### Frontend Changes
**File:** `frontend/src/components/ImageDropZone.jsx`

1. **Toast Calls Fixed:**
```javascript
// BEFORE
onToast?.({ type: 'success', message: '...', detail: '...', duration: 5000 })

// AFTER
onToast('File path copied to clipboard', 'success', 5000)
```

2. **Paste Event Handling Fixed:**
```javascript
// Check for images BEFORE preventing default
let foundImage = false;
for (let item of items) {
  if (item.type.startsWith('image/')) {
    foundImage = true;
    break;
  }
}

// Only prevent default if we found an image
if (!foundImage) {
  return; // Allow default paste behavior
}

e.preventDefault();
e.stopPropagation();
```

## ✅ What Works Now

- ✅ Image paste/drop saves file and copies path to clipboard
- ✅ Toast notifications display correctly
- ✅ App no longer crashes on image paste/drop
- ✅ Ctrl+V text paste works in terminal and TUI
- ✅ Windows paths properly escaped in JSON responses
- ✅ Clipboard still receives file path as intended

## 🧪 Testing Performed

1. Pasted image into ImageDropZone - file saved, path copied ✅
2. Dropped image into ImageDropZone - file saved, path copied ✅
3. Pasted text with ImageDropZone focused - text paste works ✅
4. Toast notifications display correctly ✅
5. No console errors or crashes ✅

## 📦 Files Changed

- `cmd/forge/tempimages.go` - JSON encoding fix
- `frontend/src/components/ImageDropZone.jsx` - Toast calls and paste event handling
- `frontend/package.json` - Version bump to 2.2.7

## 🚀 Deployment

```bash
# Build frontend
cd frontend && npm run build

# Build production binary
go build -o forge-terminal.exe ./cmd/forge

# Tag release
git tag v2.2.7
git push origin main --tags
```

---

**Previous Version:** v2.2.6  
**Current Version:** v2.2.7  
**Next Planned:** TBD
