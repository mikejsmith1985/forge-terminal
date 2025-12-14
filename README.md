# Forge Terminal

**"One binary, double-click, works."**

Forge Terminal is a standalone, cross-platform terminal application designed for AI-assisted development. It combines a full-featured terminal with "command cards" - saved commands that can be executed or pasted with a single click or keyboard shortcut.

![Forge Terminal Screenshot](https://via.placeholder.com/800x500?text=Forge+Terminal+Screenshot)

> **🚀 NEW: GitHub Pages Deployment!**  
> Run forge-terminal from your browser on ANY device (Mac, Linux, Windows). See [Installation](#installation) below or try the **[interactive setup wizard](#-interactive-setup-wizard-recommended)**.

## ✨ Features

### Core Terminal
- **🚀 Single Binary**: No Docker, Node.js, or config files required. Just download and run.
- **💻 Full PTY Terminal**: Real PTY support (xterm.js) for interactive apps like `vim`, `htop`, `claude`, and more.
- **📑 Multi-Tab Support**: Open up to 20 terminal tabs with drag-and-drop reordering.
- **💾 Session Persistence**: Tabs, themes, and positions are restored automatically across restarts.
- **🔍 Terminal Search**: Find text in terminal output with match highlighting.

### Command Cards
- **⚡ Quick Commands**: Save frequently used commands with descriptions and icons.
- **🎭 Emoji & Lucide Icons**: Choose from 40+ colorful emoji icons or professional Lucide icons for command cards.
- **⌨️ Keyboard Shortcuts**: Trigger commands instantly with `Ctrl+Shift+1` through `Ctrl+Shift+9` (and beyond with letters).
- **📋 Paste vs Execute**: Choose to paste commands for editing or execute immediately.
- **🔄 Drag & Drop**: Reorder command cards to your preference.
- **⭐ Favorites**: Mark important commands as favorites.

### Theming & Customization
- **🎨 10 Color Themes**: Molten Metal, Deep Ocean, Emerald Forest, Midnight Purple, Rose Gold, Arctic Frost, plus 4 high-contrast accessibility themes.
- **🌗 Per-Tab Light/Dark Mode**: Each tab can independently toggle between light and dark modes (10 themes × 2 modes = 20 unique visuals).
- **♿ High-Contrast Themes**: Includes color-blind friendly themes for visual accessibility.
- **📏 Dual Font Controls**: Adjust terminal (8-30px) and assistant chat (8-30px) font sizes independently with icon toggle.
- **📐 Flexible Layout**: Position the command sidebar on the left or right.
- **↔️ Resizable Sidebar**: Drag the sidebar edge to adjust width (200-800px, persists across sessions).
- **🎯 Per-Tab Themes**: Each tab can have its own color theme.

### Windows-Specific Features
- **🐚 Shell Selection**: Switch between CMD, PowerShell, and WSL.
- **🐧 WSL Integration**: Native WSL support with automatic distro detection.
- **📂 Path Translation**: Automatic conversion of Windows paths to WSL paths and UNC path handling.

### Security & File Access
- **🔐 File Access Modes**: Toggle between restricted (project-scoped) and unrestricted (full filesystem) access.
- **⚠️ Security Prompts**: Confirmation dialogs for sensitive file operations.
- **📂 Project-Scoped Access** (default): File operations limited to the project directory for safety.
- **🔓 Unrestricted Mode**: Optional full filesystem access for advanced users.

### Quality of Life
- **🐛 Debug Panel**: Integrated debug panel in the ribbon with real-time system diagnostics, auto-refresh capability, and one-click feedback reporting. Includes Terminal Info, Focus State, WebSocket status, and viewport details. **Send Feedback** button opens GitHub issue creation with automatic screenshot capture. **NEW in v1.23.0**: Comprehensive **Diagnostic Overlay** for troubleshooting. Captures all keyboard, paste, websocket, and AM events in real-time. 4 intelligent problem detectors identify root causes: double-paste issues, spacebar blocking, stale AM output, and hydration delays. Session export to `~/.forge/diagnostics/` for offline analysis.
- **📖 AM (Artificial Memory)**: Optional per-tab session logging for crash recovery and context restoration. Logs are stored in `./.forge/am/` directory with workspace-aware naming. **NEW in v1.21.0**: Full TUI screen capture for AI CLI tools (Copilot, Claude) with automatic session reconstruction and 70% parsing accuracy + 100% raw snapshot fallback.
- **🔄 Auto-Updates**: Automatic update checking with one-click installation.
- **📜 Version History**: View and rollback to previous versions.
- **🤖 Auto-Respond**: Auto-respond to CLI confirmation prompts (per-tab toggle).
- **📍 Scroll to Bottom**: Quick button to jump to latest output.
- **🔌 Disconnect Reasons**: Clear messages when terminal sessions end.
- **🖥️ Desktop Shortcut**: Create a desktop shortcut from Settings for quick access.
- **✨ Active Tab Indicator**: Rotating "bead of light" animation for visual clarity (v1.20.9+).

### Experimental Features (Dev Mode)
> Enable Dev Mode in Settings to access experimental features.

- **🤖 Forge Assistant** (Experimental): AI-powered chat panel integrated into the sidebar. Requires local Ollama for model inference. Context-aware suggestions based on terminal state.
  - **📚 RAG Knowledge Base** (NEW in v1.22.0): Assistant now includes **comprehensive** Retrieval-Augmented Generation for accurate project-specific answers. Indexes not just documentation but **entire codebase** (Go source, JavaScript/React, configs, scripts) for deep technical understanding. Uses cosine similarity search for relevant context retrieval. Now includes ~280+ files and 1200+ document chunks for maximum accuracy. See `scripts/index-full-codebase.sh` to index your project.
- **👁️ Vision Detection** (Experimental): Real-time pattern detection with interactive overlays and configurable detectors:
  - **Git Status**: Detects `git status` output, shows staged/unstaged/untracked files with quick stage/unstage actions
  - **JSON Blocks**: Identifies JSON in terminal output, pretty-prints with copy actions (configurable minimum size)
  - **File Paths**: Detects file paths, validates existence, provides quick view/edit/list actions
  - **Compiler Errors** (NEW): Detects errors from Go, Rust, TypeScript, Python, Java with context and quick actions
  - **Stack Traces** (NEW): Detects panics and exceptions from Go, Python, Java, JavaScript with frame analysis
  - **Configurable Detectors**: Enable/disable each detector type independently via Vision Settings
  - **Vision-AM Integration** (NEW): All detected errors and warnings are persisted to AM logs. When auto-respond is enabled, Vision can optionally interrupt the workflow on critical errors or silently collect findings for post-session review. Configure in Settings: "Vision-AutoRespond Mode" (strict/lenient)

### Terminal Improvements (v1.22.0)
- **⌨️ Smart Keyboard Shortcuts**: Ctrl+C and Ctrl+V now work exactly like VS Code:
  - **Ctrl+C with selection**: Copies text to clipboard (no SIGINT)
  - **Ctrl+C without selection**: Sends SIGINT to interrupt processes
  - **Ctrl+V**: Pastes from clipboard seamlessly
  - Uses xterm's `attachCustomKeyEventHandler` for reliable, native-like behavior

## Installation

Choose your setup method below. **All options are FREE** (Codespaces includes 120 free hours/month).

### 🧙 Interactive Setup Wizard (Recommended)

**Quickest way to get started:**
```bash
# Download and run the setup wizard
node setup-wizard.js
```

The wizard will ask you 2 simple questions and generate step-by-step instructions for your setup.

**No Node.js?** Just follow the sections below for your preferred option.

---

### 🌐 Web-Based Installation (4 Options)

All options use the GitHub Pages frontend. Choose based on your situation:

#### Option 1️⃣: **LOCAL** (Fastest - Recommended for Daily Use) ✅ FREE
```bash
# Step 1: Download binary from releases
curl -LO https://github.com/mikejsmith1985/forge-terminal/releases/download/v1.x.x/forge-darwin-arm64
chmod +x forge-darwin-arm64

# Step 2: Start backend
./forge-darwin-arm64
# Backend listens on http://localhost:8333

# Step 3: Open frontend
# Visit: https://[username].github.io/forge-terminal/
# (replace [username] with your GitHub username)

# Step 4: Configure API in frontend
# Settings → API Configuration → http://localhost:8333 → Apply
```

**Best for:** Daily development, fastest performance (< 100ms latency)  
**Cost:** FREE forever  
**Works:** As long as your computer is running  

---

#### Option 2️⃣: **EMBEDDED** (Simplest - No Configuration) ✅ FREE
```bash
# Step 1: Download binary from releases (same as above)
curl -LO https://github.com/mikejsmith1985/forge-terminal/releases/download/v1.x.x/forge-darwin-arm64
chmod +x forge-darwin-arm64

# Step 2: Run
./forge-darwin-arm64
# Browser opens automatically at http://localhost:8333
```

**Best for:** Quick setup, don't want to configure API  
**Cost:** FREE forever  
**Works:** As long as your computer is running  
**Note:** Frontend is embedded in binary (no external website access)

---

#### Option 3️⃣: **GITHUB CODESPACES** (Cloud - No Local Install) ✅ FREE (120 hrs/month)
```bash
# Step 1: Create Codespace
# Visit: https://github.com/mikejsmith1985/forge-terminal
# Click: Code → Codespaces → Create codespace on main
# Wait: 2-3 minutes

# Step 2: In Codespace terminal, build & run backend
cd frontend && npm install && cd ..
make run

# Step 3: Expose port 8333
# Press: F1 → Type: "Ports: Expose Port" → Enter 8333
# Copy the forwarded HTTPS URL

# Step 4: Open frontend & configure
# Visit: https://[username].github.io/forge-terminal/
# Settings → API Configuration → [Paste forwarded URL] → Apply
```

**Best for:** Testing without local installation, cloud-based access  
**Cost:** FREE (120 hours/month), then $0.18/hour  
**Works:** In browser from any device  
**Tip:** If you exceed free hours, fall back to LOCAL mode (same features, FREE)

---

#### Option 4️⃣: **SELF-HOSTED** (Advanced - 24/7 Availability) 💰 Custom Cost
```bash
# Step 1: Deploy to your server (DigitalOcean, AWS, etc.)
git clone https://github.com/mikejsmith1985/forge-terminal.git
cd forge-terminal
cd frontend && npm install && npm run build && cd ..
go build -o bin/forge ./cmd/forge

# Step 2: Run with your domain
export ALLOWED_ORIGINS="https://your-domain.com"
./bin/forge

# Step 3: Access from GitHub Pages frontend
# Visit: https://[username].github.io/forge-terminal/
# Settings → API Configuration → https://your-domain.com:8333 → Apply
```

**Best for:** Team sharing, 24/7 availability, production use  
**Cost:** $5-50/month depending on server  
**Works:** 24/7 if server stays running  
**Security:** Full control, custom domain, HTTPS recommended

---

### ⚡ 60-Second Quick Start

**Don't want to read all options?**

1. Download binary: https://github.com/mikejsmith1985/forge-terminal/releases
2. Run it: `./forge-[your-os]`
3. Done! (Embedded mode - everything included)

Or try the wizard: `node setup-wizard.js`

---

### 📊 Quick Comparison

| Feature | LOCAL | EMBEDDED | CODESPACES | SELF-HOSTED |
|---------|-------|----------|-----------|------------|
| **Cost** | FREE | FREE | FREE* | $5-50/mo |
| **Setup Time** | 5 min | 1 min | 10 min | 30 min |
| **Performance** | Excellent | Excellent | Good | Good |
| **Availability** | While running | While running | 120 hrs/mo | 24/7 |
| **Multi-device** | Via URL | Local only | Yes | Yes |
| **Configuration** | Medium | None | Medium | Advanced |
| **Best For** | Daily work | Quick use | Testing | Teams/Prod |

*120 hours/month free, then paid

---

### 📖 Detailed Guides

- **Full guide:** [GitHub Pages Deployment Guide](docs/user/github-pages-deployment.md)
- **Choose your mode:** [Detailed comparison](docs/user/github-pages-deployment.md#three-deployment-modes)
- **Troubleshooting:** [Common issues & fixes](docs/user/github-pages-deployment.md#troubleshooting)

### Windows
Download `forge-windows-amd64.exe` and double-click it.

> **⚠️ Windows Troubleshooting**
> 
> **SmartScreen Warning**: Since the binary isn't code-signed, Windows may show "Windows protected your PC". Click "More info" → "Run anyway", or right-click the file → Properties → check "Unblock" → OK.
>
> **Requirements**: Windows 10 version 1809 (October 2018 Update) or later is required for ConPTY support.
>
> **PowerShell**: The terminal uses CMD by default. Switch to PowerShell or WSL via the shell toggle or settings.
>
> **Firewall**: If the browser opens but shows a connection error, check that your firewall allows localhost connections. The app tries ports 8333, 8080, 9000, 3000, 3333 in order.

### macOS
Download `forge-darwin-amd64` (Intel) or `forge-darwin-arm64` (Apple Silicon).
```bash
chmod +x forge-darwin-*
./forge-darwin-arm64
```

> **⚠️ macOS Gatekeeper Security Warning**
>
> **"Cannot verify developer" error?** This is normal—the binary needs code signing. Choose one:
> 
> **Quick Fix** (Recommended):
> 1. **Right-click** the binary → **Open** → **Open** in the security dialog
> 2. Or use Terminal: `xattr -d com.apple.quarantine ./forge-darwin-arm64 && ./forge-darwin-arm64`
>
> **Full Solution** (No warnings on future updates):
> - Fork the repository and set up code signing with your own Apple Developer ID
> - See [Fork & Self-Sign Guide](docs/developer/macos-fork-setup.md) for instructions
> - Once configured, your releases will be automatically notarized

### Linux
Download `forge-linux-amd64`.
```bash
chmod +x forge-linux-amd64
./forge-linux-amd64
```

## ⌨️ Keyboard Shortcuts

### Tab Management
| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+1-9` | Switch to tab by number |
| `Ctrl+Tab` | Cycle through tabs |
| `Ctrl+Shift+Tab` | Cycle backwards through tabs |

### Terminal
| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Open search bar |
| `Enter` | Find next match (in search) |
| `Shift+Enter` | Find previous match (in search) |
| `Escape` | Close search |
| `Ctrl+End` | Scroll to bottom |

### Command Cards
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+1` | Execute/Paste Command #1 |
| `Ctrl+Shift+2` | Execute/Paste Command #2 |
| `Ctrl+Shift+...` | Execute/Paste Command #N |
| `Ctrl+Shift+0` | Execute/Paste Command #10 |
| `Ctrl+Shift+A-Z` | Execute/Paste Commands #11+ |

## 🚀 Usage

1. **Run the app**: It will automatically open your default browser (typically at `http://127.0.0.1:8333`). If that port is busy, it will try other ports automatically.

2. **Use the Terminal**: Works just like your system terminal. Supports all interactive programs.

3. **Manage Command Cards**:
   - Click **+ Add** to create a new command card.
   - Choose an **emoji** 🎨 or **icon** for visual identification.
   - **Execute (▶️)**: Pastes the command and presses Enter.
   - **Paste (📋)**: Pastes the command into the terminal (for editing before running).
   - **Edit (✏️)**: Modify existing commands.
   - **Drag**: Reorder cards by dragging.

4. **Customize Appearance**:
   - Click the **palette icon** to cycle through 10 color themes.
   - **Right-click a tab** and select "Light Mode" or "Dark Mode" for per-tab themes.
   - Use **+/-** buttons to adjust font size.
   - Click the **panel icon** to move sidebar left/right.

5. **Enable AM Logging** (Optional):
   - Right-click a tab → "AM Logging" to enable session recording.
   - Logs are saved to `./am/` directory.
   - Use the "📖 Summarize Last Session" command card to review previous work.

6. **Windows Shell Selection**:
   - Click the shell indicator (CMD/PS/WSL) to cycle through shells.
   - Use the **settings gear** for detailed WSL configuration.

## 🔄 Updating Forge Terminal

Forge Terminal checks for updates automatically. When an update is available:

1. A notification toast appears in the bottom-right corner
2. Click **"View Update"** or click the download icon in the sidebar
3. The Update modal opens showing the new version and release notes
4. Click **"Update Now"** to download and apply the update
5. A **new browser tab** opens automatically with the updated version
6. The old tab remains open but becomes unresponsive (the server process has been replaced)

**After the update:**
- **Close the old tab** and continue using the new tab with the updated version, OR
- **Press Refresh (F5 or Ctrl+R)** in the old tab to reconnect to the new server

If the spacebar or other features don't work in a tab after an update, simply refresh that tab to reconnect with the new server.

## 📚 Documentation

All project documentation is organized by audience and type:

- **[User Documentation](docs/user/)** - For end users using Forge Terminal
  - Getting started guides
  - Feature documentation
  - Troubleshooting and FAQ

- **[Developer Documentation](docs/developer/)** - For developers contributing to Forge Terminal
  - Development setup and local build guides
  - Architecture overview
  - Release process and automation
  - Contributing guidelines

- **[Release History](https://github.com/mikejsmith1985/forge-terminal/releases)** - All version releases with detailed changelogs
  - Pre-built binaries for all platforms
  - Complete release notes and migration guides

See [docs/README.md](docs/README.md) for detailed information about the documentation structure.

## 🛠️ Development

### Prerequisites
- Go 1.21+
- Node.js 18+ (for frontend build)

### Build from Source

```bash
# 1. Clone the repo
git clone https://github.com/mikejsmith1985/forge-terminal.git
cd forge-terminal

# 2. Build Frontend
cd frontend
npm install
npm run build
cd ..

# 3. Build Binary
go build -o bin/forge ./cmd/forge

# 4. Run
./bin/forge
```

### Run Tests

```bash
# Unit tests
cd frontend && npm run test

# End-to-end tests (requires Playwright)
cd frontend && npx playwright test
```

### Cross-Platform Build
```bash
make build-all
```

## 📁 Configuration

Forge Terminal stores configuration in `~/.forge/`:

| File | Purpose |
|------|---------|
| `commands.json` | Saved command cards |
| `config.json` | Shell and app settings |
| `sessions.json` | Tab state for session restore |
| `welcome_shown` | Tracks if welcome screen was shown for current version |

AM logs are stored in the working directory:
- `./am/` - Active session logs (Markdown format)
- `./am_archive/` - Archived logs from completed sessions

## Changelog

### v1.20.0 (Current)
- **Vision-AM Integration**: All Vision findings (errors, warnings, patterns) persisted to AM logs
- **Configurable Vision-AutoRespond**: Choose between strict (interrupt) or lenient (collect) modes
- **Insights API**: New endpoint for accessing Vision insights from sessions
- **Post-Session Review**: Review all Vision findings after command execution completes
- **Error Detection Enhancements**: Improved parsing of compiler errors and stack traces

### v1.19.1
- **Resizable Sidebar**: Drag sidebar edge horizontally to adjust width (persists)
- **Dual Font Controls**: Independent font size adjustment for terminal and assistant chat (8-30px range)
- **Experimental Assistant**: Dev Mode toggle for AI chat panel with Ollama integration
- **Experimental Vision**: JSON detection in terminal output (visual improvements pending)

### v1.16.1
- **Update Modal Cleanup**: Removed dead hard-refresh code that never executed
- **16 New Unit Tests**: Comprehensive test coverage for update flow
- **Improved Documentation**: Clear README guide for updating and spacebar recovery
- **Better UX Messages**: "Update applied. New version launching in new tab..." message

### v1.9.0 (Latest)
- **Per-Tab Light/Dark Mode**: Each tab can independently toggle between light and dark modes (20 unique visual combinations)
- **Emoji Icons**: 40+ colorful emoji icons for command cards alongside existing Lucide icons
- **High-Contrast Accessibility Themes**: 4 new themes including color-blind friendly options (10 total themes)
- **Desktop Shortcut Creation**: Create desktop shortcuts from Settings > Installation
- **Enhanced Welcome Screen**: Updated with AM, Auto-Respond, Self-Naming Tabs, and accessibility info

### v1.8.0
- **Desktop Shortcut**: Create shortcuts from Settings modal
- **4 High-Contrast Themes**: Accessibility-focused themes for visual impairments
- **Welcome Screen Enhancements**: Added feature descriptions for AM, Auto-Respond, and Self-Naming Tabs

### v1.7.0
- **AM (Artificial Memory)**: Per-tab session logging for crash recovery
- **Self-Naming Tabs**: Tabs automatically rename to current working directory
- **Auto-Respond**: Per-tab toggle for CLI confirmation prompt automation

### v1.6.0
- **Welcome Screen**: First-launch splash screen with feature overview
- **Enhanced Documentation**: Comprehensive README with all features documented
- **Prompt Watcher**: Auto-respond to CLI confirmation prompts (per-tab toggle)
- **Disconnect Reasons**: Clear messages when terminal sessions end

### v1.5.7
- Bug fixes for tab creation and theme application
- Improved prompt watcher reliability

### v1.5.0
- **Session Persistence**: Tabs are now restored automatically when you refresh or restart the app
- **Terminal Search**: Find text in terminal output with `Ctrl+F` (prev/next navigation, highlights matches)

### v1.4.2
- Per-tab color theming
- Bug fixes for max tabs warning

### v1.4.0
- Multi-tab terminal support (up to 20 tabs)
- Tab keyboard shortcuts (`Ctrl+T`, `Ctrl+W`, `Ctrl+1-9`)

### v1.3.9
- 6 color themes
- Sidebar positioning (left/right)
- Font size controls
- Auto-update system

## License
MIT
