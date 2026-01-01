# Forge Terminal v3.9.7 Release Notes

**Release Date**: January 1, 2026  
**Version**: 3.9.7  
**Binary**: `forge-v3.9.7-windows-amd64.exe`

---

## 🎯 Focus: Instruction Mode UX & Stability

This release fixes critical issues with the Instruction Mode feature in Power Features and improves the local development workflow.

---

## 🐛 Bug Fixes

### 1. **CSS Syntax Error (Critical)**
- **Issue**: Extra closing brace in ForgeAssist.css line 366 broke CSS parsing
- **Impact**: Instruction Mode button was completely hidden
- **Fix**: Removed extra `}` and fixed duplicate CSS definitions
- **Status**: ✅ Resolved

### 2. **File I/O API Not Working**
- **Issue**: Frontend was using GET with query parameters for file operations
- **Impact**: Edit and Save functions failed silently
- **Root Cause**: API expects POST with JSON body
- **Fix**: Updated `openInstructionEditor()` and `saveInstructions()` to use proper POST requests
- **Status**: ✅ Resolved

### 3. **Duplicate Footer CSS**
- **Issue**: `.forge-assist-footer` defined twice with conflicting layouts
- **Fix**: Consolidated to single definition with `justify-content: space-between`
- **Status**: ✅ Resolved

---

## ✨ Improvements

### Instruction Mode Visibility
- **Before**: Tiny icon button, easy to miss
- **After**: Prominent button with clear "Instructions" label
- **Visual States**:
  - **OFF**: Gray background (#333) with text "Instructions"
  - **ON**: Purple background (#8b5cf6) with "ON" badge + "Edit" button

### User Guidance
- Enhanced hover tooltips with context-aware messages
- Added footer hints that change based on mode state
- Improved editor modal with better description and examples
- Better button labels throughout

### Editor Modal
- Clearer title: "Custom Instructions"
- Helpful subtitle explaining file location
- Enhanced placeholder with examples and context
- Visual improvements: darker background, purple border, better shadows
- Better button labels: "Save Instructions" vs generic text

### Footer Hints
- **When OFF**: "Tip: Enable Instructions mode to append custom guidelines to commands"
- **When ON**: "✓ Instruction Mode Active - Your custom instructions will be appended"

---

## 🛠️ Development Improvements

### New: Cache-Free Dev Workflow
Created `run-dev-clean.ps1` to solve persistent cache issues:
```powershell
.\run-dev-clean.ps1        # Full rebuild + restart
.\run-dev-clean.ps1 -NoBuild  # Just restart without rebuild
```

**Features**:
- ✅ Kills old processes
- ✅ Rebuilds frontend (npm run build)
- ✅ Rebuilds Go binary
- ✅ Reminds about cache clearing
- ✅ Fresh start every time

### Added: Playwright Tests
- Created `frontend/tests/instruction-mode.spec.js`
- Tests button visibility
- Tests toggle ON/OFF functionality
- Tests editor modal opening
- Manual config for running against live server

### New Config
- `frontend/playwright.manual.config.js`: For testing against running dev server

---

## 📝 Documentation

Created comprehensive documentation:

1. **INSTRUCTION_MODE_UX_IMPROVEMENTS.md**
   - Technical overview
   - Before/after comparisons
   - API integration details
   - Testing checklist

2. **INSTRUCTION_MODE_USAGE_GUIDE.md**
   - User-friendly getting started guide
   - Best practices
   - Example instructions for different project types
   - Troubleshooting section

3. **INSTRUCTION_MODE_VISUAL_REFERENCE.md**
   - Visual diagrams and button states
   - Modal layout guide
   - User flow diagrams
   - Color scheme reference

4. **CSS_SYNTAX_FIX.md**
   - Detailed explanation of CSS error
   - Impact analysis
   - Solution implemented

---

## 📊 Changes Summary

| Category | Changes |
|----------|---------|
| Files Modified | 2 (ForgeAssist.jsx, ForgeAssist.css) |
| Lines Changed | ~100 (styling + API fixes) |
| CSS Fixes | 2 (extra brace, duplicate definitions) |
| Bug Fixes | 2 (CSS parsing, API calls) |
| UX Improvements | 6 (button, edit, modal, footer, tooltips) |
| Documentation Files | 4 new + dev script |
| Breaking Changes | 0 |
| New Dependencies | 0 |

---

## ✅ Testing & Validation

### Manual Testing
- ✓ CSS syntax verified (no parsing errors)
- ✓ Button visibility confirmed in build
- ✓ API calls use correct POST format
- ✓ File read/write endpoints working
- ✓ Modal opens and closes properly
- ✓ Toggle state persists in localStorage
- ✓ Responsive layout maintained

### Automated Tests
- ✓ Playwright E2E tests created
- ✓ Button visibility test
- ✓ Toggle ON/OFF test
- ✓ Editor modal test

---

## 🚀 Installation

### Option 1: Direct Download
Download and run: `forge-v3.9.7-windows-amd64.exe`

### Option 2: Build from Source
```bash
git clone https://github.com/mikejsmith1985/forge-terminal.git
cd forge-terminal
git checkout v3.9.7
go build -o forge-v3.9.7-windows-amd64.exe ./cmd/forge
```

---

## 🔗 Related Features

- **Power Features Panel** (Ctrl+/)
- **Instruction Mode Toggle** (Top-right of Power Features header)
- **Custom Instructions File** (copilot-instructions.md)
- **CLI Configuration** (Settings Panel)

---

## 💡 What's Next

### Recommended for v3.9.8
1. Add instruction templates library
2. Instruction validation before save
3. Keyboard shortcut for quick edit (Shift+E)
4. Instruction history/versioning
5. Team instruction sharing

---

## 🤝 Contributing

Found a bug? Have feedback? Create an issue at:  
https://github.com/mikejsmith1985/forge-terminal/issues

---

## 📄 License

Same as Forge Terminal main project.

---

**Release Complete**: ✅  
**Stable for Production**: ✅  
**Ready for Release**: ✅
