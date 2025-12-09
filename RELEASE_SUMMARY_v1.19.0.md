# Release Summary - Forge Terminal v1.19.0

**Released:** 2025-12-08  
**Tag:** v1.19.0  
**Build Status:** GitHub Actions building...

---

## 🎉 Major Features

### 1. Interactive Model Selector for Assistant 🤖

**What's New:**
- Click the assistant status bar to switch between Ollama models
- See model specs at a glance: size, performance, quality ratings
- Selection persists across sessions (localStorage)
- Real-time model switching without restart

**How to Use:**
```bash
# Open assistant panel (dev mode)
# Click status bar showing: "● Mistral 7B • 3.8 GB • Fast"
# Select different model from dropdown
# Chat continues with new model
```

**Supported Models:**
- Mistral (Fast, Excellent) - Code, chat, reasoning
- Llama 2/3 (Balanced, Excellent) - General purpose
- CodeLlama (Balanced, Excellent) - Code generation
- Phi (Very Fast, Good) - Quick responses
- Qwen (Balanced, Excellent) - Multilingual
- DeepSeek-Coder (Balanced, Excellent) - Code debugging

**API:**
- `POST /api/assistant/model` - Change current model
- `GET /api/assistant/status` - Get models with metadata

---

### 2. ForgeVision File Path Detection 📂

**What's New:**
- Automatically detects file paths in terminal output
- Interactive overlay with quick actions
- View, Edit, Copy, or List files/directories instantly
- Smart filtering - only shows paths that exist

**Detected Path Types:**
- Absolute: `/home/user/file.txt`
- Relative: `./scripts/build.sh`, `../config.json`
- Current dir: `docs/user/MACOS_INSTALLATION.md`

**Quick Actions:**
- **Files:** View (cat), Edit ($EDITOR), Copy path
- **Directories:** List (ls -lah), Copy path
- **Keyboard:** ↑↓ Navigate, Enter Select, 1-9 Hotkeys, ESC Close

**Example:**
```bash
$ echo "See docs/user/MACOS_INSTALLATION.md"
# Path automatically becomes clickable
# Overlay shows: 📄 File • 3.8 KB [View] [Edit] [Copy]
```

---

### 3. Mac Installation Guide 🍎

**What's New:**
- Complete guide for macOS users
- 3 methods to bypass Gatekeeper warnings
- Architecture detection (Intel vs Apple Silicon)
- Comprehensive troubleshooting

**Location:** `docs/user/MACOS_INSTALLATION.md`

**Quick Workaround:**
```bash
# Method 1: Right-click → Open
# Method 2: Terminal commands
xattr -d com.apple.quarantine forge-darwin-arm64
chmod +x forge-darwin-arm64
./forge-darwin-arm64
```

---

## 🔧 Technical Changes

### Backend (Go)

**New Files:**
- `internal/terminal/vision/filepath.go` - File path detector
- `docs/user/MACOS_INSTALLATION.md` - Mac setup guide

**Modified:**
- `internal/assistant/types.go` - ModelInfo structure
- `internal/assistant/ollama.go` - Model enrichment, SetModel/GetCurrentModel
- `internal/assistant/local_service.go` - SetModel implementation
- `internal/assistant/service.go` - SetModel interface
- `internal/terminal/vision/detector.go` - Registered filepath detector
- `cmd/forge/main.go` - New /api/assistant/model endpoint

**New Types:**
```go
type ModelInfo struct {
    Name          string  // "mistral:7b-instruct"
    FriendlyName  string  // "Mistral 7B"
    Size          int64
    SizeFormatted string  // "3.8 GB"
    Performance   string  // "Fast", "Balanced", "Slow"
    Quality       string  // "Excellent", "Good"
    BestFor       string  // "Code, chat, reasoning"
    Family        string  // "mistral"
}
```

---

### Frontend (React)

**Modified:**
- `frontend/src/components/AssistantPanel/AssistantPanel.jsx` - Model selector UI
- `frontend/src/components/AssistantPanel/AssistantPanel.css` - Status bar styling
- `frontend/src/components/vision/VisionOverlay.jsx` - FilePathOverlay component
- `frontend/src/components/vision/vision.css` - File path overlay styles

**New Components:**
- `FilePathOverlay` - Interactive file/directory browser
- Model selector dropdown with metadata display

**State Management:**
```javascript
const [selectedModel, setSelectedModel] = useState('');
const [showModelSelector, setShowModelSelector] = useState(false);
const [isChangingModel, setIsChangingModel] = useState(false);
```

---

## 📊 Statistics

