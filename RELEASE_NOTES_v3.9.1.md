# Forge Terminal v3.9.1 Release Notes

**Release Date:** December 31, 2025  
**Focus:** Production Stability & Power User Features

---

## 🎯 Highlights

### ForgeAssist Redesign
Complete overhaul of ForgeAssist to surface **hidden CLI power features**:
- **Manual CLI Selection**: Choose Claude, Copilot, or Git CLI
- **Claude Power Features**: Subagents, GitHub Hooks, Planning Mode, CLAUDE.md, Session Control
- **Copilot CLI Tools**: Session Management, Model Control, Permissions, Context Variables, MCP
- **Learn More Links**: Direct documentation for each feature
- **Danger Warnings**: Clear indicators for destructive operations

### Lens File Picker Enhancements
- **Feature Detection**: Automatically categorizes files by functionality (AM, Auto Response, Terminal, SLM, LLM)
- **Pattern Matching**: Enhanced to detect features in both filenames AND directories
- **Windows Compatibility**: Proper handling of backslash paths

### AM Monitor Health Tracking
- **3-State Indicator**:
  - 🟢 Green: "AM Logging is Active in this tab"
  - 🟡 Yellow: "AM Logging is Disabled for this tab"
  - 🔴 Red: "AM Logging is enabled but not capturing data"
- **Real-time Health Detection**: Monitors pipeline activity and file writes

---

## 🔧 Technical Improvements

### SLM Architecture Cleanup
- **Removed**: Broken embedded SLM (llama.cpp provider)
- **Simplified**: Ollama-only for local models
- **Removed**: Non-functional Economy/Power tier heuristics
- **Cleaner Settings**: Removed misleading "Smart Routing" UI elements

### Log Spam Reduction
Production logs are now 90% quieter:
- **PromptDetector**: Rate-limited to once per 5 seconds per tab
- **FREEZE-DEBUG**: Higher thresholds (PTY read: 500ms, WebSocket write: 200ms)
- **JSON Parse Errors**: Only logged when data actually looks like JSON
- **Result**: Easier debugging, less noise

### Bug Fixes
- Fixed JSON parse errors from keyboard input being interpreted as structured data
- Enhanced Ctrl+V paste handling for images and text
- Improved file path detection with forward slash normalization

---

## 📊 Statistics

- **Code Removed**: ~3,094 lines (broken SLM provider code)
- **Code Added**: ~2,414 lines (ForgeAssist, Lens, AM Monitor)
- **Net Change**: Cleaner, more maintainable codebase
- **Files Changed**: 24 files across frontend and backend

---

## 🚀 Upgrade Instructions

```bash
# Pull latest code
git pull origin main

# Checkout release tag
git checkout v3.9.1

# Build
go build -o forge.exe -ldflags "-X main.Version=v3.9.1" ./cmd/forge
cd frontend && npm install && npm run build && cd ..

# Run
./forge.exe
```

---

## 🔮 What's Next (v3.9.2+)

Potential focus areas:
1. **Virtual Terminal Emulator**: Replace pattern-based prompt detection with screen buffer analysis
2. **Auto-Response Reliability**: Detect prompts with file paths containing `/` or `\`
3. **Ctrl+V Image Handling**: Ensure CLI agents can "see" pasted images without errors
4. **Lens Context Cart**: Optimize token counting and heat map indexing
5. **Visual Testing**: Playwright integration for comprehensive UI testing

---

## 📝 Breaking Changes

None. This is a stability-focused release with no breaking API changes.

---

## 🙏 Acknowledgments

Special thanks to users who reported issues with:
- AM logging visibility
- Lens file categorization
- SLM settings confusion
- Log spam making debugging difficult

Your feedback drives continuous improvement.

---

**Full Changelog**: https://github.com/mikejsmith1985/forge-terminal/compare/v3.8.1...v3.9.1
