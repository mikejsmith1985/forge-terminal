# Release Notes - Forge Terminal v3.10.5

**Release Date:** January 2, 2026

## 🐛 Bug Fixes

### FeedbackModal Improvements
- **PAT Validation on Save** - GitHub tokens are now validated immediately when clicking "Save Settings"
  - Real-time validation against GitHub `/user` API
  - Specific error messages: Invalid token, missing permissions, network errors
  - Supports both classic (`ghp_*`) and fine-grained (`github_pat_*`) tokens
  - Prevents wasted time capturing screenshots with invalid credentials

- **Ctrl+V Paste Functionality Restored** - Fixed broken keyboard paste support
  - Paste images directly with Ctrl+V
  - Paste videos directly with Ctrl+V
  - Paste text into description field
  - Smart detection preserves normal paste behavior in text inputs
  - Visual success notifications on paste

### ForgeAssist UI Fixes
- **Fixed X Button Overflow** - Close button no longer overflows the modal header
  - Added `flex-shrink: 0` to prevent button compression
  - Added `margin-left: auto` for proper positioning
  - Improved responsive layout with `overflow: hidden`

- **Fixed Quick Instructions Button** - Button now properly toggles the Quick Instructions panel
  - Changed from `setPanel(true)` to `setPanel(!panel)` for proper toggle
  - Panel correctly shows/hides on button clicks
  - State properly managed for multiple toggles

## 📊 Test Coverage

### PAT Validation Tests
✅ 3/3 tests passing:
- Invalid token correctly rejected
- Network errors handled gracefully
- Token format detection (Bearer vs token auth)

### Paste Functionality Tests
✅ 4/4 tests passing:
- Paste event listener lifecycle
- Image paste handling
- Text input exclusion (default behavior preserved)
- Video paste handling

### ForgeAssist UI Tests
✅ 5/5 tests passing:
- X button flex-shrink prevents overflow
- Controls group prevents wrapping
- Individual button flex-shrink
- Header overflow handling
- Quick Instructions button toggle

## 🔧 Technical Changes

### Files Modified
- `frontend/src/components/FeedbackModal.jsx` (+103 lines)
  - PAT validation function
  - Paste event listener with smart detection
  - Enhanced error messaging
  
- `frontend/src/components/ForgeAssist.jsx` (+4 lines)
  - Quick Instructions button toggle fix
  - Added flex-shrink: 0 to control buttons
  
- `frontend/src/components/ForgeAssist.css` (+8 lines)
  - Header overflow: hidden
  - Close button flex-shrink: 0 + margin-left: auto
  - CLI tabs scrollable with min-width: 0

### Test Files Added
- `frontend/tests/test-pat-validation.mjs`
- `frontend/tests/test-paste-fix.mjs`
- `frontend/tests/test-forge-assist-fixes.mjs`
- `frontend/tests/feedback-pat-validation.spec.js`
- `frontend/tests/feedback-paste-ctrl-v.spec.js`
- `frontend/tests/forge-assist-ui-fixes.spec.js`
- `frontend/tests/pat-validation-integration.spec.js`

## 🎯 User Impact

### Before → After

**FeedbackModal PAT:**
- ❌ Enter token → Capture screenshots → Submit → ERROR: Check token
- ✅ Enter token → Immediate validation → Clear error or success message

**FeedbackModal Paste:**
- ❌ Press Ctrl+V → Nothing happens (UI says "Press Ctrl+v to paste")
- ✅ Press Ctrl+V → Image/video/text pasted with success notification

**ForgeAssist UI:**
- ❌ X button overflows header, Quick button does nothing
- ✅ X button properly positioned, Quick button toggles panel

## 📦 Installation

```bash
# Download the latest release
curl -LO https://github.com/mikejsmith1985/forge-terminal/releases/download/v3.10.5/forge-v3.10.5-windows-amd64.exe

# Or build from source
git clone https://github.com/mikejsmith1985/forge-terminal.git
cd forge-terminal
git checkout v3.10.5
make build
```

## 🙏 Contributors

- Internal QA and bug reports
- TDD methodology following `.github/copilot-instructions.md`

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for detailed change history.

---

**Full Changelog:** https://github.com/mikejsmith1985/forge-terminal/compare/v3.10.4...v3.10.5