- **13 files changed**
- **960 insertions**, 23 deletions
- **2 new files created**
- **11 existing files enhanced**
- **2 major features** + 1 documentation guide

---

## 🎨 UI/UX Improvements

### Model Selector Design
```
┌──────────────────────────────────────────────┐
│ ● Mistral 7B • 3.8 GB • Fast ▶ Click here   │
└──────────────────────────────────────────────┘
                    ↓ (click)
┌──────────────────────────────────────────────┐
│ ● Mistral 7B • 3.8 GB • Fast ▼ Click here   │
├──────────────────────────────────────────────┤
│ ✓ Mistral 7B Instruct                       │
│   3.8 GB • Fast • Code, chat, reasoning     │
│                                              │
│   Llama 2 7B                                │
│   3.7 GB • Balanced • General purpose       │
└──────────────────────────────────────────────┘
```

### File Path Overlay
```
┌─────────────────────────────────────────────┐
│ 📂 Detected Paths                        × │
├─────────────────────────────────────────────┤
│ 📄 docs/user/MACOS_INSTALLATION.md         │
│     File • 3.8 KB                           │
│     [View] [Edit] [Copy]                    │
└─────────────────────────────────────────────┘
```

---

## 🧪 Testing

### Test Model Selector
```bash
# Start Forge
./forge

# In assistant panel:
# 1. Click status bar
# 2. Select different model
# 3. Send chat message
# 4. Verify model switched
```

### Test File Path Detection
```bash
# In terminal:
echo "Check out docs/user/MACOS_INSTALLATION.md"
# Should see overlay appear with View/Edit/Copy actions
```

### API Testing
```bash
# Get current status
curl http://localhost:8333/api/assistant/status | jq .

# Change model
curl -X POST http://localhost:8333/api/assistant/model \
  -H "Content-Type: application/json" \
  -d '{"model":"llama2:7b"}' | jq .
```

---

## 📦 Installation

### From GitHub Releases
```bash
# Download for your platform:
# - forge-linux-amd64
# - forge-windows-amd64.exe
# - forge-darwin-amd64 (Intel Mac)
# - forge-darwin-arm64 (Apple Silicon)

# Make executable (Mac/Linux)
chmod +x forge-*

# Run
./forge-*
```

### Mac Users
**See:** `docs/user/MACOS_INSTALLATION.md` for bypass instructions

---

## 🔄 Migration Notes

**Breaking Changes:** None

**Backwards Compatible:** ✅  
- All existing features work as before
- New features are opt-in (assistant panel, vision detection)
- No config changes required

---

## 🐛 Known Issues

1. **Model selector** - Only shows models pulled via Ollama
2. **File path detection** - Requires paths to exist on disk
3. **Mac signing** - Still ad-hoc signed (see installation guide)

---

## 🚀 What's Next (v1.20.0+)

### Planned Features
1. **Font size synchronization** - Terminal font → Assistant chat
2. **Dynamic ribbon sizing** - Auto-expand status bar
3. **Model benchmarking** - Speed and quality comparisons
4. **Mac code signing** - Notarized releases
5. **File path preview** - Hover to see content
6. **Recent files tracking** - Quick access to opened files

---

## 📚 Documentation

**New:**
- `docs/user/MACOS_INSTALLATION.md` - Mac setup guide
- `docs/sessions/2025-12-08-model-selector-implementation.md` - Implementation details
- `docs/sessions/2025-12-08-filepath-detector-implementation.md` - Vision enhancement docs

**Updated:**
- Various session docs with implementation notes

---

## 🙏 Credits

- Model metadata classification based on Ollama community benchmarks
- File path patterns inspired by common terminal workflows
- Mac installation guide compiled from user feedback

---

## 📈 Upgrade Instructions

### From v1.18.x
```bash
# Download new binary
# Replace old binary
# No config changes needed
# All data preserved
```

### First Time Users
```bash
# Download binary for your platform
# Run: ./forge (Mac/Linux) or forge.exe (Windows)
# Browser opens automatically at http://localhost:8333
```

---

## 🔗 Links

- **Repository:** https://github.com/mikejsmith1985/forge-terminal
- **Releases:** https://github.com/mikejsmith1985/forge-terminal/releases
- **Issues:** https://github.com/mikejsmith1985/forge-terminal/issues
- **Discussions:** https://github.com/mikejsmith1985/forge-terminal/discussions

---

**Released:** 2025-12-08  
**Version:** v1.19.0  
**Commit:** 8534661  
**Build:** Automated via GitHub Actions

🎉 **Enjoy the new features!**
