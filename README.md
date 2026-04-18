# Forge Terminal

**"One binary, double-click, works."**

Forge Terminal is a standalone, cross-platform terminal application designed for AI-assisted development. It combines a full-featured terminal with "command cards" — saved commands that can be executed or pasted with a single click or keyboard shortcut.

## ✨ Features

### Core Terminal
- **🚀 Single Binary**: No Docker, Node.js, or config files required. Just download and run.
- **💻 Full PTY Terminal**: Real PTY support (xterm.js) for interactive apps like `vim`, `htop`, `claude`, and more.
- **📑 Multi-Tab Support**: Open up to 20 terminal tabs with drag-and-drop reordering. Each tab has its own isolated terminal session.
- **💾 Session Persistence**: Tabs, themes, and positions are restored automatically across restarts.
- **🔍 Terminal Search**: Find text in terminal output with match highlighting.
- **🔐 Tab Isolation**: Each terminal tab has a completely isolated session with independent WebSocket connections and PTY processes.

### Command Cards
- **⚡ Quick Commands**: Save frequently used commands with descriptions and icons.
- **🎭 Emoji & Lucide Icons**: Choose from 40+ colorful emoji icons or professional Lucide icons for command cards.
- **⌨️ Keyboard Shortcuts**: Trigger commands instantly with `Ctrl+Shift+1` through `Ctrl+Shift+9` (and beyond with letters).
- **📋 Paste vs Execute**: Choose to paste commands for editing or execute immediately.
- **🔄 Drag & Drop**: Reorder command cards to your preference.
- **⭐ Favorites**: Mark important commands as favorites.

### AI Integration
- **🤖 Forge Assist**: AI-powered assistance panel integrated into the sidebar for context-aware help.
- **⚡ Persistent Instructions**: 
  - Floating input bar for adding context to CLI prompts
  - Toggle with `Ctrl+I` shortcut
  - Automatically append instruction templates to your prompts
  - Works with any CLI tool (gh copilot, claude, aider, etc.)
  - Configure custom instruction templates in Settings
  - Explicit and reliable - see exactly what gets sent
- **💬 Chat Context**: Full-featured chat interface with terminal output integration.
- **📂 File Context**: Reference project files for deep understanding.

### Theming & Customization
- **🎨 10 Color Themes**: Molten Metal, Deep Ocean, Emerald Forest, Midnight Purple, Rose Gold, Arctic Frost, plus 4 high-contrast accessibility themes.
- **🌗 Per-Tab Theme Controls (NEW v3.12.15)**: 
  - Right-click any tab → Theme submenu
  - Choose from all 10 color themes
  - Toggle between light and dark mode per theme
  - Each tab can have its own unique theme
  - Visual indicator shows current theme
  - Settings panel for global presets and per-tab defaults
- **♿ High-Contrast Themes**: Includes color-blind friendly themes for visual accessibility.
- **📏 Dual Font Controls**: Adjust terminal (8-30px) and assistant chat (8-30px) font sizes independently.
- **📐 Flexible Layout**: Position the command sidebar on the left or right.
- **↔️ Resizable Sidebar**: Drag the sidebar edge to adjust width (200-800px, persists across sessions).

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
- **🎓 Interactive Guided Tour**: First-run experience with interactive guide introducing key features.
- **🔄 Auto-Updates**: Automatic update checking with one-click installation.
- **📜 Version History**: View and rollback to previous versions.
- **📍 Scroll to Bottom**: Quick button to jump to latest output.
- **🔌 Disconnect Reasons**: Clear messages when terminal sessions end.
- **🖥️ Desktop Shortcut**: Create a desktop shortcut from Settings for quick access.
- **✨ Active Tab Indicator**: Rotating "bead of light" animation for visual clarity.

### Terminal Improvements
- **⌨️ Smart Keyboard Shortcuts**: Ctrl+C and Ctrl+V work exactly like VS Code:
  - **Ctrl+C with selection**: Copies text to clipboard (no SIGINT)
  - **Ctrl+C without selection**: Sends SIGINT to interrupt processes
  - **Ctrl+V**: Pastes from clipboard seamlessly
  - Uses xterm's `attachCustomKeyEventHandler` for reliable, native-like behavior

## 🧭 Enterprise Workflow — Understanding AI Compliance

The Enterprise Workflow system provides structured instructions that guide AI behavior in your development sessions — enforcing branching rules, naming conventions, quality gates, and skill cascades as active context the model references when making decisions.

### What "guidance" means in practice

Workflow compliance in Forge is **probabilistic, not deterministic**. The AI interprets your workflow rules as strongly weighted instructions, which is fundamentally different from how a linter or CI gate enforces rules. In most sessions — especially at the start — compliance is high and the workflow meaningfully shapes output quality.

In extended or deeply complex sessions, earlier context (including workflow rules) can be deprioritized as the model's attention shifts toward more recent input. This is an inherent characteristic of how large language models currently manage context, and is not specific to Forge or any particular AI provider.

**In short:**
- Short-to-medium sessions → workflow rules followed reliably
- Long, multi-file, or multi-tool sessions → occasional deviation is possible
- Pre-commit hooks and the compliance checker provide a deterministic backstop for the most critical rules

### Our commitment

We are continuously advancing the workflow enforcement system alongside improvements in AI context management. As models improve their ability to maintain instruction fidelity across longer sessions, compliance will improve accordingly. Our goal is to make the system progressively tighter with each major release.

## Installation

Choose your setup method below. **All options are FREE** (Codespaces includes 120 free hours/month).

### 🧙 Quick Start

**Quickest way to get started:**
```bash
# Download the binary for your platform from releases
# https://github.com/mikejsmith1985/forge-terminal/releases
```

Follow the sections below for your preferred deployment option.

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

Or download a binary from [Releases](https://github.com/mikejsmith1985/forge-terminal/releases).

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
Download `fterm.exe` and double-click it.

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
   - **Right-click a tab** and select "Theme" to choose from 10 color themes and toggle light/dark mode.
   - Use **+/-** buttons to adjust font size.
   - Click the **panel icon** to move sidebar left/right.

5. **Windows Shell Selection**:
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
| `tab-defaults.json` | Per-tab theme preferences and global presets |
| `welcome_shown` | Tracks if welcome screen was shown for current version |

## Version History

See [Release Notes](https://github.com/mikejsmith1985/forge-terminal/releases) for detailed changelogs and downloads.

## License
MIT
