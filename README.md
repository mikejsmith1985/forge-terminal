# Forge Terminal

**"One binary, double-click, works."**

Forge Terminal is a standalone, cross-platform terminal application designed for AI-assisted development. It combines a full-featured terminal with "command cards" - saved commands that can be executed or pasted with a single click or keyboard shortcut.

![Forge Terminal Screenshot](https://via.placeholder.com/800x500?text=Forge+Terminal+Screenshot)

## ✨ Features

### Core Terminal
- **🚀 Single Binary**: No Docker, Node.js, or config files required. Just download and run.
- **💻 Full PTY Terminal**: Real PTY support (xterm.js) for interactive apps like `vim`, `htop`, `claude`, and more.
- **📑 Multi-Tab Support**: Open up to 20 terminal tabs with drag-and-drop reordering.
- **💾 Session Persistence**: Tabs, themes, and positions are restored automatically across restarts.
- **🔍 Terminal Search**: Find text in terminal output with match highlighting.

### Command Cards
- **⚡ Quick Commands**: Save frequently used commands with descriptions and icons.
- **⌨️ Keyboard Shortcuts**: Trigger commands instantly with `Ctrl+Shift+1` through `Ctrl+Shift+9` (and beyond with letters).
- **📋 Paste vs Execute**: Choose to paste commands for editing or execute immediately.
- **🔄 Drag & Drop**: Reorder command cards to your preference.
- **⭐ Favorites**: Mark important commands as favorites.

### Theming & Customization
- **🎨 6 Color Themes**: Molten Metal, Deep Ocean, Emerald Forest, Midnight Purple, Rose Gold, Arctic Frost.
- **🌗 Light/Dark Mode**: Toggle between light and dark modes.
- **📏 Font Size Control**: Adjust terminal font size (10-24px).
- **📐 Flexible Layout**: Position the command sidebar on the left or right.
- **🎯 Per-Tab Themes**: Each tab can have its own color theme.

### Windows-Specific Features
- **🐚 Shell Selection**: Switch between CMD, PowerShell, and WSL.
- **🐧 WSL Integration**: Native WSL support with automatic distro detection.
- **📂 Path Translation**: Automatic conversion of Windows paths to WSL paths.

### Quality of Life
- **🔄 Auto-Updates**: Automatic update checking with one-click installation.
- **📜 Version History**: View and rollback to previous versions.
- **🤖 Prompt Watcher**: Auto-respond to CLI confirmation prompts (per-tab toggle).
- **📍 Scroll to Bottom**: Quick button to jump to latest output.
- **🔌 Disconnect Reasons**: Clear messages when terminal sessions end.

## Installation

Download the latest release for your platform from the [Releases](https://github.com/mikejsmith1985/forge-terminal/releases) page.

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
   - **Execute (▶️)**: Pastes the command and presses Enter.
   - **Paste (📋)**: Pastes the command into the terminal (for editing before running).
   - **Edit (✏️)**: Modify existing commands.
   - **Drag**: Reorder cards by dragging.

4. **Customize Appearance**:
   - Click the **palette icon** to cycle through color themes.
   - Click the **sun/moon icon** to toggle light/dark mode.
   - Use **+/-** buttons to adjust font size.
   - Click the **panel icon** to move sidebar left/right.

5. **Windows Shell Selection**:
   - Click the shell indicator (CMD/PS/WSL) to cycle through shells.
   - Use the **settings gear** for detailed WSL configuration.

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

## Changelog

### v1.6.0 (Latest)
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
