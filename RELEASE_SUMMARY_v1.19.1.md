# Forge Terminal v1.19.1 Release Notes

**Release Date:** December 9, 2025  
**Status:** Ready for Production

---

## 🎉 What's New

### 1. **Resizable Sidebar** ↔️
- Drag the sidebar edge horizontally to adjust width (200–800px)
- Width persists across sessions (localStorage)
- Quick workflow adaptation: narrow for terminal focus, widen for chat readability

### 2. **Dual Font Controls** 📏
- **Independent font sizing** for terminal and assistant chat
- **Icon-based targeting**: ⌨️ (Terminal) + 🤖 (Assistant) to switch targets
- **New range**: 8–30px (previously 10–24px)
- Removed: Reset button (cleaner UI, font starts at 14px default)

### 3. **Test Infrastructure** ✅
- **Playwright E2E tests** for critical user flows (mocked backend)
- **2 test scenarios**:
  1. Assistant panel chat functionality
  2. Font control targeting and size adjustment
- **Automated validation** on every test run (~7.2s, 100% pass rate)

### 4. **Documentation Refresh** 📚
- **README**: Added Resizable Sidebar, Dual Font Controls, Experimental Features section
- **User Guide**: Expanded from 15 → 19 sections with complete workflows
- **Splash Screen**: Now shows experimental features (Assistant + Vision, Dev Mode)
- **Git Hook**: Pre-commit validation ensures major code changes update docs

### 5. **Experimental Features (Dev Mode)** 🧪
> Behind Dev Mode toggle; subject to change

- **🤖 Forge Assistant**: AI-powered chat panel with Ollama integration
  - Context-aware suggestions based on terminal state
  - Local LLM inference (privacy-first, no cloud required)
  - Model selection UI with metadata display

- **👁️ Vision Detection**: Pattern recognition in terminal output
  - **Currently deployed**: JSON structure detection
  - **Upcoming**: File paths, URLs, error stack traces, git status
  - Note: Visual improvements and formatting coming soon

---

## 📋 Technical Details

### Frontend Changes
| Component | Change |
|-----------|--------|
| `App.jsx` | Font size state split: terminal + chat, resizer handlers, fontTarget toggle |
| `index.css` | New `.sidebar-resizer` styles, improved layout |
| `AssistantPanel` | Accepts `assistantFontSize` prop, applies via CSS variable |
| `WelcomeModal` | Added experimental features section (visually separated) |
| `playwright.config.js` | Fixed webServer config (port 4173, reuseExistingServer: true) |

### New Files
- `frontend/tests/playwright/assistant.spec.js` — E2E test suite (2 tests, 100% pass)

### Documentation Changes
- `README.md` (+15 lines): Updated features, added experimental section
- `docs/user/ft_user_guide.md` (+140 lines): 4 new sections, restructured
- Git hook (`.git/hooks/pre-commit`): Enforces doc updates on major changes

---

## ✅ Quality Metrics

| Metric | Result |
|--------|--------|
| Frontend Build | ✅ No errors |
| Playwright Tests | ✅ 2/2 passing (7.2s) |
| Documentation Coverage | ✅ 100% (all deployed features) |
| Experimental Features Marked | ✅ Clear "Dev Mode" labels |
| Backwards Compatibility | ✅ No breaking changes |

---

## 🚀 Installation & Usage

### Font Controls (New)
1. **Select target**: Click ⌨️ (terminal) or 🤖 (assistant) icon
2. **Adjust**: Use +/− buttons (8–30px range)
3. **Persists**: Saved automatically per target

### Resizable Sidebar
1. **Position cursor** at left edge of sidebar (thin line)
2. **Drag left/right** to resize (200–800px)
3. **Auto-saves** width across sessions

### Experimental: Forge Assistant
1. **Enable**: Settings → Dev Mode toggle
2. **Install Ollama**: Download from [ollama.ai](https://ollama.ai)
3. **Start**: `ollama serve` in terminal
4. **Access**: Sidebar → Assistant tab

---

## 📝 Known Limitations

- **Vision Detection**: JSON detection works; visual formatting improvements pending
- **Assistant UI**: Font size sync with terminal works; additional formatting features coming
- **Experimental features**: May change or be removed in future versions; no stable API guarantees

---

## 🔄 Upgrade Notes

**From v1.19.0:**
- No breaking changes
- Existing command cards, themes, and settings preserved
- New font controls default to terminal target
- Sidebar width resets to 360px on first load

---

## 🙏 Acknowledgments

This release includes:
- Playwright test infrastructure for continuous validation
- Enhanced documentation workflows (Git hook enforcement)
- Cleaner UI (removed reset button, icon-based font targeting)
- Experimental features clearly labeled and gated

---

## 🔗 Links

- **GitHub**: [mikejsmith1985/forge-terminal](https://github.com/mikejsmith1985/forge-terminal)
- **Issues**: [Report bugs or request features](https://github.com/mikejsmith1985/forge-terminal/issues)
- **User Guide**: [docs/user/ft_user_guide.md](docs/user/ft_user_guide.md)

---

**Next Release Candidate**: v1.19.2  
**Target**: Visual improvements for Vision Detection, expanded Assistant context awareness
